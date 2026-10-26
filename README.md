<p align="center">
  <img src="docs/img/banner.svg" alt="QUEM GANHA? — Lula vs Flávio, 2º turno 2026, em pixel art" width="100%">
</p>

<p align="center">
  <a href="#resultados"><img src="https://img.shields.io/badge/🏁_FIM_DE_JOGO-modelo_cravou_Lula_com_5%25_apurado-ffd400?style=for-the-badge&labelColor=0e0b22" alt="Ver os resultados"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/ROUND-2º_TURNO_·_25%2F10%2F2026-e8222e?style=flat-square&labelColor=0e0b22">
  <img src="https://img.shields.io/badge/DADOS-API_TSE_ao_vivo-19c35a?style=flat-square&labelColor=0e0b22">
  <img src="https://img.shields.io/badge/MODELO-Bayes_hierárquico_×_5.757_municípios-4d7cff?style=flat-square&labelColor=0e0b22">
  <img src="https://img.shields.io/badge/TREINO-15_apurações_reais-ffd400?style=flat-square&labelColor=0e0b22">
  <img src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&labelColor=0e0b22">
</p>

<p align="center"><b>🕹️ Uma previsão estatística AO VIVO do 2º turno presidencial de 2026 — Lula (PT) × Flávio Bolsonaro (PL) — que tenta cravar o vencedor com <u>1% das urnas apuradas</u>, num dashboard que parece um jogo de luta 16-bit.</b></p>

```
 ╔══════════════════════════════════════════════════════════════════════╗
 ║  P1 LULA  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░   VS   ░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓  FLÁVIO P2  ║
 ║                                                                      ║
 ║   19:02 ▸ começa a apuração   19:29 ▸ LULA PROJETADO   22:45 ▸ 100%  ║
 ║                                                                      ║
 ║   O placar da TV MENTE no começo: o Sul chega primeiro, o Nordeste   ║
 ║   por último. Em 2022 Bolsonaro "liderou" até 68% — e perdeu.        ║
 ║   Este projeto corrige isso em tempo real.          INSERT COIN ▮    ║
 ╚══════════════════════════════════════════════════════════════════════╝
```

<a id="resultados"></a>

<img src="docs/img/stage-results.svg" width="100%" alt="Fim de jogo: resultados">

> 🏆 **O modelo cravou a vitória de Lula às 19h29 de 25/10, com 5% das urnas apuradas.** Isso foi 56 minutos antes de Lula assumir de vez a liderança no placar (20h25, com 47% apurado) e 1h40 antes da vitória matemática (21h09). **Resultado final: Lula 51,79% × Flávio 48,21%.**

<p align="center"><img src="docs/img/result-final.png" width="100%" alt="Painel real no fim da noite: placar final, linha da apuração e linha da previsão do modelo ao longo da noite"></p>
<p align="center"><sub><b>O painel real no fim da noite.</b> Linha cheia = placar ao longo da apuração (Flávio chegou a liderar entre 19h45 e 20h24). Linha fina = a previsão do modelo, que cravou Lula com 5% apurado e convergiu para 51,8%.</sub></p>

| Horário (Brasília) | % apurado | Placar: Lula | Previsão do modelo: Lula | Chance de Lula | O que aconteceu |
|---|---:|---:|---:|---:|---|
| 11h42 | 0% | — | 47,4% (43,5–51,3) | 14% | previsão pré-apuração (pesquisas corrigidas) |
| 17h07 | 0,25% | 57,7% | 47,5% | 14% | primeiros números: só o **exterior** |
| 19h02 | 0,3% | 56,7% | 50,4% | 57% | começa a apuração no Brasil; o modelo passa a favorecer Lula e não muda mais |
| 19h05 | 1,5% | 52,3% | 51,6% | 78% | "vantagem Lula" |
| 19h17 | 2% | 51,8% | 51,9% | 85% | previsão a 0,07 ponto do resultado final |
| **19h29** | **5%** | 51,2% | **53,8%** (52,2–55,5) | **>99%** | 🏆 **VITÓRIA PROJETADA: LULA** |
| 19h45 – 20h24 | 14% – 47% | **Flávio na frente** (até 50,5%) | 52,1% – 52,7% | >99% | o placar mostra Flávio liderando; o modelo mantém Lula |
| 20h25 | 47% | 50,0% | 52,2% | 100% | Lula passa à frente no placar, de vez |
| 21h09 | 97,7% | 51,7% | 51,9% | 100% | vitória matemática |
| 22h45 | 100% | **51,79%** | 51,79% | — | resultado final |

