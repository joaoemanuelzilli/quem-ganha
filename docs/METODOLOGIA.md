# 🧠 Metodologia — como o QUEM GANHA? prevê o 2º turno com 1% das urnas

> Resumo em uma frase: comparamos **cada município que já apurou** com o **1º turno de 2026 no mesmo município**, estimamos o "swing" (quanto cada lado ganhou/perdeu), aprendemos como esse swing varia por estado e por tipo de município, e aplicamos isso a **tudo o que falta apurar** — simulando 2.000 cenários para obter a chance de vitória.

---

## 1. O problema: a apuração não é uma amostra aleatória

O TSE não divulga urnas em ordem aleatória. Sul, Centro-Oeste e o exterior chegam primeiro; o Nordeste e as capitais grandes chegam por último. Por isso, o "placar da TV" engana:

| Eleição | Com 1% apurado (PT) | Final (PT) | Virada |
|---|---|---|---|
| 2022 – 2º turno (Lula × Bolsonaro) | 43,4% | **50,9%** | Lula passou às 18h43, com 68% das seções |
| 2022 – 1º turno (2 primeiros) | 46,1% | **52,9%** | às 19h59, com 69% |
| 2026 – 1º turno (Lula × Flávio, 2 primeiros) | 47,0% | **49,0%** | Flávio liderou o tempo todo |

O placar cru erra **~5 pontos** com 1% apurado. Nosso modelo erra ~1,4.

## 2. A ideia central: comparar com o mesmo lugar

Se Flávio tinha 60% em Chapecó no 1º turno e agora tem 58%, sabemos que **ali** Lula ganhou ~2 pontos — não importa que Chapecó tenha chegado cedo. Fazendo isso para centenas de municípios, estimamos o swing nacional sem o viés da ordem de chegada (é a técnica dos modelos de noite de eleição como o "needle" do *New York Times* e os da *Decision Desk HQ*).

## 3. O modelo (hierárquico bayesiano em escala logística)

Para cada município *i* (5.757 unidades, incluindo 186 cidades no exterior):

```
logit(y_i) = logit(b_i) + δ + β₁·outros_i + β₂·tamanho_i + β₃·inclinação_i + u_UF(i) + ε_i
```

| termo | significado | como é estimado |
|---|---|---|
| `b_i` | **baseline do 1º turno**: `(Lula₁ + α·Outros₁) / Válidos₁` | α = 0,41 (transferência declarada dos eleitores de Cury, Renan, Caiado, Zema) |
| `δ` | **swing nacional** | prior das pesquisas → atualizado pelos dados |
| `β₁` | municípios com muito voto "outros" mudam diferente | regressão ecológica ao vivo |
| `β₂` | cidades grandes × pequenas mudam diferente | idem |
| `β₃` | redutos de um lado mudam diferente (regressão à média) | idem |
| `u_UF` | swing próprio de cada estado | efeito aleatório, `N(0, σu²)` |
| `ε_i` | particularidade local | `N(0, σε²)`, maior em municípios pequenos |

**Observação parcial.** Quando um município tem só parte das seções apuradas, o que vemos é `logit(ŷ_i) = logit(y_i) + η_i`, com variância de `η_i` que encolhe conforme a fração apurada cresce (as primeiras seções de uma cidade não representam a cidade toda).

**Choques no que falta.** O que ainda não chegou tende a ser sistematicamente diferente do que chegou. Modelamos isso com choques comuns `ζ` (nacional) e `ζ_UF` aplicados **só aos votos restantes**, com variância proporcional à fração restante. Sem isso, o modelo fica confiante demais no meio da apuração (foi o que o backtest mostrou na versão 1).

**Solução exata.** Tudo é gaussiano no espaço logit. A posteriori de `(δ, β)` integrando os efeitos estaduais sai em forma fechada (mínimos quadrados generalizados com a identidade de Sherman–Morrison em cada UF). Nada de MCMC: o ajuste completo + 2.000 simulações leva ~1,3 s.

**Comparecimento.** Votos válidos por eleitor ainda não apurado = mistura entre o observado no município e o do 1º turno corrigido pela variação regional, ponderada pelo eleitorado já apurado.

**Monte Carlo.** Cada sorteio: `θ → u_UF → ε_i → ζ → votos restantes → total nacional`. Daí saem `P(Lula vence)`, o intervalo de 90%, a projeção por estado e o comparecimento.

## 3b. Quatro ajustes aprendidos no backtest

