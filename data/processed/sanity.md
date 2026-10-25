# Sanity check dos dados históricos do TSE

Gerado em 2026-10-25 11:02 por training/sanity.py.

## 1. Totais nacionais (arquivos mun_*) vs. oficial

| arquivo | seções | aptos | comparec. | brancos | nulos | válidos (soma c*) | top-2 | oficial | ok? |
|---|---|---|---|---|---|---|---|---|---|
| 2018_t1_c1 | 454,490 | 147,306,295 | 117,364,654 | 3,106,937 | 7,206,222 | 107,050,749 | 17 JAIR BOLSONARO: 49,277,010 (46.03%); 13 FERNANDO HADDAD: 31,342,051 (29.28%) | 17: 49,277,010; 13: 31,342,051 | ✅ |
| 2018_t2_c1 | 454,490 | 147,306,294 | 115,933,451 | 2,486,593 | 8,608,105 | 104,838,753 | 17 JAIR BOLSONARO: 57,797,847 (55.13%); 13 FERNANDO HADDAD: 47,040,906 (44.87%) | 17: 57,797,847; 13: 47,040,906 | ✅ |
| 2022_t1_c1 | 472,075 | 156,454,011 | 123,682,372 | 1,964,779 | 3,487,874 | 118,229,719 | 13 LULA: 57,259,504 (48.43%); 22 JAIR BOLSONARO: 51,072,345 (43.20%) | 13: 57,259,504; 22: 51,072,345 | ✅ |
| 2022_t2_c1 | 472,028 | 156,453,354 | 124,252,796 | 1,769,678 | 3,930,765 | 118,552,353 | 13 LULA: 60,345,999 (50.90%); 22 JAIR BOLSONARO: 58,206,354 (49.10%) | 13: 60,345,999; 22: 58,206,354 | ✅ |
| 2026_t1_c1 | 499,206 | 158,745,007 | 125,275,835 | 2,300,798 | 3,669,003 | 119,306,034 | 22 FLAVIO BOLSONARO: 56,104,503 (47.03%); 13 LULA: 53,879,538 (45.16%) | 22: 56,104,503; 13: 53,879,538; _validos: 119,300,788 | ✅ |

Observações:
- 2026 1T: a soma dos c* do BU (119.306.034) excede o total oficial de válidos (119.300.788) em exatamente os votos de `c28` (LEONARDO AVALANCHE, 5.246): votos dele foram anulados na totalização oficial. Para comparar com o oficial, trate c28 como nulo.
- `secoes` nos arquivos derivados do BWEB = nº de BUs (seções principais com urna); nos derivados do munzona (2022 1T, 2018 1T) = QT_SECOES_PRINCIPAIS.
- `nulos` (munzona) = QT_TOTAL_VOTOS_NULOS (inclui nulos técnicos/anulados sub judice). Ex.: SE 2022 1T governador tem nulos altos porque os votos de Valmir de Francisquinho (22) foram anulados.

### Governadores (soma dos arquivos mun_*_c3_*)

