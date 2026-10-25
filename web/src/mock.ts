// Simulador de apuração para desenvolvimento e para o MODO DEMO público.
// Gera ForecastState realistas: começo puxado pelo Sul/Sudeste (Flávio na frente),
// Nordeste chega depois e Lula vira por volta de 60–70% das seções; a previsão
// converge com a faixa de incerteza encolhendo. Determinístico por "loop".
import type {
  CandKey,
  Candidate,
  ForecastState,
  GameEvent,
  HistoryPoint,
  MethodResult,
  Quantiles,
  StateRow,
  Thermometers,
  TrajectoryPoint,
} from '../../engine/types';
import type { FeedMeta } from './feed';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Segundos reais (ticks de 1 s) de 0 → 100% das seções. */
const DEMO_TICKS = 90;
/** Ticks com status 'final' antes de reiniciar o loop. */
const FINAL_HOLD_TICKS = 12;
/** 25/10/2026 17:00:00 Brasília = 20:00:00 UTC. */
const SIM_START = Date.UTC(2026, 9, 25, 20, 0, 0);
/** 17:00 → 21:10 (250 min) simulados ao longo dos 90 s. */
const SIM_SPAN = 250 * 60_000;
const BRT_OFFSET = -3 * 3_600_000;

const CANDIDATES: Candidate[] = [
  { key: 'lula', nr: 13, name: 'LULA', fullName: 'Luiz Inácio Lula da Silva', party: 'PT', color: '#e8222e' },
  { key: 'flavio', nr: 22, name: 'FLÁVIO', fullName: 'Flávio Bolsonaro', party: 'PL', color: '#19c35a' },
];
const ELECTION = { id: '6258', turno: 2, name: 'Eleição Geral Federal 2026 — 2º turno' };
const PRIOR = { lulaPct: 49.6, sd: 2.1, source: 'Média das pesquisas (Quaest, Datafolha, AtlasIntel)' };

type Region = 'N' | 'NE' | 'CO' | 'SE' | 'S' | 'EX';

/** [uf, nome, eleitorado (milhões), % Lula 2º turno 2022, região] */
const UF_BASE: Array<[string, string, number, number, Region]> = [
  ['ac', 'Acre', 0.59, 29.7, 'N'],
  ['al', 'Alagoas', 2.35, 58.7, 'NE'],
  ['ap', 'Amapá', 0.55, 51.4, 'N'],
  ['am', 'Amazonas', 2.59, 51.1, 'N'],
  ['ba', 'Bahia', 11.29, 72.1, 'NE'],
  ['ce', 'Ceará', 6.82, 70.0, 'NE'],
  ['df', 'Distrito Federal', 2.2, 41.2, 'CO'],
  ['es', 'Espírito Santo', 2.93, 42.0, 'SE'],
  ['go', 'Goiás', 4.92, 41.3, 'CO'],
  ['ma', 'Maranhão', 5.04, 71.1, 'NE'],
  ['mt', 'Mato Grosso', 2.47, 34.9, 'CO'],
  ['ms', 'Mato Grosso do Sul', 1.98, 40.3, 'CO'],
  ['mg', 'Minas Gerais', 16.29, 50.2, 'SE'],
  ['pa', 'Pará', 6.08, 54.8, 'N'],
  ['pb', 'Paraíba', 3.08, 66.6, 'NE'],
  ['pr', 'Paraná', 8.48, 37.6, 'S'],
  ['pe', 'Pernambuco', 7.02, 66.9, 'NE'],
  ['pi', 'Piauí', 2.57, 76.9, 'NE'],
  ['rj', 'Rio de Janeiro', 12.83, 43.5, 'SE'],
  ['rn', 'Rio Grande do Norte', 2.55, 65.1, 'NE'],
  ['rs', 'Rio Grande do Sul', 8.59, 43.7, 'S'],
  ['ro', 'Rondônia', 1.22, 29.3, 'N'],
  ['rr', 'Roraima', 0.37, 24.0, 'N'],
  ['sc', 'Santa Catarina', 5.49, 30.7, 'S'],
  ['sp', 'São Paulo', 34.67, 44.8, 'SE'],
  ['se', 'Sergipe', 1.68, 67.2, 'NE'],
  ['to', 'Tocantins', 1.1, 51.4, 'N'],
  ['zz', 'Exterior', 0.7, 48.0, 'EX'],
];

/** UFs que geram eventos de 50% e 100% apurado. */
const BIG_UFS = new Set(['sp', 'mg', 'rj', 'ba', 'rs', 'pr', 'pe', 'ce', 'pa', 'sc']);
/** UFs que geram só o evento de 100% apurado. */
const EXTRA_UFS = new Set(['df', 'go', 'ma', 'am', 'zz']);

