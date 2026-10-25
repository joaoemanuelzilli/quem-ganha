# Dados históricos do TSE — o que existe e como regenerar

Fonte: portal de dados abertos do TSE (CKAN, `https://dadosabertos.tse.jus.br`), arquivos em
`https://cdn.tse.jus.br/estatistica/sead/...`. Tudo foi conferido contra os totais oficiais
(ver `data/processed/sanity.md`).

## Ambiente

```bash
~/.local/bin/uv venv training/.venv --python 3.12
~/.local/bin/uv pip install --python training/.venv/bin/python pandas pyarrow requests polars
```

## Scripts (`training/`)

| script | o que faz |
|---|---|
| `download_tse.py` | lista/baixa recursos de um pacote CKAN por regex (`get resultados-2022-boletim-de-urna 'bweb_2t_.*\.zip$'`) para `data/raw/<pacote>/` |
| `httpzip.py` | lê membros de ZIPs remotos via HTTP Range (sem baixar o zip inteiro) |
| `process_bweb.py` | BWEB (boletim de urna, 1 linha por votável×seção) → `timeline_*`, `mun_*`, `candidatos.json`, e `data/raw/sections_*.parquet` |
| `process_munzona.py` | `votacao_candidato_munzona` + `detalhe_votacao_munzona` (agregados oficiais) → `mun_*` e `anulados.json` |
| `process_hist.py` | histórico oficial de totalização (snapshots publicados na noite, só Presidente 2022) → `hist_*` |
| `export_sections.py` | `sections_*.parquet` → `sections_*.csv.gz` (1 linha por BU) |
| `sanity.py` | gera `data/processed/sanity.md` (totais vs oficial, distribuição de chegada, curvas da apuração) |
| `run_all.sh` | sequência completa de comandos usada para gerar tudo |

## Arquivos produzidos (`data/processed/`, CSV gzip, separador `,`, UTF-8, com cabeçalho)

Convenção de nome: `<tipo>_<ano>_t<turno>_c<cargo>[_<UF>]` — cargo 1 = Presidente, 3 = Governador.

### `timeline_<ano>_t<turno>_c<cargo>[_<UF>].csv.gz` — ordem de chegada dos BUs
Agregado por `(uf, cd_mun, minute)`:

`uf, cd_mun, minute, secoes, aptos, comp, brancos, nulos, c<NR>...`

- `minute` = floor((DT_BU_RECEBIDO − 17:00 de Brasília do dia da eleição) / 60 s). Pode ser negativo
  (exterior/ZZ: BUs da Ásia/Oceania chegam antes das 17h; o TSE só divulga a partir das 17:00 →
  no backtest trate `minute < 0` como 0).
- `DT_BU_RECEBIDO` está em horário de Brasília (validado: 1º BU fora do exterior chega às 17:01 em 2022 2T,
  17:08 em 2026 1T; e a curva coincide minuto a minuto com o histórico oficial publicado, ver sanity.md §3).
- `secoes` = nº de BUs (urnas) que chegaram naquele minuto; `aptos`/`comp` = eleitores aptos e
  comparecimento dessas seções (deduplicados por seção×cargo); `brancos`, `nulos`; `c<NR>` = votos
  nominais (+ legenda, se houvesse) do candidato número NR.
- Presidente: todas as UFs + `ZZ` (exterior, `cd_mun` = código TSE da cidade no exterior).
- Governador: um arquivo por UF.
- `cd_mun` = código TSE de 5 dígitos (inteiro, sem zeros à esquerda), **não** é o código IBGE.

Disponíveis: `2022_t2_c1`, `2022_t2_c3_<UF>` (12 UFs com 2º turno: AL AM BA ES MS PB PE RO RS SC SE SP),
`2022_t1_c1`, `2022_t1_c3_<mesmas 12 UFs>`, `2026_t1_c1`, `2026_t1_c3_<27 UFs>`.

`timeline_2018_t2_c1_encerramento.csv.gz`: **2018 não tem DT_BU_RECEBIDO** no BWEB. Este arquivo usa
DT_ENCERRAMENTO (hora local da urna) + fuso da UF (AC +2h; AM, MT, MS, RO, RR +1h; demais 0; ZZ excluído)
como proxy. Quase tudo encerra 17:00–17:05 local, então **não serve para ordenar a apuração**. Em 2018
as urnas fechavam às 17h LOCAIS (não unificado) e o TSE só começou a divulgar após 19h de Brasília.

