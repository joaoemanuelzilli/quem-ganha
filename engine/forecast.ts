// Monta o ForecastState (o que o dashboard desenha) a partir do ajuste do modelo.
import { UF_NAMES } from './tse';
import { NE_UFS, prepare, run, type ModelParams, type PreparedModel, type RunResult } from './model';
import { trajectory, type Curves } from './trajectory';
import { invLogit, logit, quantile } from './random';
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
  /** o TSE marcou a totalização como encerrada (tf='s' / and='f') */
  finished?: boolean;
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
  /** COMBO: mistura com o modelo por UF (que erra menos no comecinho). */
  blend?: { uf: RunResult; weight: number };
  /** erro histórico de cada método (data/model/method_scores.json) */
  scores?: Record<string, { mae1: number | null; mae5: number | null }>;
}

/** peso do modelo por UF no COMBO: 75% até 1% apurado, caindo a 0 em 5% (backtest das presidenciais) */
export function comboWeight(pct: number): number {
  if (pct <= 0) return 0;
  if (pct <= 1) return 0.75;
  if (pct >= 5) return 0;
  return 0.75 * (5 - pct) / 4;
}

const pctf = (x: number) => x.toFixed(1).replace('.', ',');
const nameOf = (k: CandKey) => (k === 'lula' ? 'LULA' : 'FLÁVIO');

