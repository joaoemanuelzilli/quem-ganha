#!/usr/bin/env python3
"""Gera data/processed/sanity.md: totais nacionais vs. oficiais, distribuição
dos horários de chegada dos BUs e a curva da apuração (participação do
candidato A entre os dois líderes ao longo da contagem)."""
import glob
import json
import os
from datetime import datetime, timedelta

import polars as pl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "data", "processed")

OFICIAL = {
    "2022_t2_c1": {"13": 60345999, "22": 58206354},
    "2022_t1_c1": {"13": 57259504, "22": 51072345},
    "2018_t2_c1": {"17": 57797847, "13": 47040906},
    "2018_t1_c1": {"17": 49277010, "13": 31342051},
    "2026_t1_c1": {"22": 56104503, "13": 53879538, "_validos": 119300788},
}
# (A, B, data da eleição, rótulo)
CURVAS = [
    ("2022_t2_c1", "13", "22", "2022-10-30", "2022 2T (Lula x Bolsonaro)"),
    ("2022_t1_c1", "13", "22", "2022-10-02", "2022 1T (Lula x Bolsonaro)"),
    ("2026_t1_c1", "13", "22", "2026-10-04", "2026 1T (Lula x Flávio)"),
    ("2018_t2_c1_encerramento", "13", "17", "2018-10-28", "2018 2T (Haddad x Bolsonaro) — PROXY DT_ENCERRAMENTO"),
]
PCTS = [1, 5, 10, 25, 50, 75, 90, 99]


def hhmm(data, minute):
    t = datetime.strptime(data + " 17:00", "%Y-%m-%d %H:%M") + timedelta(minutes=int(minute))
    return t.strftime("%H:%M")


def ccols(df):
    return [c for c in df.columns if c.startswith("c") and c[1:].isdigit()]


def curve(tl, A, B, data, pcts=PCTS):
    g = (tl.with_columns(pl.col("minute").clip(lower_bound=0))
         .group_by("minute").agg(pl.col(["secoes", f"c{A}", f"c{B}"] + [c for c in ccols(tl) if c not in (f"c{A}", f"c{B}")]).sum())
         .sort("minute"))
    cand = ccols(tl)
    g = g.with_columns([pl.col(c).cum_sum().alias(c) for c in ["secoes"] + cand])
    g = g.with_columns(pl.sum_horizontal(cand).alias("val"))
    tot_s = g["secoes"][-1]
    finalA = g[f"c{A}"][-1] / (g[f"c{A}"][-1] + g[f"c{B}"][-1])
    finalV = g["val"][-1]
    rows = []
    for p in pcts:
        r = g.filter(pl.col("secoes") >= p / 100 * tot_s).row(0, named=True)
        a, b = r[f"c{A}"], r[f"c{B}"]
        rows.append((p, r["minute"], hhmm(data, r["minute"]), 100 * r["secoes"] / tot_s,
                     100 * r["val"] / finalV, 100 * a / (a + b)))
    # trocas de liderança
    g = g.with_columns((pl.col(f"c{A}") > pl.col(f"c{B}")).alias("Alead"))
    flips = []
    prev = None
    for r in g.iter_rows(named=True):
        if prev is not None and r["Alead"] != prev:
            flips.append((r["minute"], hhmm(data, r["minute"]), 100 * r["secoes"] / tot_s, "A" if r["Alead"] else "B"))
        prev = r["Alead"]
    return rows, 100 * finalA, flips, tot_s