/** Métodos na ordem do worker (o 'combo' só existe com < 5% apurado). mae = erro histórico real (pp). */
const METHODS: Array<{ id: string; name: string; desc: string; mae1: number | null; mae5: number | null }> = [
  { id: 'bayes', name: 'BAYES MUNICIPAL', desc: 'Modelo bayesiano por município, ancorado no 1º turno', mae1: 0.76, mae5: 0.25 },
  { id: 'bayes-uf', name: 'BAYES POR ESTADO', desc: 'O mesmo modelo bayesiano, rodando por UF', mae1: 0.41, mae5: 0.4 },
  { id: 'uniform', name: 'SWING UNIFORME', desc: 'Aplica o swing médio das seções apuradas ao resto do país', mae1: 0.75, mae5: 0.72 },
  { id: 'ufextrap', name: 'EXTRAPOLAÇÃO POR UF', desc: 'Projeta cada estado pelo que já foi apurado nele', mae1: 1.13, mae5: 1.98 },
  { id: 'naive', name: 'PLACAR CRU', desc: 'Só o placar atual, sem nenhum ajuste', mae1: 5.44, mae5: 4.85 },
  { id: 'polls', name: 'MÉDIA DAS PESQUISAS', desc: 'Só as pesquisas, ignorando a apuração', mae1: null, mae5: null },
  { id: 'minas', name: 'TERMÔMETRO MINAS', desc: 'Swing de Minas Gerais aplicado ao país inteiro', mae1: 2.15, mae5: 0.77 },
  { id: 'nordeste', name: 'META NORDESTE', desc: 'Swing do Nordeste aplicado ao país inteiro', mae1: 2.72, mae5: 2.89 },
];

/**
 * Lista de métodos com a mesma forma do worker: com < 5% apurado vem primeiro o 'combo'
 * (oficial) = Bayes municipal (peso 1−w) + Bayes por UF (peso w; w = 75% até 1%, caindo a 0 em 5%).
 * Depois de 5%, 'bayes' vira o oficial com peso 1.
 */
function buildMethods(pct: number, proj: number, sd: number, counted: number | null, bias: number[], th: Thermometers): MethodResult[] {
  const w = pct < 1 ? 0.75 : pct >= 5 ? 0 : (0.75 * (5 - pct)) / 4;
  const combo = pct < 5;
  const sdm = Math.max(sd, 0.05);
  const meta = (id: string) => METHODS.find((m) => m.id === id)!;
  const mk = (id: string, v: number, extra: Partial<MethodResult> = {}, s = sdm): MethodResult => {
    const m = meta(id);
    return { id, name: m.name, desc: m.desc, lulaPct: r2(v), winProbLula: winProb(v, s), mae1: m.mae1, mae5: m.mae5, ...extra };
  };
  const out: MethodResult[] = [];
  const d = bias[0];
  if (combo) {
    out.push({ id: 'combo', name: 'COMBO FINAL', desc: 'Bayes municipal + Bayes por estado, misturados no início da apuração', lulaPct: r2(proj), winProbLula: winProb(proj, sdm), official: true, mae1: null, mae5: null });
    // pesos da mistura; os dois métodos ficam de lados opostos do combo
    out.push(mk('bayes', proj + d * w, { weight: r4(1 - w) }));
    out.push(mk('bayes-uf', proj - d * (1 - w), { weight: r4(w) }, sdm * 1.1));
  } else {
    out.push(mk('bayes', proj, { official: true, weight: 1 }));
    out.push(mk('bayes-uf', proj - d, {}, sdm * 1.1));
  }
  out.push(mk('uniform', proj + bias[2], {}, sdm * 1.2));
  out.push(mk('ufextrap', proj + bias[3] * 1.4, {}, sdm * 1.4));
  out.push(mk('naive', counted ?? PRIOR.lulaPct, {}, sdm * 3));
  out.push(mk('polls', PRIOR.lulaPct, {}, PRIOR.sd));
  out.push(mk('minas', th.minas.impliedNationalLula ?? PRIOR.lulaPct, {}, sdm * 2));
  out.push(mk('nordeste', th.nordeste.impliedNationalLula ?? PRIOR.lulaPct, {}, sdm * 2.5));
  return out;
}