| arquivo | seções | comparec. | 1º | 2º |
|---|---|---|---|---|
| 2022_t1_c3_AL | 6,626 | 1,802,791 | 15 PAULO DANTAS 46.64% | 44 RODRIGO CUNHA 26.79% |
| 2022_t1_c3_AM | 7,454 | 2,110,875 | 44 WILSON LIMA 42.86% | 15 EDUARDO BRAGA 21.01% |
| 2022_t1_c3_BA | 34,424 | 8,866,459 | 13 JERÔNIMO 49.45% | 44 ACM NETO 40.80% |
| 2022_t1_c3_ES | 9,239 | 2,311,629 | 40 RENATO CASAGRANDE 46.94% | 22 MANATO 38.48% |
| 2022_t1_c3_MS | 6,912 | 1,552,654 | 28 CAPITÃO CONTAR 26.77% | 45 EDUARDO RIEDEL 25.22% |
| 2022_t1_c3_PB | 9,602 | 2,551,876 | 40 JOÃO 39.66% | 45 PEDRO CUNHA LIMA 23.90% |
| 2022_t1_c3_PE | 20,572 | 5,732,289 | 77 MARÍLIA ARRAES 23.97% | 45 RAQUEL LYRA 20.58% |
| 2022_t1_c3_RO | 4,198 | 925,763 | 44 CORONEL MARCOS ROCHA 38.88% | 22 MARCOS ROGERIO 37.05% |
| 2022_t1_c3_RS | 27,201 | 6,883,341 | 22 ONYX LORENZONI 37.50% | 45 EDUARDO LEITE 26.81% |
| 2022_t1_c3_SC | 16,242 | 4,471,619 | 22 JORGINHO MELLO 38.62% | 13 DÉCIO LIMA 17.42% |
| 2022_t1_c3_SE | 5,498 | 1,362,604 | 13 ROGÉRIO CARVALHO 44.70% | 55 FÁBIO 38.91% |
| 2022_t1_c3_SP | 101,073 | 27,147,847 | 10 TARCÍSIO 42.32% | 13 FERNANDO HADDAD 35.70% |
| 2022_t2_c3_AL | 6,626 | 1,782,407 | 15 PAULO DANTAS 52.33% | 44 RODRIGO CUNHA 47.67% |
| 2022_t2_c3_AM | 7,453 | 2,065,079 | 44 WILSON LIMA 56.65% | 15 EDUARDO BRAGA 43.35% |
| 2022_t2_c3_BA | 34,424 | 8,964,244 | 13 JERÔNIMO 52.79% | 44 ACM NETO 47.21% |
| 2022_t2_c3_ES | 9,239 | 2,318,350 | 40 RENATO CASAGRANDE 53.80% | 22 MANATO 46.20% |
| 2022_t2_c3_MS | 6,912 | 1,547,610 | 45 EDUARDO RIEDEL 56.90% | 28 CAPITÃO CONTAR 43.10% |
| 2022_t2_c3_PB | 9,602 | 2,569,106 | 40 JOÃO 52.51% | 45 PEDRO CUNHA LIMA 47.49% |
| 2022_t2_c3_PE | 20,572 | 5,795,359 | 45 RAQUEL LYRA 58.70% | 77 MARÍLIA ARRAES 41.30% |
| 2022_t2_c3_RO | 4,198 | 925,563 | 44 CORONEL MARCOS ROCHA 52.47% | 22 MARCOS ROGERIO 47.53% |
| 2022_t2_c3_RS | 27,201 | 6,924,603 | 45 EDUARDO LEITE 57.12% | 22 ONYX LORENZONI 42.88% |
| 2022_t2_c3_SC | 16,242 | 4,527,781 | 22 JORGINHO MELLO 70.69% | 13 DÉCIO LIMA 29.31% |
| 2022_t2_c3_SE | 5,498 | 1,353,538 | 55 FÁBIO 51.70% | 13 ROGÉRIO CARVALHO 48.30% |
| 2022_t2_c3_SP | 101,073 | 27,341,816 | 10 TARCÍSIO 55.27% | 13 FERNANDO HADDAD 44.73% |
| 2026_t1_c3_AC | 2,270 | 487,971 | 11 MAILZA ASSIS 49.76% | 10 ALAN RICK 32.27% |
| 2026_t1_c3_AL | 7,101 | 1,935,820 | 45 JHC 52.20% | 15 RENAN FILHO 47.37% |
| 2026_t1_c3_AM | 8,157 | 2,232,271 | 55 OMAR AZIZ 40.63% | 22 PROFESSORA MARIA DO CARMO 24.49% |
| 2026_t1_c3_AP | 1,914 | 476,019 | 55 DR. FURLAN 62.75% | 44 CLÉCIO 36.97% |
| 2026_t1_c3_BA | 35,476 | 9,046,179 | 13 JERÔNIMO RODRIGUES 55.80% | 44 ACM NETO 43.72% |
| 2026_t1_c3_CE | 23,765 | 5,905,522 | 13 ELMANO DE FREITAS 53.19% | 45 CIRO GOMES 46.22% |
| 2026_t1_c3_DF | 6,969 | 1,817,921 | 11 CELINA LEÃO 49.68% | 13 LEANDRO GRASS 34.30% |
| 2026_t1_c3_ES | 9,844 | 2,348,612 | 10 LORENZO PAZOLINI 49.65% | 15 RICARDO FERRAÇO 34.06% |
| 2026_t1_c3_GO | 15,686 | 3,966,488 | 15 DANIEL VILELA 59.17% | 22 WILDER MORAIS 21.96% |
| 2026_t1_c3_MA | 18,093 | 4,158,395 | 55 EDUARDO BRAIDE 54.02% | 15 ORLEANS BRANDÃO 34.76% |
| 2026_t1_c3_MG | 52,062 | 12,627,167 | 10 CLEITINHO AZEVEDO 55.40% | 13 PATRUS ANANIAS 26.34% |
| 2026_t1_c3_MS | 7,106 | 1,539,009 | 11 EDUARDO RIEDEL 67.07% | 13 FÁBIO TRAD 23.68% |
| 2026_t1_c3_MT | 8,287 | 2,049,718 | 10 OTAVIANO PIVETTA 60.77% | 22 WELLINGTON FAGUNDES 23.19% |
| 2026_t1_c3_PA | 20,827 | 5,062,750 | 20 DR. DANIEL 51.36% | 15 HANA GHASSAN 46.53% |
| 2026_t1_c3_PB | 10,712 | 2,677,904 | 11 LUCAS RIBEIRO 64.28% | 22 EFRAIM FILHO 24.17% |
| 2026_t1_c3_PE | 21,418 | 5,905,236 | 55 RAQUEL LYRA 53.27% | 40 JOÃO CAMPOS 44.82% |
| 2026_t1_c3_PI | 10,225 | 2,239,386 | 13 RAFAEL FONTELES 70.90% | 11 JOEL RODRIGUES 27.54% |
| 2026_t1_c3_PR | 27,142 | 6,829,615 | 22 SERGIO MORO 50.10% | 55 SANDRO ALEX 25.37% |
| 2026_t1_c3_RJ | 37,675 | 9,845,867 | 22 DOUGLAS RUAS 49.27% | 55 EDUARDO PAES 42.76% |
| 2026_t1_c3_RN | 8,115 | 2,167,714 | 44 ALLYSON 36.90% | 13 CADU DE LULA 36.12% |
| 2026_t1_c3_RO | 4,698 | 990,313 | 22 MARCOS ROGÉRIO 56.86% | 55 ADAILTON FURIA 20.06% |
| 2026_t1_c3_RR | 1,519 | 331,959 | 22 ARTHUR HENRIQUE 69.13% | 10 SOLDADO SAMPAIO 29.25% |
| 2026_t1_c3_RS | 27,547 | 6,697,424 | 22 ZUCCO 58.05% | 12 JULIANA BRIZOLA 31.65% |
| 2026_t1_c3_SC | 17,326 | 4,634,550 | 22 JORGINHO MELLO 68.98% | 40 GELSON MERÍSIO 15.66% |
| 2026_t1_c3_SE | 5,923 | 1,436,609 | 55 FÁBIO 57.71% | 10 VALMIR DE FRANCISQUINHO 36.49% |
| 2026_t1_c3_SP | 103,656 | 26,394,256 | 10 TARCÍSIO 62.59% | 13 FERNANDO HADDAD 36.38% |
| 2026_t1_c3_TO | 4,384 | 963,810 | 44 PROFESSORA DORINHA 45.46% | 45 VICENTINHO JÚNIOR 43.88% |