def main():
    L = ["# Sanity check dos dados históricos do TSE", "",
         f"Gerado em {datetime.now():%Y-%m-%d %H:%M} por training/sanity.py.", ""]
    cands = json.load(open(os.path.join(OUT, "candidatos.json")))

    L += ["## 1. Totais nacionais (arquivos mun_*) vs. oficial", "",
          "| arquivo | seções | aptos | comparec. | brancos | nulos | válidos (soma c*) | top-2 | oficial | ok? |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for p in sorted(glob.glob(os.path.join(OUT, "mun_*_c1.csv.gz"))):
        tag = os.path.basename(p)[4:-7]
        m = pl.read_csv(p)
        s = m.select(pl.exclude("uf", "cd_mun", "nm_mun")).sum().row(0, named=True)
        cc = sorted(ccols(m), key=lambda c: -s[c])
        val = sum(s[c] for c in cc)
        top = "; ".join(f"{c[1:]} {cands.get(tag, {}).get(c[1:], '')}: {s[c]:,} ({100*s[c]/val:.2f}%)" for c in cc[:2])
        of = OFICIAL.get(tag, {})
        ok = all(s.get("c" + k) == v for k, v in of.items() if not k.startswith("_"))
        ofs = "; ".join(f"{k}: {v:,}" for k, v in of.items())
        L.append(f"| {tag} | {s['secoes']:,} | {s['aptos']:,} | {s['comp']:,} | {s['brancos']:,} | {s['nulos']:,} | {val:,} | {top} | {ofs} | {'✅' if ok and of else ('—' if not of else '❌')} |")
    L += ["", "Observações:",
          "- 2026 1T: a soma dos c* do BU (119.306.034) excede o total oficial de válidos (119.300.788) em exatamente os votos de `c28` (LEONARDO AVALANCHE, 5.246): votos dele foram anulados na totalização oficial. Para comparar com o oficial, trate c28 como nulo.",
          "- `secoes` nos arquivos derivados do BWEB = nº de BUs (seções principais com urna); nos derivados do munzona (2022 1T, 2018 1T) = QT_SECOES_PRINCIPAIS.",
          "- `nulos` (munzona) = QT_TOTAL_VOTOS_NULOS (inclui nulos técnicos/anulados sub judice). Ex.: SE 2022 1T governador tem nulos altos porque os votos de Valmir de Francisquinho (22) foram anulados.",
          ""]

    # governadores
    L += ["### Governadores (soma dos arquivos mun_*_c3_*)", "", "| arquivo | seções | comparec. | 1º | 2º |", "|---|---|---|---|---|"]
    for p in sorted(glob.glob(os.path.join(OUT, "mun_*_c3_*.csv.gz"))):
        tag = os.path.basename(p)[4:-7]
        m = pl.read_csv(p)
        s = m.select(pl.exclude("uf", "cd_mun", "nm_mun")).sum().row(0, named=True)
        cc = sorted(ccols(m), key=lambda c: -s[c])
        val = sum(s[c] for c in cc)
        tops = [f"{c[1:]} {cands.get(tag, {}).get(c[1:], '')} {100*s[c]/val:.2f}%" for c in cc[:2]]
        L.append(f"| {tag} | {s['secoes']:,} | {s['comp']:,} | {tops[0]} | {tops[1] if len(tops) > 1 else ''} |")
    L.append("")

    # distribuição temporal
    L += ["## 2. Horário de chegada dos BUs (DT_BU_RECEBIDO, horário de Brasília)", "",
          "minute = floor((DT_BU_RECEBIDO − 17:00 do dia da eleição)/60 s). Valores negativos = exterior (ZZ) cujos BUs chegaram antes das 17h; o TSE só divulga a partir das 17:00, então no backtest trate minute<0 como 0.", "",
          "| timeline | seções c/ horário | 1º BU fora ZZ | % seções até 17:10 | 17:30 | 18:00 | 19:00 | 20:00 | 22:00 | último BU (min) |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    tl_cache = {}
    for p in sorted(glob.glob(os.path.join(OUT, "timeline_*_c1*.csv.gz"))):
        tag = os.path.basename(p)[9:-7]
        tl = pl.read_csv(p)
        tl_cache[tag] = tl
        tot = tl["secoes"].sum()
        nz = tl.filter(pl.col("uf") != "ZZ")
        first = nz["minute"].min()
        fr = lambda m: 100 * tl.filter(pl.col("minute") < m)["secoes"].sum() / tot
        L.append(f"| {tag} | {tot:,} | {first} | {fr(10):.1f}% | {fr(30):.1f}% | {fr(60):.1f}% | {fr(120):.1f}% | {fr(180):.1f}% | {fr(300):.1f}% | {tl['minute'].max()} |")
    L.append("")
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "raw", "stats_bweb_*.json"))):
        st = json.load(open(p))
        miss = [(s["tag"], s["sem_dt"]) for s in st if s["sem_dt"]]
        L.append(f"- {os.path.basename(p)}: seções sem DT_BU_RECEBIDO: {miss if miss else 'nenhuma'}")
    L.append("")

    # curvas
    L += ["## 3. Curva da apuração (presidente, nacional)", "",
          "Para cada eleição: minuto (desde 17:00) em que X% das seções (BUs) já haviam chegado, % dos votos válidos finais já contados nesse momento e a participação de A entre os dois (A/(A+B)) acumulada até ali.", ""]
    for tag, A, B, data, label in CURVAS:
        if tag not in tl_cache:
            L.append(f"### {label}\n\n(arquivo timeline_{tag} ausente)\n")
            continue
        base = tag.replace("_encerramento", "")
        nmA = cands.get(base, {}).get(A, A)
        nmB = cands.get(base, {}).get(B, B)
        rows, finalA, flips, tot = curve(tl_cache[tag], A, B, data)
        L += [f"### {label}", "", f"A = {A} {nmA}; B = {B} {nmB}. Final A/(A+B) = **{finalA:.2f}%**.", "",
              "| % seções | minuto | hora | % seções (real) | % válidos contados | A/(A+B) | dif. vs final (p.p.) |", "|---|---|---|---|---|---|---|"]
        for p, mi, hh, ps, pv, sa in rows:
            L.append(f"| {p}% | {mi} | {hh} | {ps:.1f}% | {pv:.1f}% | {sa:.2f}% | {sa-finalA:+.2f} |")
        if flips:
            fl = "; ".join(f"min {m} ({h}, {ps:.1f}% seções) → lidera {w}" for m, h, ps, w in flips[-6:])
            L += ["", f"Trocas de liderança (últimas): {fl}"]
        L.append("")

    # comparação com histórico oficial
    for t, data in [("2", "2022-10-30"), ("1", "2022-10-02")]:
        hp = os.path.join(OUT, f"hist_2022_t{t}_c1.csv.gz")
        if not os.path.exists(hp):
            continue
        h = pl.read_csv(hp)
        L += [f"### Validação: histórico OFICIAL de totalização 2022 {t}T (hist_2022_t{t}_c1) vs curva dos BUs", "",
              "Snapshots publicados pelo TSE (segundo a segundo). Compara o horário em que o TSE publicou X% das seções com o horário em que X% dos BUs haviam chegado (DT_BU_RECEBIDO).", "",
              "| % seções | hora oficial | Lula/(Lula+Bolso) oficial | hora BUs | Lula/(L+B) BUs |", "|---|---|---|---|---|"]
        tag = f"2022_t{t}_c1"
        rows = curve(tl_cache[tag], "13", "22", data)[0] if tag in tl_cache else None
        for i, p in enumerate(PCTS):
            r = h.filter(pl.col("pct_secoes") >= p / 100).row(0, named=True) if h.filter(pl.col("pct_secoes") >= p / 100).height else None
            if r is None:
                continue
            sa = 100 * r["c13_acum"] / (r["c13_acum"] + r["c22_acum"])
            bu = f"| {rows[i][2]} | {rows[i][5]:.2f}% |" if rows else "| — | — |"
            L.append(f"| {p}% | {r['dt'][11:16]} | {sa:.2f}% {bu}")
        L.append("")

    # governadores 2T 2022
    gl = sorted(glob.glob(os.path.join(OUT, "timeline_2022_t2_c3_*.csv.gz")))
    if gl:
        L += ["## 4. Curvas — governadores 2022 2T (A = vencedor)", "",
              "| UF | A | B | final A% | A% @10% seções | @25% | @50% | @75% | @90% | última troca de liderança |", "|---|---|---|---|---|---|---|---|---|---|"]
        for p in gl:
            tag = os.path.basename(p)[9:-7]
            tl = pl.read_csv(p)
            s = {c: tl[c].sum() for c in ccols(tl)}
            A, B = [c[1:] for c in sorted(s, key=lambda c: -s[c])[:2]]
            rows, finalA, flips, _ = curve(tl, A, B, "2022-10-30", [10, 25, 50, 75, 90])
            fl = f"min {flips[-1][0]} ({flips[-1][2]:.0f}% seções)" if flips else "nenhuma"
            nm = cands.get(tag, {})
            L.append(f"| {tag[-2:]} | {A} {nm.get(A,'')} | {B} {nm.get(B,'')} | {finalA:.2f}% | " + " | ".join(f"{r[5]:.1f}%" for r in rows) + f" | {fl} |")
        L.append("")
    open(os.path.join(OUT, "sanity.md"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
