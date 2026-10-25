#!/usr/bin/env python3
"""Processa arquivos BWEB (boletim de urna) do TSE em:
  - data/raw/sections_<tag>.parquet  (1 linha por seção; intermediário, não versionado)
  - data/processed/timeline_<tag>.csv.gz  (agregado por uf, cd_mun, minuto de chegada)
  - data/processed/mun_<tag>.csv.gz       (resultado final por município)
  - data/processed/candidatos.json        (atualizado com os nomes dos candidatos)

tag = <ano>_t<turno>_c<cargo>[_<UF>]

Uso:
  python process_bweb.py --ano 2022 --turno 2 --data 2022-10-30 --cargos 1,3 \
      --zips '../data/raw/resultados-2022-boletim-de-urna/bweb_2t_*.zip' \
      [--gov-ufs SP,BA,...]  (cargo 3: gera um arquivo por UF)

--zips aceita glob local ou um arquivo .txt com URLs (lidas via HTTP Range, sem disco).
"""
import argparse
import concurrent.futures as cf
import glob
import gzip
import io
import json
import os
import sys
import threading
import time
import zipfile
from datetime import datetime

import polars as pl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "processed")

COLS = [
    "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO_PERGUNTA",
    "DT_BU_RECEBIDO", "QT_APTOS", "QT_COMPARECIMENTO", "DS_TIPO_VOTAVEL", "NR_VOTAVEL",
    "NM_VOTAVEL", "QT_VOTOS", "DS_TIPO_URNA", "DT_ENCERRAMENTO",
]
# fuso (horas a somar ao horário LOCAL da urna para obter horário de Brasília) - só usado
# no modo --proxy-encerramento (2018 não tem DT_BU_RECEBIDO). Sem horário de verão em out/2018.
UF_OFFSET = {"AC": 2, "AM": 1, "MT": 1, "MS": 1, "RO": 1, "RR": 1}
# nomes alternativos usados em layouts antigos (2018)
ALIASES = {
    "CD_CARGO_PERGUNTA": ["CD_CARGO_PERGUNTA", "CODIGO_CARGO", "CD_CARGO"],
    "DS_TIPO_URNA": ["DS_TIPO_URNA", "TIPO_URNA"],
    "SG_UF": ["SG_UF", "SG_ UF"],
}

CHUNK = 96 << 20
_lock = threading.Lock()


def log(*a):
    with _lock:
        print(time.strftime("%H:%M:%S"), *a, flush=True)


def open_zip(src):
    if src.startswith("http"):
        sys.path.insert(0, HERE)
        from httpzip import open_remote_zip

        return open_remote_zip(src)
    return zipfile.ZipFile(src)


def iter_chunks(src, cargos):
    """Gera DataFrames polars (colunas COLS, strings) filtrados por cargo."""
    z = open_zip(src)
    members = [n for n in z.namelist() if n.lower().endswith(".csv")]
    for m in members:
        with z.open(m) as f:
            header = f.readline()
            hdr = [h.strip().strip('"') for h in header.decode("latin-1").strip().split(";")]
            rename = {}
            for c in COLS:
                for alt in ALIASES.get(c, [c]):
                    if alt in hdr:
                        rename[alt] = c
                        break
            missing = [c for c in COLS if c not in rename.values()]
            use = list(rename.keys())
            rest = b""
            while True:
                buf = f.read(CHUNK)
                if not buf and not rest:
                    break
                data = rest + buf
                if buf:
                    cut = data.rfind(b"\n") + 1
                    data, rest = data[:cut], data[cut:]
                else:
                    rest = b""
                if not data.strip():
                    if not buf:
                        break
                    continue
                txt = (header + data).decode("latin-1").encode("utf-8")
                df = pl.read_csv(
                    io.BytesIO(txt), separator=";", columns=use, infer_schema_length=0,
                    quote_char='"', truncate_ragged_lines=True,
                ).rename(rename)
                del txt
                for c in missing:
                    df = df.with_columns(pl.lit(None, dtype=pl.Utf8).alias(c))
                df = df.filter(pl.col("CD_CARGO_PERGUNTA").is_in([str(c) for c in cargos]))
                if df.height:
                    yield df.select(COLS)
                if not buf:
                    break


def load_uf(src, cargos):
    t0 = time.time()
    parts = list(iter_chunks(src, cargos))
    if not parts:
        log("vazio", os.path.basename(src))
        return None
    df = pl.concat(parts)
    log(f"lido {os.path.basename(src)}: {df.height} linhas em {time.time()-t0:.0f}s")
    return df