1. **Virada do PT (μ).** Nas três presidenciais reproduzidas, entre 5% e 50% apurado o modelo "puro" subestimava o PT em ~1 ponto, sempre na mesma direção: os votos que chegam por último (Nordeste, grandes cidades) são mais petistas do que o swing dos primeiros sugere. Acrescentamos um viés médio μ nos votos que faltam. Cada eleição, sozinha, aponta μ ≈ 0,04–0,05 (logit), e usamos 0,045. Ele entra aos poucos nos primeiros 5% e só na medida em que a estimativa já vem dos dados. Nos governadores (onde "A" é arbitrário) μ = 0.
2. **Exterior isolado.** As urnas do exterior chegam todas antes das 17h e dominam o primeiro snapshot. O efeito regional do exterior tem dp de 0,35 (contra ~0,08 das UFs), então ele quase não contamina o swing nacional.
3. **Aquecimento.** Com 0,2% apurado, centenas de municípios aparecem com 1–2 seções, e essas primeiras seções têm viés comum. Até 1% apurado, os dados entram com peso τ = fração apurada / 1%.
4. **COMBO.** No comecinho, o modelo por UF (28 totais, menos ruidosos) errou menos que o municipal: 0,41 contra 0,76 pp com 1%. Com 5%, inverte: 0,40 contra 0,25. A previsão oficial mistura os dois em logit, com 75% para o modelo por UF até 1% apurado, caindo linearmente a 0% em 5%. Backtest do COMBO: **0,50 pp com 1%**.

## 3c. Termômetros populares (também testados)

- **"Quem ganha em Minas ganha o Brasil"**: verdade em todos os 2º turnos desde 1989 e no 1º turno de 2026. O dashboard mostra quem lidera MG e o que o swing de MG implica para o país. No backtest, usar *só* Minas erra 2,15 pp com 1% e 0,77 com 5%: funciona, mas o país inteiro informa mais.
- **"Meta no Nordeste"**: dado o projetado para o resto do país, quanto Lula **precisa** fazer no NE para chegar a 50%, comparado com o que está fazendo e com o 1º turno (67,4% entre os dois). O Nordeste chega por último, então essa é a conta que decide a noite.

## 4. O prior: pesquisas corrigidas

- Média ponderada das **18 pesquisas** da semana final: Lula **49,1%** dos válidos.
- As pesquisas superestimaram o PT em todas as eleições recentes: 2022 1T (−1,6 pp), 2022 2T (−1,6 pp) e 2026 1T (−1,8 pp).
- Prior = 49,1 − 1,7 = **47,4% ± 2,5 pp**.

O prior só importa nos primeiros minutos. Com ~1% das seções, os dados já dominam.

## 5. A trajetória: como o resto da apuração vai se comportar

Para desenhar a linha pontilhada do gráfico, usamos as **curvas de chegada** reais (minuto em que cada fração das seções chegou ao TSE), reconstruídas do campo `DT_BU_RECEBIDO` dos boletins de urna de 2022 e 2026:

1. Cada município (ou UF) está num ponto da sua curva histórica (a fração já apurada).
2. Avançamos o relógio, com o ritmo ajustado ao de hoje (se o TSE estiver mais rápido ou mais lento que em 2022).
3. Os votos que vão entrando têm a % projetada pelo modelo para aquele município.
4. Somamos e obtemos a % de Lula em cada ponto futuro da apuração, com faixa de 90% e horário previsto para chegar a 100%.

## 6. Os métodos em disputa ("SELECT YOUR ALGORITHM")

| método | ideia | para que serve |
|---|---|---|
| **BAYES HIERÁRQUICO (municípios)** | este modelo | previsão principal |
| BAYES POR ESTADO | mesmo modelo só com 28 totais estaduais | roda no navegador se o worker cair |
| SWING UNIFORME | um único swing vs 1º turno aplicado a tudo | referência clássica |
| PROJEÇÃO POR ESTADO | cada UF mantém a % já apurada | o que muita gente faz "de cabeça" |
| PLACAR CRU | % apurada até agora | o que a TV mostra |
| PESQUISAS | só o prior | linha de base |

## 7. Treino (backtest) e calibração

Reproduzimos **15 apurações reais** na ordem exata em que os boletins chegaram ao TSE:

- Presidente: 2022 1º turno, 2022 2º turno e 2026 1º turno.
- Governador: as 12 disputas de 2º turno de 2022.

Para cada uma, montamos o snapshot exato que a API do TSE mostraria em 0,25%, 0,5%, 1%, 2%, 3%, 5%, 10%, 20%, 30%, 50%, 70% e 90% das seções, rodamos o modelo e comparamos com o resultado final.

Os hiperparâmetros (σ's, α, priors dos β) foram escolhidos por **busca aleatória paralela** minimizando o **CRPS**. É uma regra de pontuação própria: premia acertar o centro **e** ter intervalos do tamanho certo. A correção de viés das pesquisas é *leave-one-out*: nunca usa a eleição que está sendo testada.

Os resultados estão em [`data/model/backtest.json`](../data/model/backtest.json) e no README (HIGH SCORES).

## 8. Limitações honestas

- Se a eleição for decidida por menos de ~1 ponto, nenhum modelo crava com 1%. A probabilidade vai refletir isso, e a chamada "VITÓRIA PROJETADA" só aparece com ≥ 99% e ≥ 1% apurado.
- O modelo supõe que a relação "município no 1º turno → município no 2º turno" é estável. Eventos que mudem o comportamento de forma muito localizada (abstenção concentrada, por exemplo) só são capturados quando os dados chegam.
- As curvas de chegada são de 2022 e 2026. Se o TSE mudar a logística, a trajetória (mas não a previsão final) pode errar o formato.
