#!/usr/bin/env python3
"""Resultado final por município a partir dos arquivos agregados do TSE
(votacao_candidato_munzona_<ano>.zip + detalhe_votacao_munzona_<ano>.zip),
lidos via HTTP Range (só os membros necessários, sem baixar o zip inteiro).

Gera data/processed/mun_<ano>_t<turno>_c<cargo>[_<UF>].csv.gz com colunas:
  uf, cd_mun, nm_mun, secoes, aptos, comp, brancos, nulos, c<NR>...
e atualiza data/processed/candidatos.json.

Uso:
  python process_munzona.py --ano 2022 --turnos 1 --cargo 1            # presidente (arquivo _BR)
  python process_munzona.py --ano 2022 --turnos 1 --cargo 3 --ufs SP,BA # governador por UF
"""
import argparse
import gzip
import io
import json
import os
import sys
import time

import polars as pl

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from httpzip import open_remote_zip  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "data", "processed")
BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele"
CHUNK = 96 << 20


def read_member(zipurl, member, cols, cargo):
    z = open_remote_zip(zipurl)
    names = z.namelist()
    if member not in names:
        raise SystemExit(f"{member} não está em {zipurl}: {names[:5]}...")
    parts = []
    with z.open(member) as f:
        header = f.readline()
        hdr = [h.strip().strip('"') for h in header.decode("latin-1").strip().split(";")]
        use = [c for c in cols if c in hdr]
        rest = b""
        while True:
            buf = f.read(CHUNK)
            data = rest + buf
            if buf:
                cut = data.rfind(b"\n") + 1
                data, rest = data[:cut], data[cut:]
            if data.strip():
                df = pl.read_csv(io.BytesIO((header + data).decode("latin-1").encode()),
                                 separator=";", columns=use, infer_schema_length=0)
                df = df.filter(pl.col("CD_CARGO") == str(cargo))
                if df.height:
                    parts.append(df)
            if not buf:
                break
    return pl.concat(parts) if parts else None


