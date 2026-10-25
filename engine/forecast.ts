// Monta o ForecastState (o que o dashboard desenha) a partir do ajuste do modelo.
import { UF_NAMES } from './tse';
import { NE_UFS, prepare, run, type ModelParams, type PreparedModel, type RunResult } from './model';
import { trajectory, type Curves } from './trajectory';
import type { CandKey, Candidate, ForecastState, GameEvent, HistoryPoint, StateRow, Thermometers, UnitObs, UnitPrior } from './types';

export const CANDIDATES: Candidate[] = [
  { key: 'lula', nr: 13, name: 'LULA', fullName: 'Luiz Inácio Lula da Silva', party: 'PT', color: '#e8222e' },
  { key: 'flavio', nr: 22, name: 'FLÁVIO', fullName: 'Flávio Bolsonaro', party: 'PL', color: '#19c35a' },
];

export const COUNT_START = new Date('2026-10-25T17:00:00-03:00');

export interface National {
  dg: string; hg: string;
  secoes: number; secoesTot: number; aptos: number; aptosTot: number; comp: number;
  lula: number; flavio: number; brancos: number; nulos: number;
}

export interface BuildInput {
  priors: UnitPrior[];
  level: 'municipio' | 'uf';
  params: ModelParams;
  obs: Map<string, UnitObs>;
  national?: National | null;  // totais oficiais BR (se ausente, soma das unidades)
  curves: Curves;
  now: Date;
  start?: Date;
  source: ForecastState['source'];
  prev?: ForecastState | null;
  priorSource?: string;
  prepared?: PreparedModel;   // cache
}

const pctf = (x: number) => x.toFixed(1).replace('.', ',');
const nameOf = (k: CandKey) => (k === 'lula' ? 'LULA' : 'FLÁVIO');