## 2. Horário de chegada dos BUs (DT_BU_RECEBIDO, horário de Brasília)

minute = floor((DT_BU_RECEBIDO − 17:00 do dia da eleição)/60 s). Valores negativos = exterior (ZZ) cujos BUs chegaram antes das 17h; o TSE só divulga a partir das 17:00, então no backtest trate minute<0 como 0.

| timeline | seções c/ horário | 1º BU fora ZZ | % seções até 17:10 | 17:30 | 18:00 | 19:00 | 20:00 | 22:00 | último BU (min) |
|---|---|---|---|---|---|---|---|---|---|
| 2018_t2_c1_encerramento | 453,673 | 0 | 92.9% | 93.8% | 93.8% | 99.6% | 100.0% | 100.0% | 321 |
| 2022_t1_c1 | 472,028 | 6 | 0.1% | 0.7% | 2.6% | 25.6% | 68.7% | 98.6% | 1588 |
| 2022_t2_c1 | 472,028 | 1 | 0.6% | 8.0% | 28.7% | 84.1% | 99.0% | 100.0% | 437 |
| 2026_t1_c1 | 499,206 | 8 | 0.2% | 2.4% | 15.0% | 60.8% | 86.1% | 99.8% | 598 |

- stats_bweb_2018_t2.json: seções sem DT_BU_RECEBIDO: [('2018_t2_c1', 817)]
- stats_bweb_2022_t1.json: seções sem DT_BU_RECEBIDO: nenhuma
- stats_bweb_2022_t2.json: seções sem DT_BU_RECEBIDO: nenhuma
- stats_bweb_2026_t1.json: seções sem DT_BU_RECEBIDO: nenhuma

