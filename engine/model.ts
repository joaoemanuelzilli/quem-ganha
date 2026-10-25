// ════════════════════════════════════════════════════════════════════════════
//  MOTOR DE PREVISÃO — "swing" logístico hierárquico bayesiano + Monte Carlo
// ════════════════════════════════════════════════════════════════════════════
//
//  Para cada unidade i (município ou UF), a fatia FINAL de Lula no 2º turno é
//
//     logit(y_i) = logit(b_i) + δ + Σ β_k·x_ik + u_r(i) + ε_i
//
//  b_i  = baseline do 1º turno: (Lula₁ + α·Outros₁) / (Lula₁ + Flávio₁ + Outros₁)
//  δ    = swing nacional            ~ N(δ₀, σδ²)   (δ₀ calibrado pelas pesquisas)
//  x_i  = covariáveis ecológicas centradas: % de "outros" no 1T, tamanho
//         (log do eleitorado) e inclinação (logit b_i) → o swing não precisa ser uniforme
//  u_r  = swing regional (UF)       ~ N(0, σu²)
//  ε_i  = desvio local              ~ N(0, σε,i²)
//
//  A apuração parcial de i é uma observação ruidosa de y_i:
//     logit(ŷ_i) = logit(y_i) + η_i ,  Var(η_i) ↓ conforme a fração apurada ↑
//  (as primeiras seções de um município não são uma amostra aleatória)
//
//  O que ainda NÃO chegou tende a ser diferente do que já chegou (capitais e
//  regiões remotas reportam por último). Isso entra como choques comuns ζ
//  (nacional) e ζ_uf aplicados só aos votos restantes, com variância ∝ fração
//  restante — aprendidos no backtest. É o que mantém os intervalos honestos.
//
//  A posteriori de (δ, β) é gaussiana exata (GLS com efeitos aleatórios por região
//  via Sherman–Morrison). Depois sorteamos N cenários: θ → u_r → ε_i → ζ →
//  votos restantes (comparecimento modelado) → soma nacional → P(vitória).
// ════════════════════════════════════════════════════════════════════════════

import { Rng, invLogit, logit, quantile } from './random';
import type { MethodResult, Quantiles, UnitObs, UnitPrior } from './types';

export interface ModelParams {
  alpha: number;        // fração dos votos "outros" do 1T que vai para Lula
  priorLula: number | null; // média nacional a priori (% válidos) – pesquisas (null = só baseline do 1T)
  priorSd: number;      // desvio-padrão a priori (pontos percentuais)
  sigmaBeta: number;    // dp a priori do coeficiente de "outros"
  sigmaBeta2: number;   // dp a priori dos coeficientes de tamanho e inclinação
  sigmaU: number;       // dp do swing regional (logit)
  sigmaE: number;       // dp do desvio local (logit)
  sigmaESmall: number;  // dp extra para unidades pequenas (logit)
  sigmaSec: number;     // heterogeneidade entre seções dentro da unidade (logit)
  sigmaOrd: number;     // viés de ordem de apuração dentro da unidade (logit)
  sigmaZeta: number;    // choque comum nos votos restantes (nacional, logit)
  sigmaZetaUF: number;  // choque comum nos votos restantes (por UF, logit)
  turnoutK: number;     // nº de eleitores para confiar 50% no comparecimento observado
  turnoutSd: number;    // incerteza relativa do comparecimento nacional
  draws: number;
  seed: number;
}

export const DEFAULT_MUN_PARAMS: ModelParams = {
  alpha: 0.45, priorLula: 49.0, priorSd: 2.5, sigmaBeta: 2.0, sigmaBeta2: 0.15,
  sigmaU: 0.08, sigmaE: 0.11, sigmaESmall: 0.08, sigmaSec: 0.6, sigmaOrd: 0.04,
  sigmaZeta: 0.04, sigmaZetaUF: 0.04,
  turnoutK: 3000, turnoutSd: 0.012, draws: 2000, seed: 42,
};