**Previsão × resultado** (Lula, % dos válidos; final = 51,79%):

| % apurado | 1% | 2% | 5% | 10% | 20% | 50% | 90% |
|---|---:|---:|---:|---:|---:|---:|---:|
| previsão | 50,8% | 51,9% | 53,8% | 53,0% | 52,2% | 52,2% | 52,0% |
| erro (pontos) | −1,0 | **+0,07** | +2,0 | +1,3 | +0,45 | +0,39 | +0,17 |

**O que deu certo e o que não deu:**

- ✅ **Vencedor certo desde o início da apuração no Brasil.** A partir das 19h02 o modelo sempre apontou Lula como favorito, e cravou com 5% apurado, inclusive durante os 40 minutos em que o placar mostrava Flávio na frente.
- ✅ **Convergência.** A partir de ~20% apurado, a previsão nunca se afastou mais de 0,46 ponto do resultado final.
- ⚠️ **A margem foi superestimada no começo.** Entre 5% e 10% apurado, a previsão chegou a 53,8%. Às 19h29 o intervalo de 90% (52,2–55,5) **não** continha o resultado final. O vencedor estava certo, mas a confiança na margem foi alta demais naquele momento.
- ⚠️ **Horário.** Os números das 17h07 eram só do exterior; a apuração no Brasil começou por volta das 19h. Como o worker contava o relógio a partir das 17h, o "fim previsto" exibido durante a noite ficou errado. A previsão do resultado não usa o horário e não foi afetada.
- 📼 **Prova com horário:** o worker gravou automaticamente no branch [`ao-vivo`](https://github.com/joaoemanuelzilli/quem-ganha/tree/ao-vivo) um snapshot a cada 10 minutos. O das 19h29 ([`snapshots/20261025-1929.json`](https://github.com/joaoemanuelzilli/quem-ganha/blob/ao-vivo/snapshots/20261025-1929.json), commit `e3b3cb8`) registra: *"5,02% apurado · Lula 53,82% · P(Lula) 99,9%"*.

<sub>Fonte dos números: [`history.ndjson`](https://github.com/joaoemanuelzilli/quem-ganha/blob/ao-vivo/history.ndjson), com os 1.231 ciclos do modelo durante a apuração, e os resultados oficiais do TSE. Depois da eleição o site foi tirado do ar; o código continua aqui.</sub>

## 🎮 GAMEPLAY

<table>
<tr>
<td width="72%"><img src="docs/img/screen-title.png" alt="Tela de título real às 11h45 de 25/10: contagem regressiva, VS, prior das pesquisas e Polymarket"></td>
<td width="28%" rowspan="2"><img src="docs/img/screen-mobile.png" alt="Versão mobile às 19h29: HUD de luta e VITÓRIA PROJETADA: LULA"></td>
</tr>
<tr><td><sub><b>STAGE 0: tela de título</b>, como estava às 11h45 de 25/10. Contagem regressiva, prior das pesquisas (Lula 47,4%) e a cotação do Polymarket (21% × 79%). À direita, o celular às 19h29.</sub></td></tr>
</table>

<p align="center"><img src="docs/img/screen-arena.png" width="100%" alt="Arena: HUD com barras de vida, gráfico da apuração com previsão do restante, chance de vitória, projeção final e termômetros de Minas e do Nordeste"></p>
<p align="center"><sub><b>A ARENA às 19h29, no momento em que o modelo cravou Lula com 5% apurado.</b> Barras de vida = votos apurados · linha cheia = apuração até agora · faixa pontilhada = <b>previsão de como o resto da apuração vai se comportar</b> · medidor de chance de vitória · termômetros de Minas e do Nordeste.</sub></p>

<p align="center"><img src="docs/img/screen-methods.png" width="100%" alt="Select your algorithm: cada método com sua previsão e seu erro histórico no backtest"></p>
<p align="center"><sub><b>SELECT YOUR ALGORITHM às 19h29.</b> Cada "personagem" é um método de previsão, com a <b>barra de erro histórico</b> medida no backtest. A carta dourada é a previsão oficial.</sub></p>

<img src="docs/img/stage-select.svg" width="100%" alt="Escolha seu lutador">

| | 🟥 **PLAYER 1** | 🟩 **PLAYER 2** |
|---|:---:|:---:|
| **Lutador** | **LULA** (PT · nº 13) | **FLÁVIO BOLSONARO** (PL · nº 22) |
| **Cor** | vermelho `#e8222e` | verde `#19c35a` |
| **1º turno (04/10)** | 53.879.538 votos · 45,16% | 56.104.503 votos · **47,03%** |
| **Base forte** | Nordeste (BA 70%, PI 75% entre os dois) | Sul e Centro-Oeste (SC 73%, RO 72%) |
| **Pesquisas finais** (média de 18) | 49,1% dos válidos | 50,9% dos válidos |
| **Polymarket** (manhã de 25/10) | ~21% | ~79% |
| **Golpe especial** | chega forte no fim da apuração (NE) | larga na frente (Sul/SP) |

<img src="docs/img/stage-1.svg" width="100%" alt="Stage 1: como funciona">

```mermaid
flowchart LR
    TSE[("🗳️ API do TSE<br/>resultados.tse.jus.br<br/>BR · 28 UFs · 5.757 municípios")]
    PM[("🎲 Polymarket<br/>gamma-api")]
    subgraph PC["💻 SEU PC — worker (npm run worker)"]
      W1["a cada 15 s:<br/>baixa BR + UFs + andamento<br/>+ só os municípios que mudaram"]
      W2["🧠 modelo Bayes<br/>por município<br/>2.000 simulações"]
      W3["📈 trajetória do<br/>resto da apuração"]
      W1 --> W2 --> W3
    end
    BLOB[("☁️ Vercel Blob<br/>live/state.json")]
    subgraph WEB["🌐 DASHBOARD (Vercel) — pixel art"]
      D1["lê o worker"]
      D2["🛟 plano B: o navegador baixa o TSE<br/>e roda o mesmo motor por UF"]
    end
    TSE --> W1
    W3 --> BLOB --> D1
    TSE -. "CORS aberto" .-> D2
    PM -.-> WEB
```

1. **17:00** — urnas fecham, os primeiros boletins chegam ao TSE (o exterior primeiro).
2. O **worker** (rodando no seu computador) consulta a API pública do TSE a cada 15 s. Ele baixa só os municípios que mudaram, compara cada um com o **1º turno no mesmo município** e roda o modelo.
3. O resultado vai para o **Vercel Blob**, e o **dashboard** público desenha tudo como um jogo de luta.
4. Se o worker cair, o próprio **navegador** baixa os totais do TSE (a API tem CORS aberto) e roda o mesmo motor por estado. O site nunca fica sem previsão.
5. No canto, a cotação do **Polymarket** ao vivo, para comparar a "sabedoria do mercado" com a estatística.

<img src="docs/img/stage-2.svg" width="100%" alt="Stage 2: o modelo">

> 📖 Versão completa: **[docs/METODOLOGIA.md](docs/METODOLOGIA.md)** · pesquisa de métodos e pesquisas eleitorais: **[docs/PESQUISA.md](docs/PESQUISA.md)**

**O truque:** não importa *quem* está na frente no placar, e sim **quanto cada lado melhorou em relação ao 1º turno nos lugares que já apuraram**. Se Flávio caiu 2 pontos em Chapecó em relação a 04/10, isso vale para estimar o que ainda falta, mesmo que Chapecó tenha chegado cedo.

```
logit(y_município) = logit(base_1ºturno) + δ_nacional + β·[outros, tamanho, inclinação] + u_UF + ε_local
                     └────── prior ─────┘   └─ aprendido AO VIVO com os municípios que já apuraram ─┘
```

| ⚡ POWER-UP | o que faz |
|---|---|
| 🎯 **Swing logístico por município** | compara cada um dos 5.757 municípios (186 no exterior) com ele mesmo no 1º turno |
| 🧬 **Hierarquia bayesiana** | estados têm swing próprio, encolhido para o nacional quando há poucos dados |
| 🧪 **Regressão ecológica ao vivo** | aprende se municípios com mais votos de Cury/Caiado/Renan, cidades grandes ou redutos se movem diferente |
| 🔀 **Transferência de votos** | baseline usa α = 41%: a fatia declarada dos eleitores dos eliminados que vai para Lula |
| 🧲 **Prior de pesquisas corrigido** | média de 18 pesquisas (49,1%) menos o viés histórico das pesquisas contra o PT (−1,7 pp) = 47,4% ± 2,5 |
| 🌪️ **Choques de ordem de apuração** | o que falta chegar é diferente do que chegou: incerteza extra só sobre os votos restantes |
| 🗳️ **Modelo de comparecimento** | votos válidos esperados por eleitor ainda não apurado, local × regional |
| 🎲 **Monte Carlo** | 2.000 cenários completos → chance de vitória, intervalo de 90%, previsão por estado |
| ⏱️ **Curvas de chegada reais** | horário em que cada boletim de 2022/2026 chegou ao TSE → prevê o **formato** do resto do gráfico e a hora de terminar |
| 🔁 **Virada do PT** | no Brasil o voto que chega por último é mais petista do que o swing dos primeiros sugere. O viés (μ = 0,045 logit) foi aprendido nas 3 presidenciais, e cada uma, sozinha, aponta o mesmo valor |
| 🌍 **Exterior isolado** | as urnas do exterior chegam todas antes das 17h e não representam o Brasil: contam nos votos, mas quase não mexem no swing nacional |
| 🔥 **Aquecimento** | nos primeiros minutos, as poucas seções de cada cidade puxam todas para o mesmo lado: os dados entram com peso reduzido até 1% apurado |
| 🤝 **COMBO** | até 1% apurado, 75% de peso para o modelo por estado (menos ruidoso no comecinho), caindo a zero em 5%. Backtest: erro de 0,50 pp com 1% |
| 🌡️ **Termômetros** | "quem ganha em Minas ganha o Brasil" (acertou todos os 2º turnos desde 1989) e "meta no Nordeste": quanto Lula **precisa** fazer no NE, dado o resto do país |
| 🧮 **Solução exata** | tudo gaussiano em logit, sem MCMC: ajuste + simulações em ~1,3 s |

<img src="docs/img/stage-3.svg" width="100%" alt="Stage 3: treino">

Para treinar, **reproduzimos 15 apurações reais na ordem exata em que os boletins de urna chegaram ao TSE** (campo `DT_BU_RECEBIDO` dos arquivos BWEB, conferido minuto a minuto com o histórico oficial de 2022):

| 🎮 fase de treino | prior usado | eleição reproduzida |
|---|---|---|
| Presidente 2022 – 2º turno | 1º turno 2022 por município | Lula × Bolsonaro |
| Presidente 2022 – 1º turno | 2º turno 2018 | Lula × Bolsonaro (2 primeiros) |
| Presidente 2026 – 1º turno | 2º turno 2022 | Lula × Flávio (2 primeiros) |
| Governador 2022 – 2º turno ×12 | 1º turno de cada estado | AL, AM, BA, ES, MS, PB, PE, RO, RS, SC, SE, SP |

Em cada uma, o modelo vê o snapshot exato que a API mostraria com 0,25%, 0,5%, 1%, 2%, 3%, 5%, 10%, 20%, 30%, 50%, 70% e 90% das seções. Os hiperparâmetros saem de uma **busca aleatória paralela** que minimiza o **CRPS**, uma regra de pontuação que pune tanto errar o centro quanto ter intervalos do tamanho errado. A correção do viés das pesquisas é *leave-one-out*: nunca usa a própria eleição testada.

<img src="docs/img/stage-4.svg" width="100%" alt="Stage 4: high scores">

<p align="center"><img src="docs/img/highscores.svg" width="100%" alt="Erro médio por % apurado: Bayes vs outros métodos"></p>

<!--HIGHSCORES-->
> 🏆 **Com 1% das urnas apuradas**, o modelo erra o resultado final em média **0,99 ponto** nas 15 apurações (o placar da TV erra **5,03**). Acertou o vencedor em **100%** dos casos. Nas **presidenciais**, o erro é de **0,76 ponto com 1%** e **0,27 com 5%**.

**🎮 Presidenciais (2022 1T, 2022 2T, 2026 1T)** — erro médio absoluto em pontos percentuais do resultado final:

| % apurado | 🧠 **BAYES** | swing uniforme | projeção por UF | placar cru (TV) | intervalo 90% cobre | acertou vencedor | P(vencedor certo) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **0,25%** | **1,29 🥇** | 2,71 | 1,87 | 4,36 | 67% | 67% | 66% |
| **0,5%** | **1,09** | 1,66 | 0,79 🥇 | 4,48 | 100% | 67% | 81% |
| **1%** | **0,76** | 0,75 🥇 | 1,13 | 5,44 | 67% | 100% | 97% |
| **2%** | **0,37 🥇** | 0,74 | 1,42 | 5,65 | 100% | 100% | 98% |
| **3%** | **0,35 🥇** | 0,70 | 1,62 | 5,23 | 100% | 100% | 98% |
| **5%** | **0,27 🥇** | 0,72 | 1,98 | 4,85 | 100% | 100% | 93% |
| **10%** | **0,23 🥇** | 0,90 | 1,74 | 4,44 | 100% | 100% | 93% |
| **20%** | **0,26 🥇** | 0,97 | 1,69 | 4,14 | 100% | 100% | 94% |
| **30%** | **0,22 🥇** | 0,84 | 1,58 | 3,74 | 100% | 100% | 94% |
| **50%** | **0,07 🥇** | 0,52 | 1,15 | 2,86 | 100% | 100% | 98% |
| **70%** | **0,05 🥇** | 0,25 | 0,80 | 2,07 | 100% | 100% | 100% |
| **90%** | **0,02 🥇** | 0,09 | 0,38 | 0,95 | 100% | 100% | 100% |

<details><summary><b>📊 Todas as 15 apurações (presidente + 12 governadores)</b></summary>

| % apurado | 🧠 **BAYES** | swing uniforme | projeção por UF | placar cru (TV) | intervalo 90% cobre | acertou vencedor | P(vencedor certo) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **0,25%** | **2,13 🥇** | 4,25 | 5,49 | 5,99 | 80% | 87% | 81% |
| **0,5%** | **1,43 🥇** | 3,93 | 5,08 | 5,82 | 87% | 87% | 87% |
| **1%** | **0,99 🥇** | 3,18 | 4,17 | 5,03 | 87% | 100% | 95% |
| **2%** | **1,18 🥇** | 2,84 | 3,79 | 4,63 | 93% | 93% | 91% |
| **3%** | **1,30 🥇** | 2,78 | 3,64 | 4,36 | 100% | 93% | 92% |
| **5%** | **0,88 🥇** | 2,51 | 3,51 | 4,08 | 100% | 100% | 92% |
| **10%** | **0,76 🥇** | 1,85 | 2,82 | 3,36 | 93% | 93% | 92% |
| **20%** | **0,64 🥇** | 1,51 | 2,43 | 2,92 | 100% | 100% | 97% |
| **30%** | **0,55 🥇** | 1,19 | 2,02 | 2,46 | 93% | 100% | 98% |
| **50%** | **0,48 🥇** | 0,89 | 1,40 | 1,74 | 87% | 100% | 100% |
| **70%** | **0,32 🥇** | 0,54 | 0,81 | 1,06 | 67% | 100% | 100% |
| **90%** | **0,11 🥇** | 0,19 | 0,29 | 0,40 | 67% | 100% | 100% |

</details>

<details><summary><b>🌡️ Termômetros populares: "quem ganha em Minas ganha" e "o Nordeste decide" (presidenciais)</b></summary>

Erro médio (pontos) se usássemos **só** o swing de Minas, ou **só** o do Nordeste, para projetar o Brasil inteiro. Os dois termômetros funcionam, mas olhar o país inteiro é melhor. No começo da apuração ainda há pouco voto de MG e do NE apurado (—):

| % apurado | 🧠 BAYES (Brasil todo) | 🔺 só Minas | 🌵 só Nordeste |
|---:|---:|---:|---:|
| 0,25% | **1,29** | 0,89 | 3,14 |
| 0,5% | **1,09** | 1,55 | 2,69 |
| 1% | **0,76** | 2,15 | 2,72 |
| 2% | **0,37** | 0,96 | 2,72 |
| 3% | **0,35** | 0,63 | 2,82 |
| 5% | **0,27** | 0,77 | 2,89 |
| 10% | **0,23** | 0,62 | 2,73 |
| 20% | **0,26** | 0,58 | 2,55 |
| 30% | **0,22** | 0,66 | 2,23 |
| 50% | **0,07** | 0,58 | 1,55 |
| 70% | **0,05** | 0,42 | 0,84 |
| 90% | **0,02** | 0,17 | 0,23 |

</details>

<details><summary><b>🔍 Caso a caso, com 1% apurado</b></summary>

| eleição reproduzida | horário com 1% | placar cru | 🧠 previsão (intervalo 90%) | resultado real | erro | chance dada ao vencedor real |
|---|---:|---:|---:|---:|---:|---:|
| 2022-2T-PR | 17:13 | 43,40% | **52,37%** (51,34–53,42) | 50,90% | +1,47 | 100% |
| 2026-1T-PR | 17:18 | 46,91% | **49,13%** (48,10–50,13) | 48,99% | +0,14 | 92% |
| 2022-1T-PR | 17:37 | 46,11% | **52,17%** (51,23–53,17) | 52,86% | -0,68 | 100% |
| 2022-2T-GOV-AL | 17:25 | 48,81% | **53,36%** (50,27–56,25) | 52,33% | +1,03 | 96% |
| 2022-2T-GOV-AM | 17:06 | 37,46% | **43,44%** (36,87–49,80) | 43,35% | +0,09 | 95% |
| 2022-2T-GOV-BA | 17:20 | 45,88% | **53,68%** (51,33–56,00) | 52,79% | +0,89 | 100% |
| 2022-2T-GOV-ES | 17:20 | 43,06% | **47,06%** (43,38–50,71) | 46,20% | +0,86 | 90% |
| 2022-2T-GOV-MS | 17:15 | 42,16% | **43,64%** (40,58–46,81) | 43,10% | +0,54 | 100% |
| 2022-2T-GOV-PB | 17:15 | 51,78% | **52,11%** (49,50–54,72) | 52,51% | -0,40 | 90% |
| 2022-2T-GOV-PE | 17:27 | 55,37% | **58,80%** (56,31–61,34) | 58,70% | +0,10 | 100% |
| 2022-2T-GOV-RO | 17:09 | 38,68% | **44,03%** (38,23–50,04) | 47,53% | -3,50 | 95% |
| 2022-2T-GOV-RS | 17:18 | 47,97% | **45,22%** (42,89–47,45) | 42,88% | +2,34 | 100% |
| 2022-2T-GOV-SC | 17:32 | 33,29% | **30,62%** (28,33–32,90) | 29,31% | +1,31 | 100% |
| 2022-2T-GOV-SE | 17:30 | 36,71% | **48,93%** (44,57–53,13) | 48,30% | +0,62 | 65% |
| 2022-2T-GOV-SP | 17:28 | 60,41% | **56,17%** (54,04–58,23) | 55,27% | +0,90 | 100% |

</details>

*"Intervalo 90% cobre" = em quantos casos o resultado real caiu dentro do intervalo de 90% do modelo (o ideal é ~90%). Correção do viés das pesquisas em validação cruzada (leave-one-out). Dados completos em [`data/model/backtest.json`](data/model/backtest.json).*
<!--/HIGHSCORES-->

<img src="docs/img/stage-5.svg" width="100%" alt="Stage 5: como jogar">

```bash
git clone https://github.com/joaoemanuelzilli/quem-ganha.git && cd quem-ganha
npm install

# 1) priors: resultado do 1º turno 2026 de TODOS os municípios, direto da API do TSE
npm run priors

# 2) worker ao vivo (deixe rodando durante a apuração)
./run-worker.sh                 # reinicia sozinho e impede o PC de suspender
#   → http://localhost:8787/state.json   (+ publica no Vercel Blob se houver .env.local)

# 3) dashboard
npm run dev                     # http://localhost:5173        (lê o worker na nuvem)
#   http://localhost:5173/?local=1   → lê o worker local

# 4) treino / backtest
npm run backtest                # avalia nas 15 apurações reais
npm run backtest -- --tune 80   # busca de hiperparâmetros

# 5) ensaio geral: um "TSE falso" reapresenta a apuração do 1º turno de 2026 em alta velocidade
npx tsx scripts/replay-server.ts timeline_2026_t1_c1.csv.gz 1 &
TSE_BASE=http://localhost:8790/oficial USE_TSE_CLOCK=1 NO_PUBLISH=1 FRESH=1 npm run worker
```

### ☁️ Worker na nuvem (notebook opcional)

O mesmo worker roda no **GitHub Actions** ([`.github/workflows/worker.yml`](.github/workflows/worker.yml)), então o notebook pode ficar desligado:

- **Turnos:** cada job dura até 6 h e, antes de acabar, dispara o próximo. A troca é às 16:40, antes da apuração. Há disparos de reserva agendados para 16:15 e 16:35.
- **Notebook como reserva:** `run-worker.sh` sobe o worker no papel `backup`. Ele calcula tudo, mas só publica se a nuvem ficar mais de 150 s sem publicar. Quem assume retoma o histórico do último estado publicado.
- **Configuração necessária:** o segredo `BLOB_READ_WRITE_TOKEN` (Settings → Secrets and variables → Actions), com o mesmo valor do `.env.local`.

### 📡 Noite da eleição: acompanhando o worker

```bash
tail -f live/worker.log                      # um ciclo a cada 15 s: % apurado, previsão, chance, chamada
curl localhost:8787/health                   # está vivo?
```

- A cada 10 min (e no fim), o worker grava um snapshot da previsão no branch **[`ao-vivo`](https://github.com/joaoemanuelzilli/quem-ganha/tree/ao-vivo)**. É um registro público, com horário, do que o modelo dizia **antes** de o resultado sair. O primeiro snapshot é a previsão pré-apuração.
- Se o worker cair, `run-worker.sh` o reinicia em 5 s. Se o PC desligar, o site continua funcionando: o navegador de cada visitante baixa os totais do TSE e roda o modelo por estado.
- Para testar o site contra um worker de ensaio: `/?worker=http://localhost:8788/state.json`. Só funciona com o site rodando em `localhost`; no domínio público o parâmetro é ignorado, para ninguém exibir dados de outra fonte com a cara do site.

**Dados históricos** (opcional, ~6 GB de download): `training/run_all.sh` baixa os boletins de urna do portal de dados abertos do TSE e gera os arquivos compactos de `data/processed/`. Veja [training/README_DATA.md](training/README_DATA.md).

<img src="docs/img/stage-6.svg" width="100%" alt="Stage 6: inventário">

```
quem-ganha/
├── engine/            🧠 motor (TypeScript isomórfico: roda no Node e no navegador)
│   ├── model.ts          modelo bayesiano hierárquico + Monte Carlo
│   ├── trajectory.ts     previsão do formato do resto da apuração
│   ├── forecast.ts       monta o estado do jogo: chamada, eventos, histórico
│   ├── tse.ts            cliente da API de resultados do TSE
│   └── types.ts          contrato de dados motor ↔ dashboard
├── worker/            💻 coletor ao vivo (roda no seu PC)
├── web/               🎮 dashboard pixel-art (Vite + TS + canvas, sem framework)
├── scripts/           🛠️ priors, backtest, curvas, replay, arte do README
├── training/          🐍 download e processamento dos boletins de urna (Python)
├── data/
│   ├── priors/           1º turno 2026 por município (via API do TSE)
│   ├── processed/        linhas do tempo das apurações 2018–2026 (BWEB)
│   └── model/            parâmetros treinados, curvas de chegada, backtest
└── docs/              📜 metodologia, pesquisa, arte
```

<img src="docs/img/stage-7.svg" width="100%" alt="Bonus: lore e fontes">

- **Resultados ao vivo:** API pública de divulgação do TSE: `resultados.tse.jus.br/oficial/ele2026/6258/…` (`-u.json` por BR/UF/município, `-ab.json` com o andamento).
- **Histórico:** [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/) com os boletins de urna (BWEB) de 2018, 2022 e 2026, e votação por município e zona.
- **Pesquisas** (semana de 18–24/10/2026): Datafolha, Quaest, AtlasIntel, PoderData, BTG/Nexus, Futura, Palver, Gerp, MDA/CNT, Vox, Ipespe e outras. Lista completa e fontes em [docs/PESQUISA.md](docs/PESQUISA.md).
- **Mercado:** [Polymarket — Brazil Presidential Election](https://polymarket.com/event/brazil-presidential-election).
- **Inspirações de método:** o "needle" do NYT, os modelos de noite de eleição da Decision Desk HQ e da AP, o *elex-live-model* do Washington Post e a literatura de inferência ecológica para transferência de votos entre turnos.

---

<p align="center">
<sub>⚠️ Projeto independente e <b>não oficial</b>. É uma previsão estatística, não um resultado: o resultado oficial é só o do <a href="https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6258/uf/br/cargo/1/vis/nominal/resultados">TSE</a>. Os sprites são caricaturas em pixel art, sem nenhuma intenção ofensiva. Nenhum apoio a candidato.</sub>
</p>

<p align="center"><b>GAME OVER?</b> <i>Só quando chegar a 100%.</i> 🕹️</p>
