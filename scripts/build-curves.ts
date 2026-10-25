// Curvas de velocidade da apuração: para cada UF e município, em que minuto (após as 17h)
// a fração k/20 das seções já tinha chegado ao TSE. Usadas para prever o formato do
// restante do gráfico (trajetória) e o horário de término.
//
//   npx tsx scripts/build-curves.ts
import { writeFileSync } from 'node:fs';
import { ROOT, exists, readTimeline } from './lib/data';

const K = 20; // pontos k/K
function curveOf(rows: { minute: number; secoes: number }[]): number[] {
  const tot = rows.reduce((s, r) => s + r.secoes, 0);
  const out: number[] = [];
  let acc = 0, j = 0;
  for (let k = 0; k <= K; k++) {
    const target = (k / K) * tot;
    while (j < rows.length && acc < target) acc += rows[j++].secoes;
    out.push(k === 0 ? 0 : rows[Math.max(0, j - 1)].minute);
  }
  // monotônica
  for (let k = 1; k <= K; k++) out[k] = Math.max(out[k], out[k - 1]);
  return out;
}

function build(file: string, a: string, b: string) {
  const tl = readTimeline(file, a, b); // já ordenado por minuto, minuto >= 0
  const byUF = new Map<string, typeof tl>(), byMun = new Map<string, typeof tl>();
  for (const r of tl) {
    if (!byUF.has(r.uf)) byUF.set(r.uf, []);
    byUF.get(r.uf)!.push(r);
    if (!byMun.has(r.id)) byMun.set(r.id, []);
    byMun.get(r.id)!.push(r);
  }
  const uf: Record<string, number[]> = {}, mun: Record<string, number[]> = {};
  for (const [k, v] of byUF) uf[k] = curveOf(v);
  for (const [k, v] of byMun) mun[k] = curveOf(v);
  const nat = curveOf(tl);
  return { nat, uf, mun };
}

const out: Record<string, unknown> = { K, note: 'minuto (após 17h Brasília) em que a fração k/K das seções foi recebida' };
for (const [key, file, a, b] of [
  ['2022_t2', 'timeline_2022_t2_c1.csv.gz', 'c13', 'c22'],
  ['2026_t1', 'timeline_2026_t1_c1.csv.gz', 'c13', 'c22'],
] as const) {
  if (!exists(file)) continue;
  const c = build(file, a, b);
  out[key] = c;
  console.log(key, 'nacional:', c.nat.map((x, k) => `${(100 * k) / K}%@${x}`).join(' '));
}
writeFileSync(`${ROOT}data/model/curves.json`, JSON.stringify(out));
// versão leve (só UF + nacional) para o navegador
const light: Record<string, unknown> = { K };
for (const k of ['2022_t2', '2026_t1']) if (out[k]) { const c = out[k] as { nat: number[]; uf: unknown }; light[k] = { nat: c.nat, uf: c.uf }; }
writeFileSync(`${ROOT}data/model/curves_uf.json`, JSON.stringify(light));
console.log('ok');