/** Termômetros: Minas Gerais e meta do Nordeste. */
function buildThermo(ufs: UfSim[], obs: UfObs[] | null, states: StateRow[], t1Nat: number): Thermometers {
  const iMg = ufs.findIndex((u) => u.uf === 'mg');
  const mg = ufs[iMg];
  const mgObs = obs?.[iMg];
  const mgRow = states[iMg];
  const mgCounted = mgObs && mgObs.validos > 0 ? (mgObs.lula / mgObs.validos) * 100 : null;
  let neSec = 0, neSecTot = 0, neLula = 0, neVal = 0, neProjL = 0, neProjV = 0, neT1 = 0, restL = 0, restV = 0;
  ufs.forEach((u, i) => {
    const vf = u.validosFinal;
    const pr = states[i].projLulaPct;
    if (u.region === 'NE') {
      neSecTot += u.secoesTot;
      neSec += obs?.[i].secoes ?? 0;
      neLula += obs?.[i].lula ?? 0;
      neVal += obs?.[i].validos ?? 0;
      neProjL += (vf * pr) / 100;
      neProjV += vf;
      neT1 += vf * u.t1;
    } else {
      restL += (vf * pr) / 100;
      restV += vf;
    }
  });
  const neCounted = neVal > 0 ? (neLula / neVal) * 100 : null;
  const neT1Pct = neT1 / neProjV;
  const needed = ((0.5 * (restV + neProjV) - restL) / neProjV) * 100;
  return {
    minas: {
      pct: r2((mgObs?.f ?? 0) * 100),
      lulaPct: mgCounted == null ? null : r2(mgCounted),
      projLulaPct: mgRow.projLulaPct,
      winProbLula: mgRow.winProbLula,
      leader: mgRow.projLulaPct >= 50 ? 'lula' : 'flavio',
      record: 'Quem venceu em Minas levou o Brasil em 9 de 9 eleições desde 1989',
      impliedNationalLula: mgCounted == null ? null : r2(t1Nat + (mgCounted - mg.t1)),
    },
    nordeste: {
      pct: r2(neSecTot > 0 ? (neSec / neSecTot) * 100 : 0),
      lulaPct: neCounted == null ? null : r2(neCounted),
      projLulaPct: r2((neProjL / neProjV) * 100),
      neededLulaPct: r2(needed),
      t1LulaPct: r2(neT1Pct),
      impliedNationalLula: neCounted == null ? null : r2(t1Nat + (neCounted - neT1Pct)),
    },
  };
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** Φ(x) — CDF normal padrão (Abramowitz–Stegun 7.1.26). */
function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function winProb(mu: number, sd: number): number {
  if (!(sd > 0)) return mu >= 50 ? 1 : 0;
  return r4(clamp(normCdf((mu - 50) / sd), 0, 1));
}

function quantiles(mu: number, sd: number): Quantiles {
  return {
    mean: r2(mu),
    p05: r2(mu - 1.645 * sd),
    p25: r2(mu - 0.674 * sd),
    p50: r2(mu),
    p75: r2(mu + 0.674 * sd),
    p95: r2(mu + 1.645 * sd),
  };
}

/** Número pt-BR com 1 casa decimal ("50,1"). */
const fmt1 = (x: number) => x.toFixed(1).replace('.', ',');
const iso = (ms: number) => new Date(ms).toISOString();
const brtHms = (ms: number) => new Date(ms + BRT_OFFSET).toISOString().slice(11, 19);
const simMsAt = (tau: number) => SIM_START + clamp(tau, 0, 1) * SIM_SPAN;
const candName = (k: CandKey) => (k === 'lula' ? 'Lula' : 'Flávio');

// ---------------------------------------------------------------------------
// Modelo de cada UF
// ---------------------------------------------------------------------------

interface UfSim {
  uf: string;
  name: string;
  region: Region;
  aptos: number;
  secoesTot: number;
  turnout: number;
  /** % Lula dos válidos ao final (verdade do loop). */
  final: number;
  /** quanto (pp) a parcial começa abaixo do final para Lula (interior chega depois). */
  drift: number;
  driftBase: number;
  /** atraso e duração (em τ ∈ [0,1]) e expoente da curva de totalização. */
  d: number;
  s: number;
  k: number;
  /** erro da projeção a priori da UF (pp). */
  priorErr: number;
  t1: number;
  validosFinal: number;
  compFinal: number;
}

interface UfObs {
  f: number;
  secoes: number;
  aptos: number;
  comp: number;
  brancos: number;
  nulos: number;
  validos: number;
  lula: number;
  flavio: number;
}

const BRANCOS = 0.015;
const NULOS = 0.03;

/** T1 2026 (Lula / (Lula+Flávio)) por UF — fixo entre loops (é história). */
const T1_BY_UF: Record<string, number> = (() => {
  const rng = mulberry32(19_2026);
  const out: Record<string, number> = {};
  for (const [uf, , , s22] of UF_BASE) out[uf] = r2(s22 - 1.7 + (rng() - 0.5) * 1.6);
  return out;
})();

function buildUfs(loop: number, target: number, crossAt?: number): UfSim[] {
  const rng = mulberry32(1013 + loop * 7919);
  const ufs: UfSim[] = UF_BASE.map(([uf, name, aptosM, s22, region]) => {
    const u = () => rng();
    let d: number, s: number, k: number, drift: number;
    switch (region) {
      case 'S':
      case 'SE':
      case 'CO':
        d = u() * 0.005;
        s = 0.8 + u() * 0.1;
        k = 1.6 + u() * 0.3;
        drift = 0.2 + u() * 0.3;
        break;
      case 'N':
        d = 0.01 + u() * 0.012;
        s = 0.8 + u() * 0.1;
        k = 1.55 + u() * 0.2;
        drift = 0.3 + u() * 0.3;
        break;
      case 'NE':
        d = 0.02 + u() * 0.012;
        s = 0.82 + u() * 0.08;
        k = 1.5 + u() * 0.2;
        drift = 0.4 + u() * 0.4;
        break;
      default: // exterior
        d = 0.08 + u() * 0.04;
        s = 0.8 + u() * 0.06;
        k = 1.5;
        drift = 0.3;
    }
    const aptos = Math.round(aptosM * 1e6 * (0.995 + u() * 0.01));
    const turnout = region === 'EX' ? 0.36 + u() * 0.05 : 0.775 + u() * 0.045;
    const compFinal = aptos * turnout;
    const validosFinal = compFinal * (1 - BRANCOS - NULOS);
    return {
      uf,
      name,
      region,
      aptos,
      secoesTot: Math.max(1, Math.round(aptos / 400)),
      turnout,
      final: s22 + (u() - 0.5) * 2, // ruído ±1 pp
      drift,
      driftBase: drift,
      d,
      s,
      k,
      priorErr: (u() - 0.5) * 4,
      t1: T1_BY_UF[uf] ?? s22 - 1.5,
      validosFinal,
      compFinal,
    };
  });
  // Normaliza para que a última UF termine exatamente em τ = 1.
  const maxEnd = Math.max(...ufs.map((x) => x.d + x.s));
  for (const x of ufs) {
    x.d /= maxEnd;
    x.s /= maxEnd;
  }
  // Desloca todas as UFs para que o total nacional bata no alvo do loop.
  const vTot = ufs.reduce((a, x) => a + x.validosFinal, 0);
  const mean = ufs.reduce((a, x) => a + x.validosFinal * x.final, 0) / vTot;
  const delta = target - mean;
  for (const x of ufs) x.final = clamp(x.final + delta, 5, 95);
  // Minas acompanha o Brasil ("quem ganha em Minas ganha o Brasil"): MG fica ~0,3 pp acima do
  // alvo nacional e as demais UFs compensam, mantendo o total exato.
  const mg = ufs.find((x) => x.uf === 'mg');
  if (mg) {
    mg.final = target + 0.3;
    const rest = ufs.filter((x) => x !== mg);
    const vRest = rest.reduce((a, x) => a + x.validosFinal, 0);
    const mean2 = ufs.reduce((a, x) => a + x.validosFinal * x.final, 0) / vTot;
    const d2 = ((target - mean2) * vTot) / vRest;
    for (const x of rest) x.final = clamp(x.final + d2, 5, 95);
  }
  if (crossAt !== undefined) calibrateDrift(ufs, crossAt);
  return ufs;
}

/** % apurado em que Lula passa à frente na parcial nacional, para um fator de drift. */
function crossingPct(ufs: UfSim[], scale: number): number {
  for (const x of ufs) x.drift = x.driftBase * scale;
  const N = 500;
  for (let i = 1; i <= N; i++) {
    const tau = i / N;
    let v = 0;
    let l = 0;
    for (const u of ufs) {
      const o = observeUf(u, tau);
      v += o.validos;
      l += o.lula;
    }
    if (v > 0 && l / v >= 0.5) return nationalPct(ufs, tau);
  }
  return 100;
}

/** Ajusta o drift intra-UF (busca binária) para a virada cair perto de `target`% apurado. */
function calibrateDrift(ufs: UfSim[], target: number): void {
  let lo = -1;
  let hi = 6;
  if (crossingPct(ufs, lo) >= target) return;
  if (crossingPct(ufs, hi) <= target) return;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (crossingPct(ufs, mid) < target) lo = mid;
    else hi = mid;
  }
  crossingPct(ufs, (lo + hi) / 2);
}