## 3. Curva da apuração (presidente, nacional)

Para cada eleição: minuto (desde 17:00) em que X% das seções (BUs) já haviam chegado, % dos votos válidos finais já contados nesse momento e a participação de A entre os dois (A/(A+B)) acumulada até ali.

### 2022 2T (Lula x Bolsonaro)

A = 13 LULA; B = 22 JAIR BOLSONARO. Final A/(A+B) = **50.90%**.

| % seções | minuto | hora | % seções (real) | % válidos contados | A/(A+B) | dif. vs final (p.p.) |
|---|---|---|---|---|---|---|
| 1% | 13 | 17:13 | 1.2% | 1.3% | 43.40% | -7.50 |
| 5% | 25 | 17:25 | 5.7% | 5.8% | 46.90% | -4.00 |
| 10% | 32 | 17:32 | 10.0% | 10.0% | 47.99% | -2.92 |
| 25% | 54 | 17:54 | 25.0% | 24.8% | 48.75% | -2.15 |
| 50% | 86 | 18:26 | 50.9% | 50.6% | 49.71% | -1.20 |
| 75% | 111 | 18:51 | 75.9% | 75.8% | 50.20% | -0.71 |
| 90% | 129 | 19:09 | 90.5% | 90.6% | 50.54% | -0.36 |
| 99% | 180 | 20:00 | 99.0% | 99.1% | 50.84% | -0.06 |

Trocas de liderança (últimas): min 6 (17:06, 0.2% seções) → lidera B; min 103 (18:43, 68.2% seções) → lidera A

### 2022 1T (Lula x Bolsonaro)

A = 13 LULA; B = 22 JAIR BOLSONARO. Final A/(A+B) = **52.86%**.

