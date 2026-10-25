// Carrega os priors empacotados (data/priors/*.json) e enxuga o estado para publicação.
import type { ForecastState, UnitPrior } from './types';

interface Packed { fields: string[]; rows: (string | number)[][] }

export function unpack(p: Packed): UnitPrior[] {
  const f = Object.fromEntries(p.fields.map((k, i) => [k, i]));
  return p.rows.map((r) => ({
    id: String(r[f.id]), uf: String(r[f.uf]), name: String(r[f.name]),
    aptos: Number(r[f.aptos]), secoes: Number(r[f.secoes]),
    t1: {
      lula: Number(r[f.lula]), flavio: Number(r[f.flavio]), outros: Number(r[f.outros]), validos: Number(r[f.validos]),
      brancos: Number(r[f.brancos]), nulos: Number(r[f.nulos]), comp: Number(r[f.comp]),
    },
  }));
}

export function loadPriors(mun: Packed, uf: Packed): { mun: UnitPrior[]; uf: UnitPrior[] } {
  return { mun: unpack(mun), uf: unpack(uf) };
}

/** reduz o histórico (≤ 480 pontos) e a trajetória (≤ 160) para caber leve no Blob/navegador */
export function slimState(s: ForecastState): ForecastState {
  const thin = <T>(a: T[], max: number): T[] => {
    if (a.length <= max) return a;
    const out: T[] = [];
    const step = (a.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(a[Math.round(i * step)]);
    return out;
  };
  const r2 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    ...s,
    history: thin(s.history, 480).map((h) => ({ ...h, pct: r2(h.pct), lulaPct: r2(h.lulaPct), projLulaPct: r2(h.projLulaPct), projLo: r2(h.projLo), projHi: r2(h.projHi), winProbLula: r2(h.winProbLula) })),
    forecast: {
      ...s.forecast,
      trajectory: thin(s.forecast.trajectory, 160).map((p) => ({ ...p, pct: r2(p.pct), lula: { p05: r2(p.lula.p05), p50: r2(p.lula.p50), p95: r2(p.lula.p95) } })),
    },
    events: s.events.slice(0, 50),
  };
}
