#!/usr/bin/env python3
"""Histórico oficial de totalização (snapshots publicados pelo TSE na noite da
eleição) -> data/processed/hist_<ano>_t<turno>_c1.csv.gz

Só existe para Presidente/BR 2022 (1º e 2º turnos) no portal.
Colunas: dt (horário de Brasília), sec (segundos desde 17:00), secoes_total,
secoes_acum, pct_secoes, aptos_acum, comp_acum (QT_VOTOS_TOTAL_ACUMULADO),
validos_acum, brancos_acum, nulos_acum, c<NR>_acum ...

Uso: python process_hist.py 2022 2 [zip]
"""
import gzip
import io
import json
import os
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import datetime

import polars as pl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "data", "processed")
RAW = os.path.join(ROOT, "data", "raw", "hist")
URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes{ano}/Historico_Totalizacao_Presidente_BR_{t}T_{ano}.zip"
DATAS = {("2022", "1"): "2022-10-02", ("2022", "2"): "2022-10-30"}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(ch if ch.isalnum() else "_" for ch in s.upper().replace("'", "")).strip("_")


def main():
    ano, turno = sys.argv[1], sys.argv[2]
    os.makedirs(RAW, exist_ok=True)
    zp = sys.argv[3] if len(sys.argv) > 3 else os.path.join(RAW, f"Historico_Totalizacao_Presidente_BR_{turno}T_{ano}.zip")
    if not os.path.exists(zp):
        urllib.request.urlretrieve(URL.format(ano=ano, t=turno), zp)
    z = zipfile.ZipFile(zp)
    m = [n for n in z.namelist() if n.endswith(".csv")][0]
    txt = z.read(m).decode("latin-1").encode()
    df = pl.read_csv(io.BytesIO(txt), separator=";", infer_schema_length=0)
    df = df.rename({c: c.strip() for c in df.columns}).with_columns(pl.all().str.strip_chars())
    cands = json.load(open(os.path.join(OUT, "candidatos.json")))[f"{ano}_t{turno}_c1"]
    name2nr = {norm(v).replace("_", ""): k for k, v in cands.items()}
    base = datetime.strptime(DATAS[(ano, turno)] + " 17:00:00", "%Y-%m-%d %H:%M:%S")
    dt = pl.col("DT_TOTALIZACAO").str.strptime(pl.Datetime, "%d/%m/%Y %H:%M:%S")
    cols = [
        dt.dt.strftime("%Y-%m-%d %H:%M:%S").alias("dt"),
        ((dt - pl.lit(base)).dt.total_seconds()).cast(pl.Int64).alias("sec"),
        pl.col("QT_SECOES_TOTAL").cast(pl.Int64).alias("secoes_total"),
        pl.col("QT_SECOES_TOT_ACUMULADO").cast(pl.Int64).alias("secoes_acum"),
        pl.col("PE_SECOES_TOT_ACUMULADO").str.replace(",", ".").cast(pl.Float64).alias("pct_secoes"),
        pl.col("QT_APTOS_TOT_ACUMULADO").cast(pl.Int64).alias("aptos_acum"),
        pl.col("QT_VOTOS_TOTAL_ACUMULADO").cast(pl.Int64).alias("comp_acum"),
        pl.col("QT_VOTOS_CONCORRENTES_ACUMULADO").cast(pl.Int64).alias("validos_acum"),
        pl.col("BRANCO_QT_VOTOS_TOT_ACUMULADO").cast(pl.Int64).alias("brancos_acum"),
        pl.col("NULO_QT_VOTOS_TOT_ACUMULADO").cast(pl.Int64).alias("nulos_acum"),
    ]
    unmatched = []
    cc = []
    for c in df.columns:
        if c.endswith("_QT_VOTOS_TOT_ACUMULADO") and not c.startswith(("BRANCO", "NULO")):
            nm = c[: -len("_QT_VOTOS_TOT_ACUMULADO")]
            nr = name2nr.get(nm.replace("_", ""))
            if nr is None:
                unmatched.append(nm)
                continue
            cc.append((int(nr), pl.col(c).cast(pl.Int64).alias(f"c{nr}_acum")))
    cols += [e for _, e in sorted(cc, key=lambda x: x[0])]
    out = df.select(cols).sort("sec")
    p = os.path.join(OUT, f"hist_{ano}_t{turno}_c1.csv.gz")
    with gzip.open(p, "wb", compresslevel=9) as f:
        out.write_csv(f)
    print(p, out.shape, "nao_mapeados:", unmatched)
    print(out.head(2))
    print(out.tail(2))


if __name__ == "__main__":
    main()