| % seções | minuto | hora | % seções (real) | % válidos contados | A/(A+B) | dif. vs final (p.p.) |
|---|---|---|---|---|---|---|
| 1% | 37 | 17:37 | 1.0% | 1.0% | 46.11% | -6.74 |
| 5% | 73 | 18:13 | 5.0% | 4.8% | 46.34% | -6.51 |
| 10% | 91 | 18:31 | 10.1% | 9.5% | 47.02% | -5.84 |
| 25% | 119 | 18:59 | 25.6% | 24.3% | 47.62% | -5.24 |
| 50% | 154 | 19:34 | 50.7% | 49.1% | 49.02% | -3.83 |
| 75% | 188 | 20:08 | 75.3% | 74.4% | 50.48% | -2.37 |
| 90% | 209 | 20:29 | 90.4% | 90.2% | 51.57% | -1.29 |
| 99% | 315 | 22:15 | 99.0% | 99.1% | 52.62% | -0.23 |

Trocas de liderança (últimas): min 13 (17:13, 0.2% seções) → lidera B; min 179 (19:59, 68.7% seções) → lidera A

### 2026 1T (Lula x Flávio)

A = 13 LULA; B = 22 FLAVIO BOLSONARO. Final A/(A+B) = **48.99%**.

| % seções | minuto | hora | % seções (real) | % válidos contados | A/(A+B) | dif. vs final (p.p.) |
|---|---|---|---|---|---|---|
| 1% | 18 | 17:18 | 1.0% | 1.0% | 46.97% | -2.02 |
| 5% | 39 | 17:39 | 5.2% | 5.1% | 44.98% | -4.01 |
| 10% | 51 | 17:51 | 10.4% | 10.1% | 44.42% | -4.57 |
| 25% | 78 | 18:18 | 25.0% | 24.2% | 44.60% | -4.39 |
| 50% | 104 | 18:44 | 50.3% | 48.9% | 45.44% | -3.55 |
| 75% | 134 | 19:14 | 75.5% | 74.4% | 46.63% | -2.35 |
| 90% | 193 | 20:13 | 90.1% | 89.6% | 47.78% | -1.21 |
| 99% | 253 | 21:13 | 99.0% | 99.0% | 48.77% | -0.22 |

Trocas de liderança (últimas): min 13 (17:13, 0.6% seções) → lidera B

### 2018 2T (Haddad x Bolsonaro) — PROXY DT_ENCERRAMENTO

A = 13 FERNANDO HADDAD; B = 17 JAIR BOLSONARO. Final A/(A+B) = **44.90%**.

| % seções | minuto | hora | % seções (real) | % válidos contados | A/(A+B) | dif. vs final (p.p.) |
|---|---|---|---|---|---|---|
| 1% | 0 | 17:00 | 42.1% | 41.7% | 45.26% | +0.37 |
| 5% | 0 | 17:00 | 42.1% | 41.7% | 45.26% | +0.37 |
| 10% | 0 | 17:00 | 42.1% | 41.7% | 45.26% | +0.37 |
| 25% | 0 | 17:00 | 42.1% | 41.7% | 45.26% | +0.37 |
| 50% | 1 | 17:01 | 65.5% | 65.0% | 45.43% | +0.53 |
| 75% | 2 | 17:02 | 77.2% | 77.0% | 45.39% | +0.49 |
| 90% | 6 | 17:06 | 91.1% | 91.3% | 45.36% | +0.46 |
| 99% | 63 | 18:03 | 99.1% | 99.2% | 45.01% | +0.11 |

### Validação: histórico OFICIAL de totalização 2022 2T (hist_2022_t2_c1) vs curva dos BUs

Snapshots publicados pelo TSE (segundo a segundo). Compara o horário em que o TSE publicou X% das seções com o horário em que X% dos BUs haviam chegado (DT_BU_RECEBIDO).

| % seções | hora oficial | Lula/(Lula+Bolso) oficial | hora BUs | Lula/(L+B) BUs |
|---|---|---|---|---|
| 1% | 17:14 | 43.68% | 17:13 | 43.40% |
| 5% | 17:25 | 46.71% | 17:25 | 46.90% |
| 10% | 17:33 | 47.99% | 17:32 | 47.99% |
| 25% | 17:55 | 48.74% | 17:54 | 48.75% |
| 50% | 18:26 | 49.69% | 18:26 | 49.71% |
| 75% | 18:51 | 50.17% | 18:51 | 50.20% |
| 90% | 19:09 | 50.53% | 19:09 | 50.54% |
| 99% | 20:00 | 50.84% | 20:00 | 50.84% |

