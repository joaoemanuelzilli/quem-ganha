#!/usr/bin/env bash
# Regenera todos os arquivos de data/processed a partir do portal do TSE.
set -euo pipefail
cd "$(dirname "$0")"
PY=.venv/bin/python
GOV22=AL,AM,BA,ES,MS,PB,PE,RO,RS,SC,SE,SP
ALL=AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO
R=../data/raw

# 1) downloads BWEB
$PY download_tse.py get resultados-2022-boletim-de-urna 'bweb_2t_.*\.zip$' --workers 8
$PY download_tse.py get resultados-2022-boletim-de-urna 'bweb_1t_.*\.zip$' --workers 5
$PY download_tse.py get resultados-2026-boletim-de-urna 'bweb_1t_.*\.zip$' --workers 5
$PY download_tse.py get resultados-2018-boletim-de-urna 'BWEB_2t_.*\.zip$' --workers 6

# 2) BWEB -> timeline/mun/sections
$PY process_bweb.py --ano 2022 --turno 2 --data 2022-10-30 --cargos 1,3 --zips "$R/resultados-2022-boletim-de-urna/bweb_2t_*.zip"
$PY process_bweb.py --ano 2022 --turno 1 --data 2022-10-02 --cargos 1,3 --gov-ufs $GOV22 --no-mun --zips "$R/resultados-2022-boletim-de-urna/bweb_1t_*.zip"
$PY process_bweb.py --ano 2026 --turno 1 --data 2026-10-04 --cargos 1,3 --zips "$R/resultados-2026-boletim-de-urna/bweb_1t_*.zip"
$PY process_bweb.py --ano 2018 --turno 2 --data 2018-10-28 --cargos 1 --proxy-encerramento --zips "$R/resultados-2018-boletim-de-urna/BWEB_2t_*.zip"

# 3) agregados oficiais (munzona) para 1º turno 2022/2018 e lista de anulados
$PY process_munzona.py --ano 2022 --turnos 1 --cargo 1 --ufs BR
$PY process_munzona.py --ano 2022 --turnos 1 --cargo 3 --ufs $GOV22
$PY process_munzona.py --ano 2018 --turnos 1 --cargo 1 --ufs BR
$PY process_munzona.py --ano 2022 --turnos 2 --cargo 1 --ufs BR --no-mun
$PY process_munzona.py --ano 2018 --turnos 2 --cargo 1 --ufs BR --no-mun
$PY process_munzona.py --ano 2026 --turnos 1 --cargo 1 --ufs BR --no-mun
$PY process_munzona.py --ano 2026 --turnos 1 --cargo 3 --ufs $ALL --no-mun

# 4) histórico oficial de totalização, nível seção e sanity
$PY process_hist.py 2022 2
$PY process_hist.py 2022 1
$PY export_sections.py 2022_t2_c1 2022_t1_c1 2026_t1_c1
# de-para TSE->IBGE
mkdir -p $R/ibge && curl -s -o $R/ibge/municipio_tse_ibge.zip https://cdn.tse.jus.br/estatistica/sead/odsele/municipio_tse_ibge/municipio_tse_ibge.zip
$PY -c "
import zipfile,io,gzip,polars as pl
z=zipfile.ZipFile('$R/ibge/municipio_tse_ibge.zip')
df=pl.read_csv(io.BytesIO(z.read('municipio_tse_ibge.csv').decode('latin-1').encode()),separator=';',infer_schema_length=0)
out=df.select(pl.col('SG_UF').alias('uf'),pl.col('CD_MUNICIPIO_TSE').cast(pl.Int64).alias('cd_mun'),pl.col('CD_MUNICIPIO_IBGE').cast(pl.Int64).alias('cd_ibge'),pl.col('NM_MUNICIPIO_TSE').alias('nm_mun'),pl.col('NM_MUNICIPIO_IBGE').alias('nm_ibge')).sort('uf','cd_mun')
out.write_csv(gzip.open('../data/processed/municipios_tse_ibge.csv.gz','wb'))
"
$PY sanity.py > /dev/null