def write_gz(df, path):
    with gzip.open(path, "wb", compresslevel=9) as f:
        df.write_csv(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", required=True)
    ap.add_argument("--turnos", default="1")
    ap.add_argument("--cargo", type=int, default=1)
    ap.add_argument("--ufs", default="BR")
    ap.add_argument("--no-mun", action="store_true",
                    help="só atualiza anulados.json (não grava mun_*/candidatos)")
    a = ap.parse_args()
    cand_zip = f"{BASE}/votacao_candidato_munzona/votacao_candidato_munzona_{a.ano}.zip"
    det_zip = f"{BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_{a.ano}.zip"
    ccols = ["NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_ZONA", "CD_CARGO", "NR_CANDIDATO",
             "NM_URNA_CANDIDATO", "QT_VOTOS_NOMINAIS", "QT_VOTOS_NOMINAIS_VALIDOS", "ST_VOTO_EM_TRANSITO"]
    dcols = ["NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_ZONA", "CD_CARGO", "QT_APTOS",
             "QT_SECOES_PRINCIPAIS", "QT_SECOES", "QT_COMPARECIMENTO", "QT_VOTOS_BRANCOS",
             "QT_TOTAL_VOTOS_NULOS", "QT_VOTOS_NULOS", "QT_VOTOS_ANULADOS_APU_SEP", "QT_VOTOS_ANULADOS"]
    turnos = [t for t in a.turnos.split(",")]
    candp = os.path.join(OUT, "candidatos.json")
    cands = json.load(open(candp)) if os.path.exists(candp) else {}
    anp = os.path.join(OUT, "anulados.json")
    anul = json.load(open(anp)) if os.path.exists(anp) else {}
    for uf in a.ufs.split(","):
        t0 = time.time()
        c = read_member(cand_zip, f"votacao_candidato_munzona_{a.ano}_{uf}.csv", ccols, a.cargo)
        d = read_member(det_zip, f"detalhe_votacao_munzona_{a.ano}_{uf}.csv", dcols, a.cargo)
        vcol = "QT_VOTOS_NOMINAIS_VALIDOS" if "QT_VOTOS_NOMINAIS_VALIDOS" in c.columns else "QT_VOTOS_NOMINAIS"
        ncol = "QT_TOTAL_VOTOS_NULOS" if "QT_TOTAL_VOTOS_NULOS" in d.columns else "QT_VOTOS_NULOS"
        scol = "QT_SECOES_PRINCIPAIS" if "QT_SECOES_PRINCIPAIS" in d.columns else "QT_SECOES"
        c = c.with_columns(pl.col("CD_MUNICIPIO").cast(pl.Int64), pl.col(vcol).cast(pl.Int64),
                           pl.col("QT_VOTOS_NOMINAIS").cast(pl.Int64),
                           pl.col("NR_CANDIDATO").cast(pl.Int64))
        d = d.with_columns([pl.col(x).cast(pl.Int64) for x in ["CD_MUNICIPIO", "QT_APTOS", scol,
                                                                "QT_COMPARECIMENTO", "QT_VOTOS_BRANCOS", ncol]])
        for t in turnos:
            ct = c.filter(pl.col("NR_TURNO") == t)
            dt = d.filter(pl.col("NR_TURNO") == t)
            if not ct.height:
                print(f"sem dados turno {t} {uf}")
                continue
            meta = dt.group_by(["SG_UF", "CD_MUNICIPIO"]).agg(
                pl.col("NM_MUNICIPIO").first().alias("nm_mun"),
                pl.col(scol).sum().alias("secoes"),
                pl.col("QT_APTOS").sum().alias("aptos"),
                pl.col("QT_COMPARECIMENTO").sum().alias("comp"),
                pl.col("QT_VOTOS_BRANCOS").sum().alias("brancos"),
                pl.col(ncol).sum().alias("nulos"),
            )
            tot = ct.group_by("NR_CANDIDATO").agg(pl.col(vcol).sum(), pl.col("NM_URNA_CANDIDATO").first()).sort(vcol, descending=True)
            nrs = [r[0] for r in tot.iter_rows() if r[1] > 0]
            v = (ct.with_columns(("c" + pl.col("NR_CANDIDATO").cast(pl.Utf8)).alias("col"))
                 .group_by(["SG_UF", "CD_MUNICIPIO", "col"]).agg(pl.col(vcol).sum())
                 .pivot(on="col", index=["SG_UF", "CD_MUNICIPIO"], values=vcol))
            ccs = [f"c{n}" for n in sorted(nrs)]
            m = meta.join(v, on=["SG_UF", "CD_MUNICIPIO"], how="full", coalesce=True)
            m = m.with_columns([pl.col(x).fill_null(0) for x in ccs]).rename({"SG_UF": "uf", "CD_MUNICIPIO": "cd_mun"})
            m = m.select(["uf", "cd_mun", "nm_mun", "secoes", "aptos", "comp", "brancos", "nulos"] + ccs).sort(["uf", "cd_mun"])
            tag = f"{a.ano}_t{t}_c{a.cargo}" + ("" if uf == "BR" else f"_{uf}")
            an = (ct.group_by("NR_CANDIDATO").agg(pl.col("QT_VOTOS_NOMINAIS").sum().alias("nom"), pl.col(vcol).sum().alias("val"),
                                                  pl.col("NM_URNA_CANDIDATO").first())
                  .filter(pl.col("nom") > pl.col("val")))
            anul[tag] = {str(r[0]): {"nome": r[3], "votos_nominais": r[1], "votos_validos": r[2]} for r in an.iter_rows()}
            # candidatos que aparecem no BWEB mas não têm votos válidos no oficial (ex.: viraram "nulo técnico")
            bw = dict(cands.get(tag, {}))
            bwp = os.path.join(ROOT, "data", "raw", f"candidatos_bweb_{a.ano}_t{t}.json")
            if os.path.exists(bwp):
                bw.update(json.load(open(bwp)).get(tag, {}))
            validos = {str(r[0]) for r in tot.iter_rows() if r[1] > 0}
            for nr, nm in bw.items():
                if nr not in validos and nr not in anul[tag]:
                    anul[tag][nr] = {"nome": nm, "votos_nominais": None, "votos_validos": 0,
                                     "obs": "ausente/zerado no oficial; no BWEB aparece como nominal (nulo técnico)"}
            if a.no_mun:
                print(tag, "anulados:", anul[tag])
                continue
            write_gz(m, os.path.join(OUT, f"mun_{tag}.csv.gz"))
            cands[tag] = {str(r[0]): r[2] for r in tot.iter_rows() if r[1] > 0}
            for nr, nm in bw.items():  # nomes de candidatos anulados que existem nas timelines BWEB
                cands[tag].setdefault(nr, nm)
            s = m.select(pl.exclude("uf", "cd_mun", "nm_mun")).sum().row(0, named=True)
            top = ", ".join(f"{k}={s[k]}" for k in sorted(ccs, key=lambda k: -s[k])[:4])
            print(f"{tag}: {m.height} mun, aptos={s['aptos']} comp={s['comp']} br={s['brancos']} nu={s['nulos']} {top} ({time.time()-t0:.0f}s)", flush=True)
    if not a.no_mun:
        json.dump(dict(sorted(cands.items())), open(candp, "w"), ensure_ascii=False, indent=1)
    json.dump(dict(sorted(anul.items())), open(anp, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