def to_sections(df, eleicao_data, proxy=False):
    """Long (linhas BU) -> wide por seção."""
    base = datetime.strptime(eleicao_data + " 17:00:00", "%Y-%m-%d %H:%M:%S")
    df = df.with_columns(
        pl.col("CD_MUNICIPIO").cast(pl.Int64),
        pl.col("NR_ZONA").cast(pl.Int64),
        pl.col("NR_SECAO").cast(pl.Int64),
        pl.col("CD_CARGO_PERGUNTA").cast(pl.Int64),
        pl.col("QT_APTOS").cast(pl.Int64),
        pl.col("QT_COMPARECIMENTO").cast(pl.Int64),
        pl.col("QT_VOTOS").cast(pl.Int64, strict=False),
        pl.col("NR_VOTAVEL").cast(pl.Int64, strict=False),
        pl.when(pl.col("DT_BU_RECEBIDO").is_in(["#NULO#", "", "-1"]))
        .then(None)
        .otherwise(pl.col("DT_BU_RECEBIDO"))
        .alias("dt_raw"),
    )
    df = df.with_columns(
        pl.coalesce(
            pl.col("dt_raw").str.strptime(pl.Datetime, "%d/%m/%Y %H:%M:%S", strict=False),
            pl.col("dt_raw").str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S", strict=False),
        ).alias("dt"),
        pl.coalesce(
            pl.col("DT_ENCERRAMENTO").str.strptime(pl.Datetime, "%d/%m/%Y %H:%M:%S", strict=False),
            pl.col("DT_ENCERRAMENTO").str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S", strict=False),
        ).alias("dt_enc_local"),
    )
    tipo = pl.col("DS_TIPO_VOTAVEL")
    df = df.with_columns(
        pl.when(tipo == "Branco").then(pl.lit("brancos"))
        .when(tipo.is_in(["Nominal", "Legenda"]) & (pl.col("NR_VOTAVEL") < 95)).then(pl.lit("c") + pl.col("NR_VOTAVEL").cast(pl.Utf8))
        .otherwise(pl.lit("nulos"))
        .alias("col")
    )
    keys = ["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO_PERGUNTA"]
    meta = df.group_by(keys).agg(
        pl.col("NM_MUNICIPIO").first(),
        pl.col("dt").min(),
        pl.col("dt_enc_local").max(),
        pl.col("QT_APTOS").max(),
        pl.col("QT_COMPARECIMENTO").max(),
        pl.col("DS_TIPO_URNA").first(),
    )
    votes = df.group_by(keys + ["col"]).agg(pl.col("QT_VOTOS").sum())
    wide = votes.pivot(on="col", index=keys, values="QT_VOTOS")
    sec = meta.join(wide, on=keys, how="left")
    cand_cols = sorted([c for c in sec.columns if c.startswith("c") and c[1:].isdigit()], key=lambda c: int(c[1:]))
    for c in ["brancos", "nulos"]:
        if c not in sec.columns:
            sec = sec.with_columns(pl.lit(0, dtype=pl.Int64).alias(c))
    sec = sec.with_columns([pl.col(c).fill_null(0) for c in ["brancos", "nulos"] + cand_cols])
    if proxy:
        off = pl.col("SG_UF").replace_strict(UF_OFFSET, default=0, return_dtype=pl.Int64)
        sec = sec.with_columns(
            pl.when(pl.col("SG_UF") == "ZZ").then(None)
            .otherwise(pl.col("dt_enc_local") + pl.duration(hours=off)).alias("dt"))
    sec = sec.with_columns(
        ((pl.col("dt") - pl.lit(base)).dt.total_seconds() // 60).cast(pl.Int64).alias("minute")
    )
    sec = sec.rename({
        "SG_UF": "uf", "CD_MUNICIPIO": "cd_mun", "NM_MUNICIPIO": "nm_mun", "NR_ZONA": "zona",
        "NR_SECAO": "secao", "CD_CARGO_PERGUNTA": "cargo", "QT_APTOS": "aptos",
        "QT_COMPARECIMENTO": "comp", "DS_TIPO_URNA": "tipo_urna",
    })
    names = (
        df.filter(tipo.is_in(["Nominal", "Legenda"]))
        .group_by(["CD_CARGO_PERGUNTA", "SG_UF", "NR_VOTAVEL", "DS_TIPO_VOTAVEL"])
        .agg(pl.col("NM_VOTAVEL").first(), pl.col("QT_VOTOS").sum())
    )
    return sec, cand_cols, names


def write_gz(df, path):
    with gzip.open(path, "wb", compresslevel=9) as f:
        df.write_csv(f)


def write_outputs(sec, tag, cand_cols, tl_suffix="", no_mun=False):
    os.makedirs(OUT, exist_ok=True)
    # remove colunas de candidatos sem votos neste recorte
    cand_cols = [c for c in cand_cols if c in sec.columns and sec[c].sum() > 0]
    agg = [pl.len().alias("secoes"), pl.col("aptos").sum(), pl.col("comp").sum(),
           pl.col("brancos").sum(), pl.col("nulos").sum()] + [pl.col(c).sum() for c in cand_cols]
    sec.write_parquet(os.path.join(RAW, f"sections_{tag}.parquet"))
    have = sec.filter(pl.col("minute").is_not_null())
    tl = have.group_by(["uf", "cd_mun", "minute"]).agg(agg).sort(["minute", "uf", "cd_mun"])
    p = os.path.join(OUT, f"timeline_{tag}{tl_suffix}.csv.gz")
    write_gz(tl, p)
    mun = (sec.group_by(["uf", "cd_mun"]).agg([pl.col("nm_mun").first()] + agg)
           .sort(["uf", "cd_mun"]))
    p2 = os.path.join(OUT, f"mun_{tag}.csv.gz")
    if not no_mun:
        write_gz(mun, p2)
    nmiss = sec.height - have.height
    log(f"{tag}: secoes={sec.height} sem_dt={nmiss} timeline_rows={tl.height} mun_rows={mun.height}")
    return {"tag": tag, "secoes": sec.height, "sem_dt": nmiss, "timeline_rows": tl.height,
            "mun_rows": mun.height}


def update_candidatos(entries):
    p = os.path.join(OUT, "candidatos.json")
    with _lock:
        d = json.load(open(p)) if os.path.exists(p) else {}
        d.update(entries)
        json.dump(dict(sorted(d.items())), open(p, "w"), ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", required=True)
    ap.add_argument("--turno", required=True)
    ap.add_argument("--data", required=True, help="data da eleição YYYY-MM-DD")
    ap.add_argument("--cargos", default="1")
    ap.add_argument("--zips", required=True)
    ap.add_argument("--gov-ufs", default="")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--proxy-encerramento", action="store_true",
                    help="sem DT_BU_RECEBIDO (2018): usa DT_ENCERRAMENTO local + fuso da UF; timeline_*_encerramento")
    ap.add_argument("--no-mun", action="store_true", help="não grava mun_*.csv.gz nem candidatos (ex.: já gerados via munzona)")
    ap.add_argument("--delete-after", action="store_true", help="apaga zip local após processar")
    a = ap.parse_args()
    cargos = [int(c) for c in a.cargos.split(",")]
    if a.zips.endswith(".txt"):
        srcs = [l.strip() for l in open(a.zips) if l.strip()]
    else:
        srcs = sorted(glob.glob(a.zips))
    log(f"{len(srcs)} arquivos, cargos={cargos}")

    def work(src):
        df = load_uf(src, cargos)
        if df is None:
            return None
        sec, _, names = to_sections(df, a.data, a.proxy_encerramento)
        if a.delete_after and not src.startswith("http"):
            os.remove(src)
        return sec, names

    secs, names = [], []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for r in ex.map(work, srcs):
            if r:
                secs.append(r[0])
                names.append(r[1])
    sec = pl.concat(secs, how="diagonal_relaxed")
    names = pl.concat(names)
    cand_cols = sorted([c for c in sec.columns if c.startswith("c") and c[1:].isdigit()], key=lambda c: int(c[1:]))
    sec = sec.with_columns([pl.col(c).fill_null(0) for c in cand_cols])
    stats = []
    cands = {}
    sfx = "_encerramento" if a.proxy_encerramento else ""
    for cargo in cargos:
        s = sec.filter(pl.col("cargo") == cargo)
        if not s.height:
            continue
        nm = names.filter(pl.col("CD_CARGO_PERGUNTA") == cargo)
        if cargo == 1:
            tag = f"{a.ano}_t{a.turno}_c{cargo}"
            stats.append(write_outputs(s, tag, cand_cols, sfx, a.no_mun))
            g = nm.group_by("NR_VOTAVEL").agg(pl.col("NM_VOTAVEL").first(), pl.col("QT_VOTOS").sum()).sort("QT_VOTOS", descending=True)
            cands[tag] = {str(r[0]): r[1] for r in g.iter_rows()}
        else:
            ufs = a.gov_ufs.split(",") if a.gov_ufs else sorted(s["uf"].unique().to_list())
            for uf in ufs:
                su = s.filter(pl.col("uf") == uf)
                if not su.height:
                    continue
                tag = f"{a.ano}_t{a.turno}_c{cargo}_{uf}"
                stats.append(write_outputs(su, tag, cand_cols, sfx, a.no_mun))
                g = nm.filter(pl.col("SG_UF") == uf).group_by("NR_VOTAVEL").agg(pl.col("NM_VOTAVEL").first(), pl.col("QT_VOTOS").sum()).sort("QT_VOTOS", descending=True)
                cands[tag] = {str(r[0]): r[1] for r in g.iter_rows()}
    if not a.no_mun:
        update_candidatos(cands)
    else:
        json.dump(cands, open(os.path.join(RAW, f"candidatos_bweb_{a.ano}_t{a.turno}.json"), "w"), ensure_ascii=False, indent=1)
    sp = os.path.join(RAW, f"stats_bweb_{a.ano}_t{a.turno}.json")
    json.dump(stats, open(sp, "w"), indent=1)
    log("fim", json.dumps(stats))


if __name__ == "__main__":
    main()