export const DEFAULT_UF_PARAMS: ModelParams = {
  ...DEFAULT_MUN_PARAMS,
  sigmaBeta: 1.3, sigmaBeta2: 0.1,
  sigmaU: 0.2, sigmaE: 0.04, sigmaESmall: 0.07, sigmaSec: 0.15, sigmaOrd: 0.2,
  sigmaZeta: 0.03, sigmaZetaUF: 0.03,
  turnoutK: 200000,
};

/** Região usada no efeito aleatório: UF para municípios, macro-região para UFs. */
export const MACRO: Record<string, string> = {
  ac: 'N', am: 'N', ap: 'N', pa: 'N', ro: 'N', rr: 'N', to: 'N',
  al: 'NE', ba: 'NE', ce: 'NE', ma: 'NE', pb: 'NE', pe: 'NE', pi: 'NE', rn: 'NE', se: 'NE',
  df: 'CO', go: 'CO', ms: 'CO', mt: 'CO',
  es: 'SE', mg: 'SE', rj: 'SE', sp: 'SE',
  pr: 'S', rs: 'S', sc: 'S', zz: 'EXT',
};

const K = 4; // intercepto + 3 covariáveis

export interface PreparedModel {
  units: UnitPrior[];
  level: 'municipio' | 'uf';
  idx: Map<string, number>;
  n: number;
  logitB: Float64Array;
  X: Float64Array;          // n×K (coluna 0 = 1)
  region: Int32Array;
  regionNames: string[];
  ufIndex: Int32Array;
  ufNames: string[];
  rho1: Float64Array;       // válidos por eleitor no 1T
  aptos: Float64Array;
  secoes: Float64Array;
  v1: Float64Array;
  sigE2: Float64Array;
  delta0: number;
  params: ModelParams;
}

export function prepare(units: UnitPrior[], level: 'municipio' | 'uf', params: ModelParams): PreparedModel {
  const n = units.length;
  const idx = new Map<string, number>();
  const logitB = new Float64Array(n), rho1 = new Float64Array(n), X = new Float64Array(n * K);
  const aptos = new Float64Array(n), secoes = new Float64Array(n), v1 = new Float64Array(n), sigE2 = new Float64Array(n);
  const region = new Int32Array(n), ufIndex = new Int32Array(n);
  const regionNames: string[] = [], ufNames: string[] = [];
  const regMap = new Map<string, number>(), ufMap = new Map<string, number>();
  const raw1 = new Float64Array(n), raw2 = new Float64Array(n);
  let ws = 0;
  for (let i = 0; i < n; i++) {
    const u = units[i];
    idx.set(u.id, i);
    const { lula, outros, validos } = u.t1;
    const b = validos > 0 ? (lula + params.alpha * outros + 0.5) / (validos + 1) : 0.5;
    logitB[i] = logit(b);
    raw1[i] = validos > 0 ? outros / validos : 0;
    raw2[i] = Math.log(validos + 100);
    ws += validos;
    rho1[i] = u.aptos > 0 ? validos / u.aptos : 0.75;
    aptos[i] = u.aptos; secoes[i] = u.secoes; v1[i] = validos;
    sigE2[i] = params.sigmaE ** 2 + params.sigmaESmall ** 2 * (2000 / (validos + 2000));
    const reg = level === 'uf' ? (MACRO[u.uf] ?? 'X') : u.uf;
    if (!regMap.has(reg)) { regMap.set(reg, regionNames.length); regionNames.push(reg); }
    region[i] = regMap.get(reg)!;
    if (!ufMap.has(u.uf)) { ufMap.set(u.uf, ufNames.length); ufNames.push(u.uf); }
    ufIndex[i] = ufMap.get(u.uf)!;
  }
  // centraliza (média ponderada por votos) e escala
  const wmean = (a: Float64Array) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * v1[i]; return ws > 0 ? s / ws : 0; };
  const m1 = wmean(raw1), m2 = wmean(raw2), m3 = wmean(logitB);
  let s2 = 0; for (let i = 0; i < n; i++) s2 += (raw2[i] - m2) ** 2 * v1[i];
  const sd2 = Math.sqrt(s2 / Math.max(1, ws)) || 1;
  for (let i = 0; i < n; i++) {
    X[i * K] = 1; X[i * K + 1] = raw1[i] - m1; X[i * K + 2] = (raw2[i] - m2) / sd2; X[i * K + 3] = logitB[i] - m3;
  }

  const base = { units, level, idx, n, logitB, X, region, regionNames, ufIndex, ufNames, rho1, aptos, secoes, v1, sigE2, params };
  if (params.priorLula === null) return { ...base, delta0: 0 };
  // δ₀: swing nacional que leva a baseline à média das pesquisas
  const target = params.priorLula / 100;
  let lo = -2, hi = 2;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    let s = 0;
    for (let i = 0; i < n; i++) s += invLogit(logitB[i] + mid) * v1[i];
    if (s / ws > target) hi = mid; else lo = mid;
  }
  return { ...base, delta0: (lo + hi) / 2 };
}