export function buildForecast(inp: BuildInput): { state: ForecastState; prepared: PreparedModel; result: RunResult } {
  const start = inp.start ?? COUNT_START;
  const m = inp.prepared ?? prepare(inp.priors, inp.level, inp.params);
  const r = run(m, inp.obs);
  const tr = trajectory(m, r, inp.curves, inp.now, start);
  const munMean = r.lulaQ.mean, munWin = r.winProbLula;

  // ── COMBO: MISTURA de cenários (fração w vem do modelo por UF). Quando os dois discordam,
  //    a incerteza aumenta — nada de herdar o intervalo estreito de um deles.
  const w = inp.blend?.weight ?? 0;
  if (inp.blend && w > 0) {
    const ufD = inp.blend.uf.finalLula, nU = Math.round(w * r.finalLula.length);
    const d = Float64Array.from(r.finalLula, (x, k) => (k < nU && ufD.length ? ufD[k % ufD.length] : x));
    for (const u of r.uf) {
      const v = inp.blend.uf.uf.find((x) => x.uf === u.uf);
      if (v) { u.projLula = (1 - w) * u.projLula + w * v.projLula; u.winProbLula = (1 - w) * u.winProbLula + w * v.winProbLula; }
    }
    const s = Float64Array.from(d).sort();
    let mu = 0, wins = 0;
    for (const x of d) { mu += x; if (x > 50) wins++; }
    mu /= d.length;
    r.finalLula = d;
    r.lulaQ = { mean: mu, p05: quantile(s, 0.05), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p95: quantile(s, 0.95) };
    r.winProbLula = wins / d.length;
    const ratio = mu / munMean;
    r.projVotes = { ...r.projVotes, lula: r.projVotes.lula * ratio, flavio: r.projVotes.validos - r.projVotes.lula * ratio };
    // a trajetória termina na previsão do COMBO: ajuste proporcional ao que falta apurar
    const p0 = tr.points[0]?.pct ?? 0;
    for (const pt of tr.points) {
      const k = p0 >= 100 ? 1 : (pt.pct - p0) / (100 - p0);
      const dl = (mu - munMean) * k;
      pt.lula = { p05: pt.lula.p05 + dl, p50: pt.lula.p50 + dl, p95: pt.lula.p95 + dl };
    }
    r.methods = [
      { id: 'combo', name: 'COMBO FINAL', desc: `Mistura do Bayes por município (${Math.round(100 * (1 - w))}%) com o Bayes por estado (${Math.round(100 * w)}%): no comecinho o por estado erra menos; a partir de 5% só o municipal`, lulaPct: mu, winProbLula: r.winProbLula, official: true },
      ...r.methods.map((x) => (x.id === 'bayes' ? { ...x, weight: 1 - w, official: false } : x)),
    ];
  }
  for (const x of r.methods) {
    if (x.id === 'bayes' && !(inp.blend && w > 0)) { x.official = true; x.weight = 1; x.lulaPct = munMean; x.winProbLula = munWin; }
    const sc = inp.scores?.[x.id];
    if (sc) { x.mae1 = sc.mae1; x.mae5 = sc.mae5; }
  }

  const nat: National = inp.national ?? {
    dg: '', hg: '', secoes: r.counted.secoes, secoesTot: r.counted.secoesTot, aptos: r.counted.aptos, aptosTot: r.counted.aptosTot,
    comp: r.counted.comp, lula: r.counted.lula, flavio: r.counted.flavio, brancos: r.counted.brancos, nulos: r.counted.nulos,
  };
  const validos = nat.lula + nat.flavio;
  const pct = nat.secoes > 0 ? (100 * nat.secoesTot) / nat.secoes : 0;
  const lulaPct = validos > 0 ? (100 * nat.lula) / validos : 0;
  const status: ForecastState['status'] = nat.secoesTot > 0 && (pct >= 100 || nat.finished) ? 'final' : nat.secoesTot > 0 ? 'counting' : 'pre';
  if (status === 'final' && validos > 0) {
    // fim de jogo: o número oficial manda (nada de diferença de arredondamento/municípios faltando)
    r.lulaQ = { mean: lulaPct, p05: lulaPct, p25: lulaPct, p50: lulaPct, p75: lulaPct, p95: lulaPct };
    r.winProbLula = nat.lula > nat.flavio ? 1 : nat.lula < nat.flavio ? 0 : 0.5;
    r.projVotes = { lula: nat.lula, flavio: nat.flavio, validos, comp: nat.comp };
    for (const x of r.methods) if (x.official) { x.lulaPct = lulaPct; x.winProbLula = r.winProbLula; }
  }

  // ── chamada ──
  const wp = r.winProbLula;
  const leader: CandKey = wp >= 0.5 ? 'lula' : 'flavio';
  const pLeader = Math.max(wp, 1 - wp);
  // eleitores ainda não apurados no MESMO arquivo do placar (limite superior dos votos restantes)
  const remainingMax = inp.national ? Math.max(0, nat.aptos - nat.aptosTot) : r.maxRemainingValid;
  const pf = inp.prev?.forecast;
  let call: ForecastState['forecast']['call'] = 'none';
  if (status !== 'pre' && validos > 0 && Math.abs(nat.lula - nat.flavio) > remainingMax) call = 'mathematical';
  else if (status !== 'pre' && pct >= 1 && pLeader >= 0.99) call = 'projected';
  // histerese: uma vez cravado, só "descrava" se a confiança cair abaixo de 95% (ou trocar de lado)
  else if (status !== 'pre' && pf?.call === 'projected' && pf.leader === leader && pLeader >= 0.95) call = 'projected';
  else if (status !== 'pre' && pct >= 0.3 && pLeader >= 0.70) call = 'lean';
  else if (status !== 'pre' && (pf?.call === 'lean' || pf?.call === 'projected') && pf.leader === leader && pLeader >= 0.65) call = 'lean';
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
    const projV = u.validosProj, projL = (u.projLula / 100) * projV;
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
    const has = (prefix: string) => events.some((e) => e.text.startsWith(prefix));
    const lastSide = () => events.find((e) => e.kind === 'swing' || e.kind === 'call')?.who;
    if (prev.status === 'pre' && status !== 'pre' && !has('▶ ROUND 2')) push({ kind: 'info', text: '▶ ROUND 2 — FIGHT! Primeiros boletins de urna chegando ao TSE' });
    for (const ms of [0.5, 1, 2, 5, 10, 25, 50, 75, 90, 95, 99, 100]) {
      const label = `⏱ ${String(ms).replace('.', ',')}% APURADO`;
      if (pp < ms && pct >= ms && !has(label)) push({ kind: 'milestone', text: `${label} — Lula ${pctf(lulaPct)}% × Flávio ${pctf(100 - lulaPct)}% · previsão final Lula ${pctf(r.lulaQ.mean)}%` });
    }
    const prevLead = prev.current.leader, curLead: CandKey | null = validos > 0 ? (nat.lula >= nat.flavio ? 'lula' : 'flavio') : null;
    if (prevLead && curLead && prevLead !== curLead) push({ kind: 'lead', who: curLead, text: `⚔ VIRADA NA APURAÇÃO! ${nameOf(curLead)} passa à frente (${pctf(curLead === 'lula' ? lulaPct : 100 - lulaPct)}%)` });
    // o modelo mudou de lado: só anuncia com convicção mínima e se for diferente do último lado anunciado
    const ls = lastSide();
    if (prev.status !== 'pre' && call !== 'mathematical' && pLeader >= 0.6 && ls && ls !== leader) push({ kind: 'swing', who: leader, text: `🔮 O MODELO MUDOU DE LADO: agora ${nameOf(leader)} é favorito (${(100 * pLeader).toFixed(0)}%)` });
    const lastCallWho = events.find((e) => e.kind === 'call')?.who;
    if (call === 'mathematical' && !events.some((e) => e.kind === 'call' && e.text.includes('VENCEU'))) push({ kind: 'call', who: finalLeader, text: `🏆 ${nameOf(finalLeader)} VENCEU — virada matematicamente impossível` });
    else if (call === 'projected' && lastCallWho !== finalLeader) push({ kind: 'call', who: finalLeader, text: `🏆 VITÓRIA PROJETADA: ${nameOf(finalLeader)} (${(100 * pLeader).toFixed(1)}% de chance) com ${pctf(pct)}% apurado` });
    else if (call === 'lean' && lastSide() !== leader) push({ kind: 'swing', who: leader, text: `📈 VANTAGEM ${nameOf(leader)}: ${(100 * pLeader).toFixed(0)}% de chance segundo o modelo` });
    for (const s of states) {
      const ps = prev.states.find((x) => x.uf === s.uf);
      if (ps && ps.pct < 100 && s.pct >= 100 && s.lulaPct !== null && !has(`🗺 ${s.uf.toUpperCase()} 100%`)) {
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
      trajectory: tr.points, etaFinish: status === 'final' ? null : tr.eta,
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
