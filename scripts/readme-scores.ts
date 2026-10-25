// Escreve a tabela de HIGH SCORES do README a partir de data/model/backtest.json
//   npx tsx scripts/readme-scores.ts
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const bt = JSON.parse(readFileSync(`${ROOT}data/model/backtest.json`, 'utf8'));
type Row = { cp: number; n: number; maeBayes: number; maeUniform: number; maeUF: number; maeNaive: number; cover90: number; winOk: number; pTrue: number };
type M = { key: string; cp: number; pred: number; lo: number; hi: number; truth: number; err: number; naive: number; pTrue: number; minute: number };
const f = (x: number) => x.toFixed(2).replace('.', ',');
const pc = (x: number) => `${Math.round(100 * x)}%`;
const medal = (i: number) => ['🥇', '🥈', '🥉', '4º'][i] ?? '';

function table(rows: Row[]) {
  let s = '| % apurado | 🧠 **BAYES** | swing uniforme | projeção por UF | placar cru (TV) | intervalo 90% cobre | acertou vencedor | P(vencedor certo) |\n|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows) {
    const vals = [r.maeBayes, r.maeUniform, r.maeUF, r.maeNaive];
    const order = [...vals].sort((a, b) => a - b);
    const cell = (v: number) => `${f(v)} ${medal(order.indexOf(v)) === '🥇' ? '🥇' : ''}`.trim();
    s += `| **${String(r.cp).replace('.', ',')}%** | **${cell(r.maeBayes)}** | ${cell(r.maeUniform)} | ${cell(r.maeUF)} | ${cell(r.maeNaive)} | ${pc(r.cover90)} | ${pc(r.winOk)} | ${pc(r.pTrue)} |\n`;
  }
  return s;
}

const mun: Row[] = bt.municipio.summary;
const metrics: M[] = bt.municipio.metrics;
const pres = metrics.filter((m) => m.key.includes('-PR'));
const presRows: Row[] = [...new Set(pres.map((m) => m.cp))].map((cp) => {
  const xs = pres.filter((m) => m.cp === cp);
  const mae = (g: (m: M) => number) => xs.reduce((s, m) => s + Math.abs(g(m)), 0) / xs.length;
  return { cp, n: xs.length, maeBayes: mae((m) => m.err), maeUniform: mae((m) => (m as unknown as { uniform: number }).uniform - m.truth), maeUF: mae((m) => (m as unknown as { ufextrap: number }).ufextrap - m.truth), maeNaive: mae((m) => m.naive - m.truth), cover90: xs.filter((m) => m.truth >= m.lo && m.truth <= m.hi).length / xs.length, winOk: xs.filter((m) => (m.pred > 50) === (m.truth > 50)).length / xs.length, pTrue: xs.reduce((s, m) => s + m.pTrue, 0) / xs.length };
});

// termômetros (só presidenciais): erro médio quando disponível
const thermo = [...new Set(pres.map((m) => m.cp))].map((cp) => {
  const xs = pres.filter((m) => m.cp === cp) as (M & { minas: number | null; nordeste: number | null })[];
  const mae = (k: 'minas' | 'nordeste') => { const ys = xs.filter((m) => m[k] !== null); return ys.length ? ys.reduce((s, m) => s + Math.abs((m[k] as number) - m.truth), 0) / ys.length : null; };
  return { cp, minas: mae('minas'), nordeste: mae('nordeste'), bayes: xs.reduce((s, m) => s + Math.abs(m.err), 0) / xs.length };
});
let thermoTable = '| % apurado | 🧠 BAYES (Brasil todo) | 🔺 só Minas | 🌵 só Nordeste |\n|---:|---:|---:|---:|\n';
for (const t of thermo) thermoTable += `| ${String(t.cp).replace('.', ',')}% | **${f(t.bayes)}** | ${t.minas === null ? '—' : f(t.minas)} | ${t.nordeste === null ? '—' : f(t.nordeste)} |\n`;

const at1 = metrics.filter((m) => m.cp === 1);
let detail = '| eleição reproduzida | horário com 1% | placar cru | 🧠 previsão (intervalo 90%) | resultado real | erro | chance dada ao vencedor real |\n|---|---:|---:|---:|---:|---:|---:|\n';
for (const m of at1) {
  const hh = 17 + Math.floor(m.minute / 60), mm = m.minute % 60;
  detail += `| ${m.key} | ${hh}:${String(mm).padStart(2, '0')} | ${f(m.naive)}% | **${f(m.pred)}%** (${f(m.lo)}–${f(m.hi)}) | ${f(m.truth)}% | ${m.err >= 0 ? '+' : ''}${f(m.err)} | ${pc(m.pTrue)} |\n`;
}

const r1 = mun.find((r) => r.cp === 1)!;
const p1 = presRows.find((r) => r.cp === 1)!;
const p5 = presRows.find((r) => r.cp === 5)!;
const block = `<!--HIGHSCORES-->
> 🏆 **Com 1% das urnas apuradas**, o modelo erra o resultado final em média **${f(r1.maeBayes)} ponto** nas 15 apurações (o placar da TV erra **${f(r1.maeNaive)}**). Acertou o vencedor em **${pc(r1.winOk)}** dos casos. Nas **presidenciais**, o erro é de **${f(p1.maeBayes)} ponto com 1%** e **${f(p5.maeBayes)} com 5%**.

**🎮 Presidenciais (2022 1T, 2022 2T, 2026 1T)** — erro médio absoluto em pontos percentuais do resultado final:

${table(presRows)}
<details><summary><b>📊 Todas as 15 apurações (presidente + 12 governadores)</b></summary>

${table(mun)}
</details>

<details><summary><b>🌡️ Termômetros populares: "quem ganha em Minas ganha" e "o Nordeste decide" (presidenciais)</b></summary>

Erro médio (pontos) se usássemos **só** o swing de Minas, ou **só** o do Nordeste, para projetar o Brasil inteiro. Os dois termômetros funcionam, mas olhar o país inteiro é melhor. No começo da apuração ainda há pouco voto de MG e do NE apurado (—):

${thermoTable}
</details>

<details><summary><b>🔍 Caso a caso, com 1% apurado</b></summary>

${detail}
</details>

*"Intervalo 90% cobre" = em quantos casos o resultado real caiu dentro do intervalo de 90% do modelo (o ideal é ~90%). Correção do viés das pesquisas em validação cruzada (leave-one-out). Dados completos em [\`data/model/backtest.json\`](data/model/backtest.json).*
<!--/HIGHSCORES-->`;

const readme = readFileSync(`${ROOT}README.md`, 'utf8');
const out = readme.includes('<!--/HIGHSCORES-->')
  ? readme.replace(/<!--HIGHSCORES-->[\s\S]*<!--\/HIGHSCORES-->/, block)
  : readme.replace('<!--HIGHSCORES-->', block);
writeFileSync(`${ROOT}README.md`, out);
console.log('README atualizado');