export function buildForecast(inp: BuildInput): { state: ForecastState; prepared: PreparedModel; result: RunResult } {
  const start = inp.start ?? COUNT_START;
  const m = inp.prepared ?? prepare(inp.priors, inp.level, inp.params);
  const r = run(m, inp.obs);
  const tr = trajectory(m, r, inp.curves, inp.now, start);

  const nat: National = inp.national ?? {
    dg: '', hg: '', secoes: r.counted.secoes, secoesTot: r.counted.secoesTot, aptos: r.counted.aptos, aptosTot: r.counted.aptosTot,
    comp: r.counted.comp, lula: r.counted.lula, flavio: r.counted.flavio, brancos: r.counted.brancos, nulos: r.counted.nulos,
  };
  const validos = nat.lula + nat.flavio;
  const pct = nat.secoes > 0 ? (100 * nat.secoesTot) / nat.secoes : 0;
  const lulaPct = validos > 0 ? (100 * nat.lula) / validos : 0;
  const status: ForecastState['status'] = pct >= 100 ? 'final' : nat.secoesTot > 0 ? 'counting' : 'pre';

  // ── chamada ──
  const wp = r.winProbLula;
  const leader: CandKey = wp >= 0.5 ? 'lula' : 'flavio';
  const pLeader = Math.max(wp, 1 - wp);
  const remainingMax = r.maxRemainingValid;
  let call: ForecastState['forecast']['call'] = 'none';
  if (status !== 'pre' && Math.abs(nat.lula - nat.flavio) > remainingMax) call = 'mathematical';
  else if (status !== 'pre' && pct >= 1 && pLeader >= 0.99) call = 'projected';
  else if (status !== 'pre' && pct >= 0.3 && pLeader >= 0.70) call = 'lean';
  const finalLeader: CandKey = call === 'mathematical' ? (nat.lula > nat.flavio ? 'lula' : 'flavio') : leader;
  const prev = inp.prev ?? null;
  let calledAt: string | undefined;
  if (call === 'projected' || call === 'mathematical') {
    calledAt = prev?.forecast.calledAt && prev.forecast.leader === finalLeader && (prev.forecast.call === 'projected' || prev.forecast.call === 'mathematical')
      ? prev.forecast.calledAt : inp.now.toISOString();
  }

  // ── estados ──
  const ufPrior = new Map<string, { l: number; f: number }>();
  for (const p of inp.priors) { const o = ufPrior.get(p.uf) ?? { l: 0, f: 0 }; o.l += p.t1.lula; o.f += p.t1.flavio; ufPrior.set(p.uf, o); }
  const states: StateRow[] = r.uf.map((u) => {
    const c = u.counted, tp = ufPrior.get(u.uf) ?? { l: 1, f: 1 };
    return {
      uf: u.uf, name: UF_NAMES[u.uf] ?? u.uf.toUpperCase(),
      pct: c.secoes > 0 ? (100 * c.secoesTot) / c.secoes : 0,
      lulaPct: c.validos > 0 ? (100 * c.lula) / c.validos : null,
      projLulaPct: u.projLula, winProbLula: u.winProbLula, aptos: c.aptos, validosProj: u.validosProj,
      t1LulaTwoParty: (100 * tp.l) / Math.max(1, tp.l + tp.f),
    };
  });

  let t1l = 0, t1f = 0;
  for (const p of inp.priors) { t1l += p.t1.lula; t1f += p.t1.flavio; }

  // ── termômetros (Minas e Nordeste) ──
  const meth = Object.fromEntries(r.methods.map((x) => [x.id, x.lulaPct]));
  const mg = states.find((s) => s.uf === 'mg');
  let neL = 0, neV = 0, neCL = 0, neCV = 0, neSec = 0, neSecTot = 0, otherL = 0, otherV = 0, neT1l = 0, neT1f = 0;
  for (const u of r.uf) {
    const projL = u.counted.lula + avgArr(u.remLula), projV = u.counted.validos + avgArr(u.remValid);
    if (NE_UFS.includes(u.uf)) { neL += projL; neV += projV; neCL += u.counted.lula; neCV += u.counted.validos; neSec += u.counted.secoes; neSecTot += u.counted.secoesTot; }
    else { otherL += projL; otherV += projV; }
  }
  for (const p of inp.priors) if (NE_UFS.includes(p.uf)) { neT1l += p.t1.lula; neT1f += p.t1.flavio; }
  const thermometers: Thermometers | undefined = mg ? {
    minas: {
      pct: mg.pct, lulaPct: mg.lulaPct, projLulaPct: mg.projLulaPct, winProbLula: mg.winProbLula,
      leader: mg.projLulaPct >= 50 ? 'lula' : 'flavio',
      record: 'Quem venceu em MG venceu o Brasil em todos os 2º turnos desde 1989 (e no 1º turno de 2026)',
      impliedNationalLula: meth.minas ?? null,
    },
    nordeste: {
      pct: neSec > 0 ? (100 * neSecTot) / neSec : 0,
      lulaPct: neCV > 0 ? (100 * neCL) / neCV : null,
      projLulaPct: neV > 0 ? (100 * neL) / neV : 0,
      neededLulaPct: neV > 0 ? (100 * (0.5 * (neV + otherV) - otherL)) / neV : 50,
      t1LulaPct: (100 * neT1l) / Math.max(1, neT1l + neT1f),
      impliedNationalLula: meth.nordeste ?? null,
    },
  } : undefined;
  const t1Two = (100 * t1l) / Math.max(1, t1l + t1f);

  // ── histórico ──
  const history: HistoryPoint[] = prev?.history ? [...prev.history] : [];
  const hp: HistoryPoint = { t: inp.now.toISOString(), pct, lulaPct, projLulaPct: r.lulaQ.mean, projLo: r.lulaQ.p05, projHi: r.lulaQ.p95, winProbLula: wp };
  if (status !== 'pre') {
    const last = history[history.length - 1];
    if (!last || Math.abs(last.pct - pct) > 1e-6 || Math.abs(last.lulaPct - lulaPct) > 1e-6) history.push(hp);
    else history[history.length - 1] = { ...hp, t: last.t };
  }
  if (history.length > 3000) history.splice(0, history.length - 3000);

  // ── eventos ──
  const events: GameEvent[] = prev?.events ? [...prev.events] : [];
  const t = inp.now.toISOString();
  const push = (e: Omit<GameEvent, 't'>) => events.unshift({ t, ...e });
  if (prev) {
    const pp = prev.progress.pct;
    if (prev.status === 'pre' && status !== 'pre') push({ kind: 'info', text: '▶ ROUND 2 — FIGHT! Primeiros boletins de urna chegando ao TSE' });
    for (const ms of [0.5, 1, 2, 5, 10, 25, 50, 75, 90, 95, 99, 100])
      if (pp < ms && pct >= ms) push({ kind: 'milestone', text: `⏱ ${String(ms).replace('.', ',')}% APURADO — Lula ${pctf(lulaPct)}% × Flávio ${pctf(100 - lulaPct)}% · previsão final Lula ${pctf(r.lulaQ.mean)}%` });
    const prevLead = prev.current.leader, curLead: CandKey | null = validos > 0 ? (nat.lula >= nat.flavio ? 'lula' : 'flavio') : null;
    if (prevLead && curLead && prevLead !== curLead) push({ kind: 'lead', who: curLead, text: `⚔ VIRADA NA APURAÇÃO! ${nameOf(curLead)} passa à frente (${pctf(curLead === 'lula' ? lulaPct : 100 - lulaPct)}%)` });
    if (prev.status !== 'pre' && prev.forecast.leader !== leader && call !== 'mathematical') push({ kind: 'swing', who: leader, text: `🔮 O MODELO MUDOU DE LADO: agora ${nameOf(leader)} é favorito (${(100 * pLeader).toFixed(0)}%)` });
    const rank = { none: 0, lean: 1, projected: 2, mathematical: 3 } as const;
    if (rank[call] > rank[prev.forecast.call] && call !== 'lean') push({ kind: 'call', who: finalLeader, text: call === 'mathematical' ? `🏆 ${nameOf(finalLeader)} VENCEU — virada matematicamente impossível` : `🏆 VITÓRIA PROJETADA: ${nameOf(finalLeader)} (${(100 * pLeader).toFixed(1)}% de chance) com ${pctf(pct)}% apurado` });
    else if (call === 'lean' && prev.forecast.call === 'none') push({ kind: 'swing', who: leader, text: `📈 VANTAGEM ${nameOf(leader)}: ${(100 * pLeader).toFixed(0)}% de chance segundo o modelo` });
    for (const s of states) {
      const ps = prev.states.find((x) => x.uf === s.uf);
      if (ps && ps.pct < 100 && s.pct >= 100 && s.lulaPct !== null) {
        const w: CandKey = s.lulaPct >= 50 ? 'lula' : 'flavio';
        push({ kind: 'state', who: w, text: `🗺 ${s.uf.toUpperCase()} 100% apurado: ${nameOf(w)} ${pctf(w === 'lula' ? s.lulaPct : 100 - s.lulaPct)}%` });
      }
    }
  } else {
    push({ kind: 'info', text: status === 'pre' ? '🕹 INSERT COIN — apuração começa às 17h (Brasília)' : `▶ Modelo iniciado com ${pctf(pct)}% apurado` });
  }
  if (events.length > 80) events.length = 80;

  const state: ForecastState = {
    version: 1,
    generatedAt: inp.now.toISOString(),
    source: inp.source,
    election: { id: '6258', turno: 2, name: 'Eleição Presidencial 2026 — 2º turno' },
    status,
    tse: { dg: nat.dg, hg: nat.hg },
    candidates: CANDIDATES,
    progress: { secoes: nat.secoes, secoesTot: nat.secoesTot, pct, aptos: nat.aptos, aptosTot: nat.aptosTot, comp: nat.comp, turnoutPct: nat.aptosTot > 0 ? (100 * nat.comp) / nat.aptosTot : 0 },
    current: { lula: nat.lula, flavio: nat.flavio, validos, brancos: nat.brancos, nulos: nat.nulos, lulaPct, flavioPct: validos > 0 ? 100 - lulaPct : 0, margin: nat.lula - nat.flavio, leader: validos > 0 ? (nat.lula >= nat.flavio ? 'lula' : 'flavio') : null },
    forecast: {
      lulaPct: r.lulaQ, winProbLula: wp, leader: finalLeader, call, calledAt,
      projVotes: r.projVotes, turnoutPct: r.turnoutPct,
      swingVsT1: r.lulaQ.mean - t1Two,
      methods: r.methods,
      trajectory: tr.points, etaFinish: tr.eta,
      units: m.level, unitsReporting: r.unitsReporting, unitsTotal: m.n,
      warmingUp: status === 'counting' && pct < 1,
    },
    prior: { lulaPct: inp.params.priorLula ?? t1Two, sd: inp.params.priorSd, source: inp.priorSource ?? 'Média das pesquisas finais + correção do viés histórico' },
    thermometers,
    history, states, events,
  };
  return { state, prepared: m, result: r };
}

function avgArr(a: Float64Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