### Validação: histórico OFICIAL de totalização 2022 1T (hist_2022_t1_c1) vs curva dos BUs

Snapshots publicados pelo TSE (segundo a segundo). Compara o horário em que o TSE publicou X% das seções com o horário em que X% dos BUs haviam chegado (DT_BU_RECEBIDO).

| % seções | hora oficial | Lula/(Lula+Bolso) oficial | hora BUs | Lula/(L+B) BUs |
|---|---|---|---|---|
| 1% | 17:38 | 46.07% | 17:37 | 46.11% |
| 5% | 18:21 | 46.34% | 18:13 | 46.34% |
| 10% | 18:32 | 47.00% | 18:31 | 47.02% |
| 25% | 19:00 | 47.60% | 18:59 | 47.62% |
| 50% | 19:35 | 49.06% | 19:34 | 49.02% |
| 75% | 20:09 | 50.44% | 20:08 | 50.48% |
| 90% | 20:30 | 51.54% | 20:29 | 51.57% |
| 99% | 22:15 | 52.62% | 22:15 | 52.62% |

## 4. Curvas — governadores 2022 2T (A = vencedor)

| UF | A | B | final A% | A% @10% seções | @25% | @50% | @75% | @90% | última troca de liderança |
|---|---|---|---|---|---|---|---|---|---|
| AL | 15 PAULO DANTAS | 44 RODRIGO CUNHA | 52.33% | 57.5% | 57.6% | 54.8% | 53.6% | 52.6% | min 26 (1% seções) |
| AM | 44 WILSON LIMA | 15 EDUARDO BRAGA | 56.65% | 60.7% | 58.9% | 58.2% | 57.4% | 57.0% | nenhuma |
| BA | 13 JERÔNIMO | 44 ACM NETO | 52.79% | 48.6% | 50.4% | 51.3% | 52.1% | 52.3% | min 59 (24% seções) |
| ES | 40 RENATO CASAGRANDE | 22 MANATO | 53.80% | 54.1% | 54.2% | 53.8% | 53.7% | 53.8% | nenhuma |
| MS | 45 EDUARDO RIEDEL | 28 CAPITÃO CONTAR | 56.90% | 57.4% | 56.4% | 55.9% | 55.9% | 56.4% | nenhuma |
| PB | 40 JOÃO | 45 PEDRO CUNHA LIMA | 52.51% | 54.1% | 55.2% | 54.7% | 52.9% | 52.0% | min 14 (1% seções) |
| PE | 45 RAQUEL LYRA | 77 MARÍLIA ARRAES | 58.70% | 54.6% | 56.2% | 58.0% | 58.8% | 58.8% | min 25 (1% seções) |
| RO | 44 CORONEL MARCOS ROCHA | 22 MARCOS ROGERIO | 52.47% | 57.1% | 56.6% | 54.7% | 53.3% | 52.7% | nenhuma |
| RS | 45 EDUARDO LEITE | 22 ONYX LORENZONI | 57.12% | 52.9% | 54.2% | 55.7% | 56.7% | 57.1% | min 9 (0% seções) |
| SC | 22 JORGINHO MELLO | 13 DÉCIO LIMA | 70.69% | 70.5% | 71.4% | 71.0% | 70.8% | 70.7% | nenhuma |
| SE | 55 FÁBIO | 13 ROGÉRIO CARVALHO | 51.70% | 57.1% | 55.5% | 54.7% | 53.2% | 52.2% | nenhuma |
| SP | 10 TARCÍSIO | 13 FERNANDO HADDAD | 55.27% | 58.0% | 57.6% | 56.4% | 55.7% | 55.4% | min 15 (0% seções) |