export interface UnitAgg { lula: number; flavio: number; validos: number; secoesTot: number; secoes: number; aptosTot: number; aptos: number; comp: number; brancos: number; nulos: number }

export interface RunResult {
  finalLula: Float64Array;   // % válidos de Lula ao final, por sorteio
  lulaQ: Quantiles;
  winProbLula: number;
  projVotes: { lula: number; flavio: number; validos: number; comp: number };
  turnoutPct: number;
  uf: { uf: string; projLula: number; winProbLula: number; validosProj: number; counted: UnitAgg; remLula: Float64Array; remValid: Float64Array; remSec: number }[];
  counted: UnitAgg;
  theta: { mean: number[]; sd: number[] };
  unitsReporting: number;
  methods: MethodResult[];
  maxRemainingValid: number;
  unitRemLula: Float64Array;
  unitRemValid: Float64Array;
  unitSecTot: Float64Array;
}

// ── álgebra pequena (K×K) ──
function cholesky(A: number[], k: number): number[] {
  const L = new Array(k * k).fill(0);
  for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * k + j];
    for (let t = 0; t < j; t++) s -= L[i * k + t] * L[j * k + t];
    L[i * k + j] = i === j ? Math.sqrt(Math.max(s, 1e-14)) : s / L[j * k + j];
  }
  return L;
}
function invSPD(A: number[], k: number): number[] {
  const L = cholesky(A, k);
  const inv = new Array(k * k).fill(0);
  for (let c = 0; c < k; c++) {
    const y = new Array(k).fill(0);
    for (let i = 0; i < k; i++) { let s = i === c ? 1 : 0; for (let t = 0; t < i; t++) s -= L[i * k + t] * y[t]; y[i] = s / L[i * k + i]; }
    for (let i = k - 1; i >= 0; i--) { let s = y[i]; for (let t = i + 1; t < k; t++) s -= L[t * k + i] * inv[t * k + c]; inv[i * k + c] = s / L[i * k + i]; }
  }
  return inv;
}