### `mun_<ano>_t<turno>_c<cargo>[_<UF>].csv.gz` — resultado final por município
`uf, cd_mun, nm_mun, secoes, aptos, comp, brancos, nulos, c<NR>...`

| arquivo | origem |
|---|---|
| `mun_2022_t2_c1`, `mun_2022_t2_c3_<UF>`, `mun_2026_t1_c1`, `mun_2026_t1_c3_<UF>`, `mun_2018_t2_c1` | BWEB (consistente com a timeline: soma da timeline = mun) |
| `mun_2022_t1_c1`, `mun_2022_t1_c3_<12 UFs>`, `mun_2018_t1_c1` | munzona oficial (QT_VOTOS_NOMINAIS_VALIDOS; `secoes` = QT_SECOES_PRINCIPAIS; `nulos` = QT_TOTAL_VOTOS_NULOS, inclui nulos técnicos/anulados) |

### `sections_<ano>_t<turno>_c1.csv.gz` — nível seção (1 linha por BU), ordenado pela chegada
`uf, cd_mun, zona, secao, sec, aptos, comp, brancos, nulos, c<NR>...` — `sec` = segundos desde 17:00
de Brasília. Disponíveis: `2022_t2_c1`, `2022_t1_c1`, `2026_t1_c1`. Chave da seção: `(uf, zona, secao)`
(permite cruzar 1º×2º turno da mesma eleição).

### `hist_2022_t<turno>_c1.csv.gz` — histórico OFICIAL de totalização (o que o TSE publicou)
`dt, sec, secoes_total, secoes_acum, pct_secoes, aptos_acum, comp_acum, validos_acum, brancos_acum, nulos_acum, c<NR>_acum...`
(um snapshot por atualização, valores acumulados; `pct_secoes` em fração 0–1). Só existe para Presidente 2022.

### `candidatos.json`
`{"<ano>_t<turno>_c<cargo>[_<UF>]": {"<NR>": "NOME DE URNA", ...}}`, ordenado por votos.

### `anulados.json`
Candidatos cujos votos aparecem como nominais no BWEB mas **não** são válidos na totalização oficial
(candidatura indeferida/cancelada → votos anulados ou "nulos técnicos"). Para reproduzir o oficial a partir
dos arquivos BWEB, some esses `c<NR>` em `nulos`. Exemplos: 2026 1T Presidente `c28` (Leonardo Avalanche,
5.246 votos); 2026 1T Gov RJ `c10` (Garotinho — com isso Douglas Ruas passa de 49,3% para 50,9% e vence no 1º turno);
2022 1T Gov SE `c22` (Valmir de Francisquinho).

### `municipios_tse_ibge.csv.gz`
`uf, cd_mun, cd_ibge, nm_mun, nm_ibge` — de-para oficial TSE→IBGE (5.571 municípios, sem ZZ), do pacote
`codigos-oficiais-de-uf-e-municipios-segundo-o-tse-e-o-ibge`. Todas as linhas de `mun_2026_t1_c1` (exceto ZZ) casam.

### `sanity.md`
Totais nacionais vs. oficial, distribuição de horário de chegada, curva da apuração (participação
do candidato A entre os dois líderes a 1/5/10/25/50/75/90/99% das seções) e validação contra o histórico oficial.

## Intermediários (`data/raw/`, não versionar)
- zips baixados (`resultados-<ano>-boletim-de-urna/`), `hist/`
- `sections_<tag>.parquet` (inclui `dt`, `dt_enc_local`, `tipo_urna`, todas as UFs/cargos processados)
- `stats_bweb_*.json`, `candidatos_bweb_*.json`, logs.

## Observações / armadilhas
- 2022 e 2026: encerramento unificado às 17h de Brasília. 2018: 17h local.
- Layouts diferem por ano: 2018 tem cabeçalho `"SG_ UF"` (com espaço) e não tem DT_BU_RECEBIDO/DT_EMISSAO_BU;
  2026 usa datas ISO (`2026-10-04 18:25:49`) e números sem aspas. `process_bweb.py` trata os três.
- Linhas com 0 votos não existem no BWEB (uma seção sem brancos não tem linha "Branco").
- O BWEB lista só seções com BU; seções não instaladas aparecem (2018) com `tipo_urna = "Não instalada"`.
- Leitura: latin-1 → UTF-8 em blocos de 96 MB, filtrando o cargo (o BWEB do 1º turno tem deputados e é enorme: 2026 1T ≈ 5 GB zipado).
