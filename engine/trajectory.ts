// Previsão do FORMATO do restante da apuração: quais votos chegam quando.
// Cada UF/município segue sua curva histórica de chegada de boletins (2022 2T),
// deslocada para a fração já apurada e com velocidade ajustada ao ritmo de hoje.
import type { PreparedModel, RunResult } from './model';
import type { TrajectoryPoint } from './types';

export interface Curves { K: number; nat: number[]; uf: Record<string, number[]>; mun?: Record<string, number[]> }

/** minuto em que a curva atinge a fração f (interpolação linear entre pontos k/K) */
export function curveMinute(c: number[], f: number): number {
  const K = c.length - 1;
  if (f <= 0) return c[0];
  if (f >= 1) return c[K];
  const x = f * K, k = Math.floor(x), t = x - k;
  return c[k] + (c[k + 1] - c[k]) * t;
}
/** fração atingida no minuto t */
export function curveFrac(c: number[], t: number): number {
  const K = c.length - 1;
  if (t <= c[0]) return 0;
  if (t >= c[K]) return 1;
  let k = 0;
  while (k < K && c[k + 1] < t) k++;
  const a = c[k], b = c[k + 1];
  return b > a ? (k + (t - a) / (b - a)) / K : (k + 1) / K;
}

/** ritmo de hoje vs histórico: >1 = mais rápido */
export function paceFactor(curves: Curves, natFrac: number, minutesSince17: number): number {
  if (minutesSince17 < 8 || natFrac <= 0.002) return 1;
  const hist = curveMinute(curves.nat, natFrac);
  return Math.min(2.5, Math.max(0.4, hist / minutesSince17));
}

export function trajectory(m: PreparedModel, r: RunResult, curves: Curves, now: Date, start: Date, maxDraws = 300): { points: TrajectoryPoint[]; eta: string | null } {
  const T = (now.getTime() - start.getTime()) / 60000;
  const U = m.ufNames.length;
  const natSec = r.counted.secoes, natSecTot = r.counted.secoesTot;
  const natFrac = natSec > 0 ? natSecTot / natSec : 0;
  const pace = paceFactor(curves, natFrac, Math.max(0, T));

  // unidades que entram na conta: municípios (se houver curva) ou UFs
  type Item = { tau: number; curve: number[]; remSec: number; remL: number; remV: number; uf: number; p: number };
  const items: Item[] = [];
  const useMun = m.level === 'municipio' && curves.mun;
  for (let i = 0; i < m.n; i++) {
    const remSec = Math.max(0, m.secoes[i] - r.unitSecTot[i]);
    if (remSec <= 0 && r.unitRemValid[i] <= 0) continue;
    const id = m.units[i].id, uf = m.units[i].uf;
    const curve = (useMun ? curves.mun![id] : undefined) ?? curves.uf[uf] ?? curves.nat;
    const p = m.secoes[i] > 0 ? r.unitSecTot[i] / m.secoes[i] : 0;
    // posição na curva: o que já foi apurado; se está atrasado em relação ao relógio, recomeça "agora"
    const tau = Math.max(curveMinute(curve, p), 0);
    items.push({ tau, curve, remSec, remL: r.unitRemLula[i], remV: r.unitRemValid[i], uf: m.ufIndex[i], p });
  }
  // dispersão por sorteio (nível UF) para as faixas
  const D = Math.min(maxDraws, r.uf[0]?.remLula.length ?? 0);
  const ufMeanL = r.uf.map((u) => avg(u.remLula)), ufMeanV = r.uf.map((u) => avg(u.remValid));

  const points: TrajectoryPoint[] = [];
  let eta: string | null = null;
  const lulaAt = new Float64Array(D);
  const maxStep = Math.ceil(720 / pace);
  for (let step = 0; step <= maxStep; step += 2) {
    // minutos "históricos" avançados
    const adv = step * pace;
    let sec = natSecTot, L = r.counted.lula, V = r.counted.validos;
    const ufG = new Float64Array(U), ufW = new Float64Array(U);
    for (const it of items) {
      const f = curveFrac(it.curve, it.tau + adv);
      const g = it.p >= 1 ? 1 : Math.max(0, Math.min(1, (f - it.p) / (1 - it.p)));
      sec += g * it.remSec; L += g * it.remL; V += g * it.remV;
      ufG[it.uf] += g * it.remV; ufW[it.uf] += it.remV;
    }
    const pct = natSec > 0 ? (100 * sec) / natSec : 0;
    const p50 = V > 0 ? (100 * L) / V : 50;
    // faixa: perturba os votos restantes por UF conforme cada sorteio
    for (let d = 0; d < D; d++) {
      let l = L, v = V;
      for (let u = 0; u < U; u++) {
        const frac = ufW[u] > 0 ? ufG[u] / ufW[u] : 0;
        if (frac <= 0) continue;
        l += frac * (r.uf[u].remLula[d] - ufMeanL[u]);
        v += frac * (r.uf[u].remValid[d] - ufMeanV[u]);
      }
      lulaAt[d] = v > 0 ? (100 * l) / v : 50;
    }
    const s = Float64Array.from(lulaAt).sort();
    const q = (x: number) => (D ? s[Math.min(D - 1, Math.max(0, Math.round(x * (D - 1))))] : p50);
    const t = new Date(Math.max(now.getTime(), start.getTime()) + step * 60000).toISOString();
    const last = points[points.length - 1];
    if (V <= 0) continue;
    if (!last || pct - last.pct >= 0.5 || pct >= 99.95) points.push({ pct, t, lula: { p05: q(0.05), p50, p95: q(0.95) } });
    if (pct >= 99.5 && !eta) eta = t;
    if (pct >= 99.95) break;
  }
  return { points, eta: natFrac >= 1 ? null : eta };
}

const avg = (a: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