/** Ajuste + simulação. obs: apuração mais recente por unidade (ids iguais aos priors). */
export function run(m: PreparedModel, obs: Map<string, UnitObs>): RunResult {
  const p = m.params, n = m.n, R = m.regionNames.length, X = m.X;
  const rng = new Rng(p.seed);
  const sigmaDelta = (p.priorSd / 100) / 0.25; // pp → logit (derivada em 50%)
  const sU2 = p.sigmaU ** 2;

  // ── observações ──
  const oI: number[] = [], oZ: number[] = [], oOmega: number[] = [], oA: number[] = [];
  const cLula = new Float64Array(n), cValid = new Float64Array(n), cAptosTot = new Float64Array(n), cSecTot = new Float64Array(n), cComp = new Float64Array(n);
  const remFrac = new Float64Array(n).fill(1);
  const counted: UnitAgg = { lula: 0, flavio: 0, validos: 0, secoesTot: 0, secoes: 0, aptosTot: 0, aptos: 0, comp: 0, brancos: 0, nulos: 0 };
  for (let i = 0; i < n; i++) { counted.secoes += m.secoes[i]; counted.aptos += m.aptos[i]; }
  for (const [id, o] of obs) {
    const i = m.idx.get(id);
    if (i === undefined) continue;
    const valid = o.lula + o.flavio;
    cLula[i] = o.lula; cValid[i] = valid; cAptosTot[i] = Math.min(o.aptosTot, m.aptos[i]); cSecTot[i] = o.secoesTot; cComp[i] = o.comp;
    counted.lula += o.lula; counted.flavio += o.flavio; counted.validos += valid; counted.secoesTot += o.secoesTot;
    counted.aptosTot += cAptosTot[i]; counted.comp += o.comp; counted.brancos += o.brancos; counted.nulos += o.nulos;
    const pFrac = m.secoes[i] > 0 ? Math.min(1, o.secoesTot / m.secoes[i]) : 1;
    remFrac[i] = 1 - pFrac;
    if (valid < 1 || o.secoesTot < 1) continue;
    const yHat = (o.lula + 0.5) / (valid + 1);
    const binom = 1 / ((valid + 1) * yHat * (1 - yHat));
    const omega = pFrac >= 1 ? 0 : p.sigmaSec ** 2 * (1 - pFrac) / (pFrac * m.secoes[i] + 1) + p.sigmaOrd ** 2 * (1 - pFrac) + binom;
    oI.push(i); oZ.push(logit(yHat) - m.logitB[i]); oOmega.push(omega); oA.push(1 / (m.sigE2[i] + omega));
  }

  // ── posteriori de θ = (δ, β1..β3) integrando u_r (Sherman–Morrison por região) ──
  const priorPrec = [1 / sigmaDelta ** 2, 1 / p.sigmaBeta ** 2, 1 / p.sigmaBeta2 ** 2, 1 / p.sigmaBeta2 ** 2];
  const P = new Array(K * K).fill(0);
  const bv = new Array(K).fill(0);
  for (let a = 0; a < K; a++) P[a * K + a] = priorPrec[a];
  bv[0] = m.delta0 * priorPrec[0];
  const regA = new Float64Array(R), regAz = new Float64Array(R), regAx = new Float64Array(R * K);
  for (let j = 0; j < oI.length; j++) {
    const i = oI[j], r = m.region[i], a = oA[j], z = oZ[j];
    regA[r] += a; regAz[r] += a * z;
    for (let s = 0; s < K; s++) {
      const xs = X[i * K + s];
      regAx[r * K + s] += a * xs;
      bv[s] += a * xs * z;
      for (let t = 0; t <= s; t++) P[s * K + t] += a * xs * X[i * K + t];
    }
  }
  for (let r = 0; r < R; r++) {
    if (regA[r] === 0) continue;
    const c = sU2 / (1 + sU2 * regA[r]);
    for (let s = 0; s < K; s++) {
      bv[s] -= c * regAx[r * K + s] * regAz[r];
      for (let t = 0; t <= s; t++) P[s * K + t] -= c * regAx[r * K + s] * regAx[r * K + t];
    }
  }
  for (let s = 0; s < K; s++) for (let t = s + 1; t < K; t++) P[s * K + t] = P[t * K + s];
  const Cov = invSPD(P, K);
  const mean = new Array(K).fill(0);
  for (let s = 0; s < K; s++) for (let t = 0; t < K; t++) mean[s] += Cov[s * K + t] * bv[t];
  const Lc = cholesky(Cov, K);

  // ── comparecimento: válidos por eleitor ──
  let obsValid = 0, expValid = 0;
  for (let i = 0; i < n; i++) if (cAptosTot[i] > 0) { obsValid += cValid[i]; expValid += m.rho1[i] * cAptosTot[i]; }
  const kappaNat = (obsValid + 2e5) / (expValid + 2e5); // encolhe p/ 1 (2T ≈ 1T em válidos)
  const regObsV = new Float64Array(R), regExpV = new Float64Array(R);
  for (let i = 0; i < n; i++) if (cAptosTot[i] > 0) { regObsV[m.region[i]] += cValid[i]; regExpV[m.region[i]] += m.rho1[i] * cAptosTot[i]; }
  const kappaReg = new Float64Array(R);
  for (let r = 0; r < R; r++) kappaReg[r] = (regObsV[r] + kappaNat * 1e5) / (regExpV[r] + 1e5);
  const remValidExp = new Float64Array(n);
  let maxRemainingValid = 0, compProj = counted.comp;
  for (let i = 0; i < n; i++) {
    const rem = Math.max(0, m.aptos[i] - cAptosTot[i]);
    const prior = m.rho1[i] * kappaReg[m.region[i]];
    const obsRho = cAptosTot[i] > 0 ? cValid[i] / cAptosTot[i] : prior;
    const w = cAptosTot[i] / (cAptosTot[i] + p.turnoutK);
    remValidExp[i] = rem * (w * obsRho + (1 - w) * prior);
    maxRemainingValid += rem;
    const compRate = cAptosTot[i] > 0 ? cComp[i] / cAptosTot[i] : (m.units[i].t1.comp / Math.max(1, m.aptos[i])) * kappaReg[m.region[i]];
    compProj += rem * compRate;
  }

  // fração restante nacional e por UF (escala dos choques ζ)
  const U = m.ufNames.length;
  const ufRemFrac = new Float64Array(U), ufSec = new Float64Array(U);
  let natRem = 0, natSec = 0;
  for (let i = 0; i < n; i++) { const u = m.ufIndex[i]; ufRemFrac[u] += remFrac[i] * m.secoes[i]; ufSec[u] += m.secoes[i]; natRem += remFrac[i] * m.secoes[i]; natSec += m.secoes[i]; }
  for (let u = 0; u < U; u++) ufRemFrac[u] = ufSec[u] > 0 ? ufRemFrac[u] / ufSec[u] : 1;
  const natRemFrac = natSec > 0 ? natRem / natSec : 1;
  const zetaNatSd = p.sigmaZeta * Math.sqrt(natRemFrac); // máximo no início (o que chegou primeiro é pouco representativo), 0 no fim

  const obsOfUnit = new Int32Array(n).fill(-1);
  for (let j = 0; j < oI.length; j++) obsOfUnit[oI[j]] = j;

  const D = p.draws;
  const finalLula = new Float64Array(D);
  const ufRemLula = Array.from({ length: U }, () => new Float64Array(D));
  const ufRemValid = Array.from({ length: U }, () => new Float64Array(D));
  const ufWin = new Float64Array(U), ufLulaSum = new Float64Array(U), ufValidSum = new Float64Array(U);
  const ufCountLula = new Float64Array(U), ufCountValid = new Float64Array(U);
  for (let i = 0; i < n; i++) { ufCountLula[m.ufIndex[i]] += cLula[i]; ufCountValid[m.ufIndex[i]] += cValid[i]; }

  const uR = new Float64Array(R), zU = new Float64Array(U);
  const uRemL = new Float64Array(n), uRemV = new Float64Array(n);
  const regSumAe = new Float64Array(R);
  const theta = new Array(K).fill(0), g = new Array(K).fill(0);
  const xb = new Float64Array(n);
  let sumLulaAll = 0, sumValidAll = 0;
  const ufL = new Float64Array(U), ufV = new Float64Array(U);
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < K; s++) g[s] = rng.normal();
    for (let s = 0; s < K; s++) { let v = mean[s]; for (let t = 0; t <= s; t++) v += Lc[s * K + t] * g[t]; theta[s] = v; }
    for (let i = 0; i < n; i++) { let v = 0; for (let s = 0; s < K; s++) v += theta[s] * X[i * K + s]; xb[i] = v; }
    const kNoise = 1 + p.turnoutSd * rng.normal();
    const zetaNat = zetaNatSd * rng.normal();
    for (let u = 0; u < U; u++) zU[u] = p.sigmaZetaUF * Math.sqrt(ufRemFrac[u]) * rng.normal();
    regSumAe.fill(0);
    for (let j = 0; j < oI.length; j++) { const i = oI[j]; regSumAe[m.region[i]] += oA[j] * (oZ[j] - xb[i]); }
    for (let r = 0; r < R; r++) { const prec = 1 / sU2 + regA[r]; uR[r] = regSumAe[r] / prec + Math.sqrt(1 / prec) * rng.normal(); }
    ufL.fill(0); ufV.fill(0);
    for (let i = 0; i < n; i++) {
      const remV = remValidExp[i] * kNoise;
      if (remV <= 0.5) continue;
      const u = m.ufIndex[i];
      const lin = m.logitB[i] + xb[i] + uR[m.region[i]];
      const j = obsOfUnit[i];
      let eps: number;
      if (j >= 0) {
        const s2 = m.sigE2[i], om = oOmega[j];
        const resid = oZ[j] - xb[i] - uR[m.region[i]];
        eps = (s2 / (s2 + om)) * resid + Math.sqrt((s2 * om) / (s2 + om)) * rng.normal();
      } else {
        eps = Math.sqrt(m.sigE2[i]) * rng.normal();
      }
      const yFinal = invLogit(lin + eps);
      const total = cValid[i] + remV;
      let remShare = cValid[i] > 0 ? (yFinal * total - cLula[i]) / remV : yFinal;
      if (remShare < 0) remShare = 0; else if (remShare > 1) remShare = 1;
      // choques comuns no que falta apurar
      const remL = remV * invLogit(logit(Math.min(0.999, Math.max(0.001, remShare))) + zetaNat + zU[u]);
      ufL[u] += remL; ufV[u] += remV;
      uRemL[i] += remL; uRemV[i] += remV;
    }
    let tL = counted.lula, tV = counted.validos;
    for (let u = 0; u < U; u++) {
      ufRemLula[u][d] = ufL[u]; ufRemValid[u][d] = ufV[u];
      tL += ufL[u]; tV += ufV[u];
      const fl = (ufCountLula[u] + ufL[u]) / Math.max(1, ufCountValid[u] + ufV[u]);
      ufLulaSum[u] += fl; ufValidSum[u] += ufCountValid[u] + ufV[u];
      if (fl > 0.5) ufWin[u] += 1;
    }
    finalLula[d] = (100 * tL) / tV;
    sumLulaAll += tL; sumValidAll += tV;
  }

  const sorted = Float64Array.from(finalLula).sort();
  let wins = 0, mu = 0;
  for (let d = 0; d < D; d++) { if (finalLula[d] > 50) wins++; mu += finalLula[d]; }
  mu /= D;
  const lulaQ: Quantiles = { mean: mu, p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95) };

  const ufOut = m.ufNames.map((uf, u) => {
    const c: UnitAgg = { lula: 0, flavio: 0, validos: 0, secoesTot: 0, secoes: 0, aptosTot: 0, aptos: 0, comp: 0, brancos: 0, nulos: 0 };
    let remSec = 0;
    for (let i = 0; i < n; i++) if (m.ufIndex[i] === u) {
      c.lula += cLula[i]; c.validos += cValid[i]; c.flavio += cValid[i] - cLula[i]; c.secoesTot += cSecTot[i]; c.secoes += m.secoes[i];
      c.aptosTot += cAptosTot[i]; c.aptos += m.aptos[i]; c.comp += cComp[i];
      remSec += Math.max(0, m.secoes[i] - cSecTot[i]);
    }
    return { uf, projLula: (100 * ufLulaSum[u]) / D, winProbLula: ufWin[u] / D, validosProj: ufValidSum[u] / D, counted: c, remLula: ufRemLula[u], remValid: ufRemValid[u], remSec };
  });

  const projValid = sumValidAll / D, projL = sumLulaAll / D;
  const methods = altMethods(m, cLula, cValid, remValidExp, counted, lulaQ.mean, wins / D);
  const sdTheta = Array.from({ length: K }, (_, s) => Math.sqrt(Cov[s * K + s]));

  return {
    finalLula, lulaQ, winProbLula: wins / D,
    projVotes: { lula: projL, flavio: projValid - projL, validos: projValid, comp: compProj },
    turnoutPct: (100 * compProj) / Math.max(1, counted.aptos),
    uf: ufOut, counted,
    theta: { mean, sd: sdTheta },
    unitsReporting: oI.length,
    methods, maxRemainingValid,
    unitRemLula: uRemL.map((v) => v / D), unitRemValid: uRemV.map((v) => v / D), unitSecTot: cSecTot,
  };
}

