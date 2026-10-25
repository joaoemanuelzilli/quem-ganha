// Erro histórico (backtest, presidenciais) de cada método com 1% e 5% apurado → data/model/method_scores.json
//   npx tsx scripts/method-scores.ts
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
const bt = JSON.parse(readFileSync(`${ROOT}data/model/backtest.json`, 'utf8'));
type M = Record<string, number | string | null> & { key: string; cp: number; truth: number; pred: number };
const pres = (bt.municipio.metrics as M[]).filter((m) => String(m.key).includes('-PR'));
const presUF = (bt.uf.metrics as M[]).filter((m) => String(m.key).includes('-PR'));
const mae = (xs: M[], cp: number, f: (m: M) => number | null) => {
  const ys = xs.filter((m) => m.cp === cp).map(f).filter((v): v is number => v !== null && Number.isFinite(v));
  return ys.length ? +(ys.reduce((s, v) => s + Math.abs(v), 0) / ys.length).toFixed(2) : null;
};
const out: Record<string, { mae1: number | null; mae5: number | null }> = {};
const add = (id: string, xs: M[], f: (m: M) => number | null) => { out[id] = { mae1: mae(xs, 1, f), mae5: mae(xs, 5, f) }; };
add('bayes', pres, (m) => m.pred - m.truth);
add('bayes-uf', presUF, (m) => m.pred - m.truth);
for (const k of ['uniform', 'ufextrap', 'naive', 'minas', 'nordeste']) add(k, pres, (m) => (m[k] === null ? null : (m[k] as number) - m.truth));
writeFileSync(`${ROOT}data/model/method_scores.json`, JSON.stringify({ note: 'erro médio absoluto (pp) do resultado final nas presidenciais 2022 1T/2T e 2026 1T, com 1% e 5% apurado', ...out }, null, 2));
console.log(out);
