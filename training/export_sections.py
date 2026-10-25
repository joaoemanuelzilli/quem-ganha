#!/usr/bin/env python3
"""Exporta o nível seção (1 linha por BU) para data/processed/sections_<tag>.csv.gz,
ordenado pela chegada (sec = segundos desde 17:00 de Brasília; negativo = exterior antes das 17h).
Uso: python export_sections.py 2022_t2_c1 2026_t1_c1 ..."""
import gzip
import os
import sys
from datetime import datetime

import polars as pl

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATAS = {"2022_t1": "2022-10-02", "2022_t2": "2022-10-30", "2026_t1": "2026-10-04", "2018_t2": "2018-10-28"}
for tag in sys.argv[1:]:
    s = pl.read_parquet(os.path.join(ROOT, "data", "raw", f"sections_{tag}.parquet"))
    base = datetime.strptime(DATAS[tag[:7]] + " 17:00:00", "%Y-%m-%d %H:%M:%S")
    cc = sorted([c for c in s.columns if c.startswith("c") and c[1:].isdigit() and s[c].sum() > 0], key=lambda c: int(c[1:]))
    out = (s.with_columns(((pl.col("dt") - pl.lit(base)).dt.total_seconds()).cast(pl.Int64).alias("sec"))
           .select(["uf", "cd_mun", "zona", "secao", "sec", "aptos", "comp", "brancos", "nulos"] + cc)
           .sort(["sec", "uf", "cd_mun", "zona", "secao"], nulls_last=True))
    p = os.path.join(ROOT, "data", "processed", f"sections_{tag}.csv.gz")
    with gzip.open(p, "wb", compresslevel=9) as f:
        out.write_csv(f)
    print(p, out.shape, f"{os.path.getsize(p)/1e6:.1f} MB")