/** Métodos alternativos (para comparação), todos em % válidos do Lula ao final. */
function altMethods(m: PreparedModel, cLula: Float64Array, cValid: Float64Array, remValid: Float64Array, counted: UnitAgg, bayes: number, bayesWin: number): MethodResult[] {
  const n = m.n;
  const naive = counted.validos > 0 ? (100 * counted.lula) / counted.validos : 50;
  const U = m.ufNames.length;
  const ufL = new Float64Array(U), ufV = new Float64Array(U), ufRem = new Float64Array(U), ufPriorL = new Float64Array(U), ufPriorV = new Float64Array(U);
  for (let i = 0; i < n; i++) {
    const u = m.ufIndex[i];
    ufL[u] += cLula[i]; ufV[u] += cValid[i]; ufRem[u] += remValid[i];
    ufPriorL[u] += invLogit(m.logitB[i] + m.delta0) * m.v1[i]; ufPriorV[u] += m.v1[i];
  }
  let tl = 0, tv = 0;
  for (let u = 0; u < U; u++) {
    const share = ufV[u] > 500 ? ufL[u] / ufV[u] : ufPriorL[u] / Math.max(1, ufPriorV[u]);
    tl += ufL[u] + share * ufRem[u]; tv += ufV[u] + ufRem[u];
  }
  const ufExtrap = tv > 0 ? (100 * tl) / tv : naive;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) if (cValid[i] > 0) { const yh = (cLula[i] + 0.5) / (cValid[i] + 1); num += (logit(yh) - m.logitB[i]) * cValid[i]; den += cValid[i]; }
  const sw = den > 0 ? num / den : m.delta0;
  let ul = counted.lula, uv = counted.validos;
  for (let i = 0; i < n; i++) { ul += invLogit(m.logitB[i] + sw) * remValid[i]; uv += remValid[i]; }
  const uniform = uv > 0 ? (100 * ul) / uv : naive;
  let pl = 0, pv = 0;
  for (let i = 0; i < n; i++) { pl += invLogit(m.logitB[i] + m.delta0) * m.v1[i]; pv += m.v1[i]; }
  return [
    { id: 'bayes', name: 'BAYES HIERÁRQUICO', desc: `Swing logístico por ${m.level === 'municipio' ? 'município' : 'UF'} vs 1º turno + covariáveis, encolhimento regional, Monte Carlo`, lulaPct: bayes, winProbLula: bayesWin, weight: 1 },
    { id: 'uniform', name: 'SWING UNIFORME', desc: 'Mesmo swing (vs 1º turno) para todo voto que falta', lulaPct: uniform },
    { id: 'ufextrap', name: 'PROJEÇÃO POR ESTADO', desc: 'Cada UF mantém a % já apurada no que falta', lulaPct: ufExtrap },
    { id: 'naive', name: 'PLACAR CRU', desc: 'Só a % apurada até agora (o que a TV mostra)', lulaPct: naive },
    { id: 'polls', name: 'PESQUISAS', desc: 'Média das pesquisas (corrigida) + transferência do 1º turno', lulaPct: (100 * pl) / Math.max(1, pv) },
  ];
}