function progressOf(u: UfSim, tau: number): number {
  const x = clamp((tau - u.d) / u.s, 0, 1);
  return 1 - Math.pow(1 - x, u.k);
}

function observeUf(u: UfSim, tau: number): UfObs {
  const secoes = Math.round(u.secoesTot * progressOf(u, tau));
  const f = secoes / u.secoesTot;
  const aptos = Math.round(u.aptos * f);
  const comp = Math.round(aptos * u.turnout);
  const brancos = Math.round(comp * BRANCOS);
  const nulos = Math.round(comp * NULOS);
  const validos = comp - brancos - nulos;
  const share = u.final - u.drift * (1 - f);
  const lula = Math.round((validos * share) / 100);
  return { f, secoes, aptos, comp, brancos, nulos, validos, lula, flavio: validos - lula };
}

function nationalPct(ufs: UfSim[], tau: number): number {
  let s = 0;
  let t = 0;
  for (const u of ufs) {
    s += Math.round(u.secoesTot * progressOf(u, tau));
    t += u.secoesTot;
  }
  return (s / t) * 100;
}

/** Menor τ em que a apuração nacional atinge q% (busca binária). */
function tauForPct(ufs: UfSim[], q: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (nationalPct(ufs, mid) >= q) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Uma rodada do demo (um loop completo 0 → 100% → final)
// ---------------------------------------------------------------------------

type CallLevel = ForecastState['forecast']['call'];
const CALL_RANK: Record<CallLevel, number> = { none: 0, lean: 1, projected: 2, mathematical: 3 };

class DemoRun {
  readonly loop: number;
  private readonly ufs: UfSim[];
  private readonly target: number;
  private readonly tau0: number;
  private readonly biasE: number;
  private readonly wobPhase: number;
  private readonly wobFreq: number;
  private readonly etaErr: number;
  private readonly validosErr: number;
  private readonly methodBias: number[];
  private readonly t1Nat: number;
  private readonly aptosTot: number;
  private readonly secoesTot: number;
  private readonly validosFinalTot: number;
  private readonly compFinalTot: number;

  private tick = 0;
  private finalTicks = 0;
  private history: HistoryPoint[] = [];
  private events: GameEvent[] = [];
  private prevLeader: CandKey | null = null;
  private prevProjLeader: CandKey | null = null;
  private lastMilestone = 0;
  private callLevel: CallLevel = 'none';
  private calledAt: string | undefined;
  private ufFlags: Record<string, { half: boolean; done: boolean }> = {};

  constructor(loop: number) {
    this.loop = loop;
    const rng = mulberry32(777 + loop * 104_729);
    this.target = loop === 0 ? 50.6 : 50.45 + rng() * 0.3;
    const crossAt = loop === 0 ? 64 : 60 + rng() * 8;
    this.ufs = buildUfs(loop, this.target, crossAt);
    this.biasE = -(0.95 + rng() * 0.45); // projeção começa puxando para o Flávio
    this.wobPhase = rng() * Math.PI * 2;
    this.wobFreq = 7 + rng() * 5;
    this.etaErr = (rng() - 0.3) * 2;
    this.validosErr = (rng() - 0.5) * 0.02;
    const raw = METHODS.map(() => (rng() - 0.5) * 2.4);
    this.methodBias = raw;
    this.aptosTot = this.ufs.reduce((a, u) => a + u.aptos, 0);
    this.secoesTot = this.ufs.reduce((a, u) => a + u.secoesTot, 0);
    this.validosFinalTot = this.ufs.reduce((a, u) => a + u.validosFinal, 0);
    this.compFinalTot = this.ufs.reduce((a, u) => a + u.compFinal, 0);
    this.t1Nat = this.ufs.reduce((a, u) => a + u.validosFinal * u.t1, 0) / this.validosFinalTot;
    this.tau0 = tauForPct(this.ufs, 0.3);
    for (const u of this.ufs) this.ufFlags[u.uf] = { half: false, done: false };
  }

  /** Terminou o tempo de exibição do resultado final. */
  get finished(): boolean {
    return this.finalTicks >= FINAL_HOLD_TICKS;
  }

  private push(simMs: number, kind: GameEvent['kind'], text: string, who?: CandKey) {
    const ev: GameEvent = { t: iso(simMs), kind, text };
    if (who) ev.who = who;
    this.events.unshift(ev);
    if (this.events.length > 60) this.events.length = 60;
  }

  step(): ForecastState {
    const k = this.tick++;
    const tau = Math.min(1, this.tau0 + k / DEMO_TICKS);
    const isFinal = tau >= 1;
    if (isFinal) this.finalTicks++;
    const simMs = isFinal ? simMsAt(1) + (this.finalTicks - 1) * 20_000 : simMsAt(tau);

    // --- apuração observada ---------------------------------------------------
    const obs = this.ufs.map((u) => observeUf(u, tau));
    let secoes = 0, aptos = 0, comp = 0, brancos = 0, nulos = 0, validos = 0, lula = 0, flavio = 0;
    for (const o of obs) {
      secoes += o.secoes;
      aptos += o.aptos;
      comp += o.comp;
      brancos += o.brancos;
      nulos += o.nulos;
      validos += o.validos;
      lula += o.lula;
      flavio += o.flavio;
    }
    const pctRaw = (secoes / this.secoesTot) * 100;
    let pct = r2(pctRaw);
    if (!isFinal && pct >= 100) pct = 99.99;
    const p = clamp(pctRaw / 100, 0, 1);
    const lulaPct = validos > 0 ? r2((lula / validos) * 100) : 0;
    const flavioPct = validos > 0 ? r2(100 - lulaPct) : 0;
    const margin = lula - flavio;
    const leader: CandKey | null = validos > 0 ? (margin >= 0 ? 'lula' : 'flavio') : null;

    // --- projeção nacional ----------------------------------------------------
    const om = 1 - p;
    const err = isFinal
      ? 0
      : this.biasE * Math.pow(om, 1.1) + 0.28 * Math.sin(this.wobFreq * p + this.wobPhase) * om;
    const finalCounted = validos > 0 ? (lula / validos) * 100 : this.target;
    const proj = isFinal ? finalCounted : this.target + err;
    const sd = isFinal ? 0 : 1.8 * Math.pow(om, 0.9) + 0.04;
    const q = isFinal ? quantiles(proj, 0) : quantiles(proj, sd);
    const wp = winProb(proj, sd);
    const projLeader: CandKey = proj >= 50 ? 'lula' : 'flavio';

    const projValidos = isFinal ? validos : Math.round(this.validosFinalTot * (1 + this.validosErr * om));
    const projComp = isFinal ? comp : Math.round(this.compFinalTot * (1 + this.validosErr * om));
    const projLula = Math.round((projValidos * proj) / 100);

    // --- chamada (pegajosa: nunca regride) ------------------------------------
    let call: CallLevel = 'none';
    const remaining = projValidos - validos;
    if (isFinal) call = 'mathematical';
    else if (pct > 90 && remaining < Math.abs(margin) && leader === projLeader) call = 'mathematical';
    else if (wp >= 0.99 || wp <= 0.01) call = 'projected';
    else if (wp >= 0.75 || wp <= 0.25) call = 'lean';
    if (CALL_RANK[call] < CALL_RANK[this.callLevel]) call = this.callLevel;
    const prevCall = this.callLevel;
    this.callLevel = call;
    if (!this.calledAt && CALL_RANK[call] >= 2) this.calledAt = iso(simMs);

    const shrink = isFinal ? 0 : Math.pow(om, 0.8);

    // --- trajetória do resto da apuração ---------------------------------------
    const trajectory: TrajectoryPoint[] = [];
    if (isFinal) {
      trajectory.push({ pct: 100, t: iso(simMs), lula: { p05: r2(proj), p50: r2(proj), p95: r2(proj) } });
    } else {
      const rem = projValidos - validos;
      const cum = (qq: number, F: number) => {
        if (rem <= 0 || pct >= 100) return F;
        const r = clamp(((F / 100) * projValidos - lula) / rem, 0, 1);
        const dV = ((qq - pctRaw) / (100 - pctRaw)) * rem;
        const den = validos + dV;
        return den > 0 ? ((lula + r * dV) / den) * 100 : F;
      };
      const tAt = (qq: number) => {
        const trueMs = simMsAt(tauForPct(this.ufs, qq));
        const extra = this.etaErr * ((qq - pctRaw) / 100) * 15 * 60_000;
        return iso(Math.max(simMs, trueMs + extra));
      };
      const qs: number[] = [pctRaw];
      for (let x = Math.floor(pctRaw / 2.5) * 2.5 + 2.5; x < 100; x += 2.5) {
        if (x - pctRaw >= 0.5) qs.push(x);
      }
      qs.push(100);
      for (const qq of qs) {
        trajectory.push({
          pct: r2(qq),
          t: tAt(qq),
          lula: { p05: r2(cum(qq, q.p05)), p50: r2(cum(qq, proj)), p95: r2(cum(qq, q.p95)) },
        });
      }
    }
    const etaFinish = isFinal ? null : trajectory[trajectory.length - 1]?.t ?? null;

    // --- UFs --------------------------------------------------------------------
    const states: StateRow[] = this.ufs.map((u, i) => {
      const o = obs[i];
      const uom = 1 - o.f;
      const done = isFinal || o.f >= 1;
      const pUf = done ? (o.validos > 0 ? (o.lula / o.validos) * 100 : u.final) : u.final + (u.priorErr + err) * Math.pow(uom, 0.9);
      const sdUf = done ? 0 : 4 * Math.pow(uom, 0.9) + 0.08;
      return {
        uf: u.uf,
        name: u.name,
        pct: r2(o.f * 100),
        lulaPct: o.validos > 0 ? r2((o.lula / o.validos) * 100) : null,
        projLulaPct: r2(pUf),
        winProbLula: winProb(pUf, sdUf),
        aptos: u.aptos,
        validosProj: Math.round(u.validosFinal),
        t1LulaTwoParty: r2(u.t1),
      };
    });

    // --- eventos ----------------------------------------------------------------
    if (k === 0) this.push(simMs, 'info', 'ROUND 1 — FIGHT! A apuração começou.');
    if (leader && leader !== this.prevLeader) {
      const pctL = leader === 'lula' ? lulaPct : flavioPct;
      if (this.prevLeader === null) {
        this.push(simMs, 'lead', `${candName(leader)} sai na frente na apuração (${fmt1(pctL)}%)`, leader);
      } else {
        this.push(simMs, 'lead', `VIRADA! ${candName(leader)} passa à frente na apuração (${fmt1(pctL)}%)`, leader);
      }
      this.prevLeader = leader;
    }
    if (this.prevProjLeader !== null && projLeader !== this.prevProjLeader && !isFinal) {
      this.push(simMs, 'swing', `Projeção vira: o modelo agora aponta ${candName(projLeader)} (${fmt1(projLeader === 'lula' ? proj : 100 - proj)}%)`, projLeader);
    }
    this.prevProjLeader = projLeader;
    const milestone = Math.floor(pct / 10) * 10;
    for (let m = this.lastMilestone + 10; m <= Math.min(milestone, 90); m += 10) {
      this.push(simMs, 'milestone', `${m}% das seções apuradas — Lula ${fmt1(lulaPct)}% × Flávio ${fmt1(flavioPct)}%`);
    }
    if (milestone > this.lastMilestone) this.lastMilestone = Math.min(milestone, 90);
    this.ufs.forEach((u, i) => {
      const o = obs[i];
      const fl = this.ufFlags[u.uf];
      if (o.validos <= 0) return;
      const sh = (o.lula / o.validos) * 100;
      const who: CandKey = sh >= 50 ? 'lula' : 'flavio';
      const lab = u.uf === 'zz' ? 'EXTERIOR' : u.uf.toUpperCase();
      if (BIG_UFS.has(u.uf) && !fl.half && o.f >= 0.5 && o.f < 1) {
        fl.half = true;
        this.push(simMs, 'state', `${lab} chega a 50% apurado: ${candName(who)} ${fmt1(who === 'lula' ? sh : 100 - sh)}%`, who);
      }
      if ((BIG_UFS.has(u.uf) || EXTRA_UFS.has(u.uf)) && !fl.done && o.f >= 1) {
        fl.done = true;
        fl.half = true;
        this.push(simMs, 'state', `${lab} 100% apurado — ${candName(who)} vence no estado (${fmt1(who === 'lula' ? sh : 100 - sh)}%)`, who);
      }
    });
    if (call !== prevCall) {
      if (call === 'lean') {
        this.push(simMs, 'info', `Modelo vê vantagem de ${candName(projLeader)}: ${Math.round((projLeader === 'lula' ? wp : 1 - wp) * 100)}% de chance`, projLeader);
      } else if (call === 'projected') {
        this.push(simMs, 'call', `VITÓRIA PROJETADA: ${projLeader === 'lula' ? 'LULA' : 'FLÁVIO'}!`, projLeader);
      } else if (call === 'mathematical') {
        if (prevCall !== 'projected') {
          this.push(simMs, 'call', `VITÓRIA PROJETADA: ${projLeader === 'lula' ? 'LULA' : 'FLÁVIO'}!`, projLeader);
        }
        if (!isFinal) {
          this.push(simMs, 'call', `${candName(projLeader)} vence matematicamente — virada impossível`, projLeader);
        }
      }
    }
    if (isFinal && this.finalTicks === 1) {
      const w: CandKey = lulaPct >= 50 ? 'lula' : 'flavio';
      this.push(simMs, 'call', `FIM DE JOGO — 100% apurado: Lula ${fmt1(lulaPct)}% × Flávio ${fmt1(flavioPct)}%. ${candName(w)} vence!`, w);
    }

    // --- histórico --------------------------------------------------------------
    if (validos > 0 && (!isFinal || this.finalTicks === 1)) {
      this.history.push({
        t: iso(simMs),
        pct,
        lulaPct,
        projLulaPct: r2(proj),
        projLo: q.p05,
        projHi: q.p95,
        winProbLula: wp,
      });
    }

    // --- termômetros e métodos (mesma forma do worker) ------------------------------
    const thermo = buildThermo(this.ufs, obs, states, this.t1Nat);
    const methods = buildMethods(pct, proj, sd, validos > 0 ? lulaPct : null, this.methodBias.map((b) => b * shrink), thermo);

    const state: ForecastState = {
      version: 1,
      generatedAt: iso(simMs),
      source: 'replay',
      election: ELECTION,
      status: isFinal ? 'final' : 'counting',
      tse: { dg: '25/10/2026', hg: brtHms(simMs) },
      candidates: CANDIDATES,
      progress: {
        secoes,
        secoesTot: this.secoesTot,
        pct,
        aptos,
        aptosTot: this.aptosTot,
        comp,
        turnoutPct: aptos > 0 ? r2((comp / aptos) * 100) : 0,
      },
      current: { lula, flavio, validos, brancos, nulos, lulaPct, flavioPct, margin, leader },
      forecast: {
        lulaPct: q,
        winProbLula: wp,
        leader: projLeader,
        call,
        ...(this.calledAt ? { calledAt: this.calledAt } : {}),
        projVotes: { lula: projLula, flavio: projValidos - projLula, validos: projValidos, comp: projComp },
        turnoutPct: r2((projComp / this.aptosTot) * 100),
        swingVsT1: r2(proj - this.t1Nat),
        methods,
        trajectory,
        etaFinish,
        units: 'uf',
        unitsReporting: obs.filter((o) => o.secoes > 0).length,
        unitsTotal: this.ufs.length,
        warmingUp: !isFinal && pct < 1,
      },
      prior: PRIOR,
      thermometers: thermo,
      history: this.history.slice(),
      states,
      events: this.events.slice(),
    };
    return state;
  }
}

// ---------------------------------------------------------------------------
// Estado pré-apuração
// ---------------------------------------------------------------------------

function buildPreState(nowMs: number): ForecastState {
  const ufs = buildUfs(0, 50.6);
  const aptosTot = ufs.reduce((a, u) => a + u.aptos, 0);
  const secoesTot = ufs.reduce((a, u) => a + u.secoesTot, 0);
  const validosTot = Math.round(ufs.reduce((a, u) => a + u.validosFinal, 0));
  const compTot = Math.round(ufs.reduce((a, u) => a + u.compFinal, 0));
  const t1Nat = ufs.reduce((a, u) => a + u.validosFinal * u.t1, 0) / validosTot;
  const mu = PRIOR.lulaPct;
  const sd = PRIOR.sd;
  const wp = winProb(mu, sd);
  const projLula = Math.round((validosTot * mu) / 100);
  const states: StateRow[] = ufs.map((u) => {
    const pr = u.final - 1.0 + u.priorErr * 0.5;
    return {
      uf: u.uf,
      name: u.name,
      pct: 0,
      lulaPct: null,
      projLulaPct: r2(pr),
      winProbLula: winProb(pr, 4),
      aptos: u.aptos,
      validosProj: Math.round(u.validosFinal),
      t1LulaTwoParty: r2(u.t1),
    };
  });
  const preThermo = buildThermo(ufs, null, states, t1Nat);
  const methods = buildMethods(0, mu, sd, null, [0.3, 0, -0.4, 0.6, 0, 0, 0, 0], preThermo);
  return {
    version: 1,
    generatedAt: iso(nowMs),
    source: 'pre',
    election: ELECTION,
    status: 'pre',
    tse: { dg: '25/10/2026', hg: brtHms(nowMs) },
    candidates: CANDIDATES,
    progress: { secoes: 0, secoesTot, pct: 0, aptos: 0, aptosTot, comp: 0, turnoutPct: 0 },
    current: { lula: 0, flavio: 0, validos: 0, brancos: 0, nulos: 0, lulaPct: 0, flavioPct: 0, margin: 0, leader: null },
    forecast: {
      lulaPct: quantiles(mu, sd),
      winProbLula: wp,
      leader: mu >= 50 ? 'lula' : 'flavio',
      call: 'none',
      projVotes: { lula: projLula, flavio: validosTot - projLula, validos: validosTot, comp: compTot },
      turnoutPct: r2((compTot / aptosTot) * 100),
      swingVsT1: r2(mu - t1Nat),
      methods,
      trajectory: [],
      etaFinish: null,
      units: 'uf',
      unitsReporting: 0,
      unitsTotal: ufs.length,
    },
    prior: PRIOR,
    thermometers: preThermo,
    history: [],
    states,
    events: [{ t: iso(nowMs), kind: 'info', text: 'Aguardando o início da apuração — 17:00 (Brasília)' }],
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Estado do demo após `elapsedSec` segundos reais do loop `loop` (puro, determinístico).
 * Reproduz os ticks de 1 s desde o início, então histórico e eventos vêm completos.
 */
export function buildDemoState(elapsedSec: number, loop = 0): ForecastState {
  const run = new DemoRun(loop);
  const n = Math.max(0, Math.min(Math.floor(elapsedSec), DEMO_TICKS + FINAL_HOLD_TICKS));
  let s = run.step();
  for (let i = 0; i < n; i++) s = run.step();
  return s;
}

/**
 * Inicia o simulador. Padrão: MODO DEMO acelerado (0→100% em ~90 s, depois 'final' por ~12 s
 * e recomeça). Com `opts.pre`, emite um estado estático de pré-apuração a cada 5 s.
 * Retorna uma função que para os timers.
 */
export function startMock(
  onState: (s: ForecastState, meta: FeedMeta) => void,
  opts?: { pre?: boolean },
): () => void {
  if (opts?.pre) {
    const emitPre = () => onState(buildPreState(Date.now()), { mode: 'pre', lastOk: Date.now() });
    emitPre();
    const id = setInterval(emitPre, 5000);
    return () => clearInterval(id);
  }
  let loop = 0;
  let run = new DemoRun(loop);
  const emit = () => {
    if (run.finished) {
      loop += 1;
      run = new DemoRun(loop);
    }
    onState(run.step(), { mode: 'demo', lastOk: Date.now() });
  };
  emit();
  const id = setInterval(emit, 1000);
  return () => clearInterval(id);
}
