// ════════════════════════════════════════════════════════════════════════════
//  BACKTEST / TREINO — reproduz apurações passadas NA ORDEM REAL em que os
//  boletins de urna chegaram ao TSE (DT_BU_RECEBIDO) e mede o erro do modelo
//  em cada checkpoint (% de seções). Depois faz busca de hiperparâmetros
//  minimizando o CRPS (regra de pontuação própria → previsões calibradas).
//
//   npm run backtest                 → avalia params atuais (data/model/params.json)
//   npm run backtest -- --tune 80    → busca aleatória + refinamento, salva params
// ════════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DEFAULT_MUN_PARAMS, DEFAULT_UF_PARAMS, prepare, run, type ModelParams } from '../engine/model';
import { Rng } from '../engine/random';
import type { UnitObs, UnitPrior } from '../engine/types';
import { ROOT, exists, priorsFromMun, readTimeline, truthFromMun, type TimelineRow } from './lib/data';

export const CHECKPOINTS = [0.25, 0.5, 1, 2, 3, 5, 10, 20, 30, 50, 70, 90];

interface CaseDef {
  key: string; title: string; kind: 'presidente' | 'governador';
  prior: { file: string; a: string; b: string };
  truth: { file: string; a: string; b: string };
  timeline: { file: string; a: string; b: string };
  /** média das pesquisas finais para A (% válidos 2 candidatos); null = sem pesquisa (só 1º turno) */
  poll: number | null; pollSd: number;
}

function cases(): CaseDef[] {
  const out: CaseDef[] = [];
  if (exists('timeline_2022_t2_c1.csv.gz'))
    out.push({ key: '2022-2T-PR', title: '2022 2º turno — Presidente (Lula x Bolsonaro)', kind: 'presidente',
      prior: { file: 'mun_2022_t1_c1.csv.gz', a: 'c13', b: 'c22' }, truth: { file: 'mun_2022_t2_c1.csv.gz', a: 'c13', b: 'c22' },
      timeline: { file: 'timeline_2022_t2_c1.csv.gz', a: 'c13', b: 'c22' }, poll: 52.5, pollSd: 2.5 });
  if (exists('timeline_2018_t2_c1.csv.gz') && exists('mun_2018_t1_c1.csv.gz'))
    out.push({ key: '2018-2T-PR', title: '2018 2º turno — Presidente (Haddad x Bolsonaro)', kind: 'presidente',
      prior: { file: 'mun_2018_t1_c1.csv.gz', a: 'c13', b: 'c17' }, truth: { file: 'mun_2018_t2_c1.csv.gz', a: 'c13', b: 'c17' },
      timeline: { file: 'timeline_2018_t2_c1.csv.gz', a: 'c13', b: 'c17' }, poll: 45.0, pollSd: 2.5 });
  if (exists('timeline_2026_t1_c1.csv.gz') && exists('mun_2022_t2_c1.csv.gz'))
    out.push({ key: '2026-1T-PR', title: '2026 1º turno — Presidente (Lula x Flávio, 2 primeiros)', kind: 'presidente',
      prior: { file: 'mun_2022_t2_c1.csv.gz', a: 'c13', b: 'c22' }, truth: { file: 'mun_2026_t1_c1.csv.gz', a: 'c13', b: 'c22' },
      timeline: { file: 'timeline_2026_t1_c1.csv.gz', a: 'c13', b: 'c22' }, poll: 50.83, pollSd: 2.5 }); // média das pesquisas finais (2 finalistas) = real + 1,84 pp
  if (exists('timeline_2022_t1_c1.csv.gz') && exists('mun_2018_t2_c1.csv.gz'))
    out.push({ key: '2022-1T-PR', title: '2022 1º turno — Presidente (Lula x Bolsonaro, 2 primeiros)', kind: 'presidente',
      prior: { file: 'mun_2018_t2_c1.csv.gz', a: 'c13', b: 'c17' }, truth: { file: 'mun_2022_t1_c1.csv.gz', a: 'c13', b: 'c22' },
      timeline: { file: 'timeline_2022_t1_c1.csv.gz', a: 'c13', b: 'c22' }, poll: 54.5, pollSd: 2.5 });
  // governadores 2022 (2º turno), prior = 1º turno do próprio estado, sem pesquisa
  const cand = JSON.parse(readFileSync(`${ROOT}data/processed/candidatos.json`, 'utf8'));
  for (const uf of ['AL', 'AM', 'BA', 'ES', 'MS', 'PB', 'PE', 'RO', 'RS', 'SC', 'SE', 'SP']) {
    const tl = `timeline_2022_t2_c3_${uf}.csv.gz`;
    if (!exists(tl) || !exists(`mun_2022_t1_c3_${uf}.csv.gz`)) continue;
    const nums = Object.keys(cand[`2022_t2_c3_${uf}`] ?? {}).sort((x, y) => Number(x) - Number(y));
    if (nums.length !== 2) continue;
    const [a, b] = nums.map((x) => `c${x}`);
    const names = nums.map((x) => cand[`2022_t2_c3_${uf}`][x]);
    out.push({ key: `2022-2T-GOV-${uf}`, title: `2022 2º turno — Governador ${uf} (${names[0]} x ${names[1]})`, kind: 'governador',
      prior: { file: `mun_2022_t1_c3_${uf}.csv.gz`, a, b }, truth: { file: `mun_2022_t2_c3_${uf}.csv.gz`, a, b },
      timeline: { file: tl, a, b }, poll: null, pollSd: 4.0 });
  }
  return out;
}

interface LoadedCase { def: CaseDef; priors: UnitPrior[]; ufPriors: UnitPrior[]; truthPct: number; snaps: { cp: number; minute: number; obs: Map<string, UnitObs>; ufObs: Map<string, UnitObs> }[] }

function aggregateUF(priors: UnitPrior[]): UnitPrior[] {
  const m = new Map<string, UnitPrior>();
  for (const p of priors) {
    let u = m.get(p.uf);
    if (!u) { u = { id: p.uf, uf: p.uf, name: p.uf.toUpperCase(), aptos: 0, secoes: 0, t1: { lula: 0, flavio: 0, outros: 0, validos: 0, brancos: 0, nulos: 0, comp: 0 } }; m.set(p.uf, u); }
    u.aptos += p.aptos; u.secoes += p.secoes;
    for (const k of Object.keys(u.t1) as (keyof UnitPrior['t1'])[]) u.t1[k] += p.t1[k];
  }
  return [...m.values()];
}

function loadCase(def: CaseDef): LoadedCase {
  const truth = truthFromMun(def.truth.file, def.truth.a, def.truth.b);
  // priors com eleitorado/seções do turno avaliado (no ao vivo vêm do arquivo de andamento)
  const priors = priorsFromMun(def.prior.file, def.prior.a, def.prior.b)
    .filter((p) => truth.units.has(p.id))
    .map((p) => { const t = truth.units.get(p.id)!; return { ...p, aptos: t.aptos, secoes: t.secoes }; });
  const tl: TimelineRow[] = readTimeline(def.timeline.file, def.timeline.a, def.timeline.b);
  const totalSec = tl.reduce((s, r) => s + r.secoes, 0);
  const cum = new Map<string, UnitObs>();
  const snaps: LoadedCase['snaps'] = [];
  let acc = 0, ci = 0, j = 0;
  while (j < tl.length && ci < CHECKPOINTS.length) {
    const minute = tl[j].minute;
    // consome o minuto inteiro (o TSE divulga em lotes)
    while (j < tl.length && tl[j].minute === minute) {
      const r = tl[j++];
      acc += r.secoes;
      let o = cum.get(r.id);
      if (!o) { const t = truth.units.get(r.id); o = { id: r.id, secoes: t?.secoes ?? r.secoes, secoesTot: 0, aptos: t?.aptos ?? r.aptos, aptosTot: 0, comp: 0, lula: 0, flavio: 0, brancos: 0, nulos: 0 }; cum.set(r.id, o); }
      o.secoesTot += r.secoes; o.aptosTot += r.aptos; o.comp += r.comp; o.lula += r.a; o.flavio += r.b; o.brancos += r.brancos; o.nulos += r.nulos;
    }
    while (ci < CHECKPOINTS.length && (100 * acc) / totalSec >= CHECKPOINTS[ci]) {
      const obs = new Map([...cum].map(([k, v]) => [k, { ...v }]));
      const ufObs = new Map<string, UnitObs>();
      for (const o of obs.values()) {
        const uf = o.id.slice(0, 2);
        let u = ufObs.get(uf);
        if (!u) { u = { id: uf, secoes: 0, secoesTot: 0, aptos: 0, aptosTot: 0, comp: 0, lula: 0, flavio: 0, brancos: 0, nulos: 0 }; ufObs.set(uf, u); }
        u.secoesTot += o.secoesTot; u.aptosTot += o.aptosTot; u.comp += o.comp; u.lula += o.lula; u.flavio += o.flavio; u.brancos += o.brancos; u.nulos += o.nulos;
      }
      snaps.push({ cp: CHECKPOINTS[ci], minute, obs, ufObs });
      ci++;
    }
  }
  return { def, priors, ufPriors: aggregateUF(priors), truthPct: truth.aPct, snaps };
}

export interface Metric { key: string; level: string; cp: number; minute: number; pred: number; lo: number; hi: number; truth: number; err: number; covered: boolean; winOk: boolean; pTrue: number; crps: number; naive: number; uniform: number; ufextrap: number; minas: number | null; nordeste: number | null }

function crps(samples: Float64Array, y: number): number {
  const s = Float64Array.from(samples).sort();
  const D = s.length;
  let a = 0, b = 0;
  for (let i = 0; i < D; i++) { a += Math.abs(s[i] - y); b += (2 * (i + 1) - D - 1) * s[i]; }
  return a / D - b / (D * D);
}

/** viés histórico das pesquisas (real − pesquisa), leave-one-out: nunca usa o próprio caso */
let POLL_ERR: { key: string; err: number }[] = [];
export function pollBiasExcluding(key: string): number {
  const xs = POLL_ERR.filter((x) => x.key !== key);
  return xs.length ? xs.reduce((s, x) => s + x.err, 0) / xs.length : 0;
}

function evaluate(lc: LoadedCase, params: ModelParams, level: 'municipio' | 'uf'): Metric[] {
  const prior = lc.def.poll === null ? null : lc.def.poll + pollBiasExcluding(lc.def.key);
  // a 'virada do PT' só existe quando A = PT (presidenciais); nos governadores A é arbitrário
  const pr = { ...params, priorLula: prior, priorSd: lc.def.pollSd, muLate: lc.def.kind === 'presidente' ? params.muLate : 0 };
  const m = prepare(level === 'uf' ? lc.ufPriors : lc.priors, level, pr);
  const out: Metric[] = [];
  for (const s of lc.snaps) {
    const r = run(m, level === 'uf' ? s.ufObs : s.obs);
    const pred = r.lulaQ.mean;
    const aWon = lc.truthPct > 50;
    const meth = Object.fromEntries(r.methods.map((x) => [x.id, x.lulaPct]));
    out.push({
      key: lc.def.key, level, cp: s.cp, minute: s.minute, pred, lo: r.lulaQ.p05, hi: r.lulaQ.p95, truth: lc.truthPct,
      err: pred - lc.truthPct, covered: lc.truthPct >= r.lulaQ.p05 && lc.truthPct <= r.lulaQ.p95,
      winOk: (pred > 50) === aWon, pTrue: aWon ? r.winProbLula : 1 - r.winProbLula, crps: crps(r.finalLula, lc.truthPct),
      naive: meth.naive, uniform: meth.uniform, ufextrap: meth.ufextrap, minas: meth.minas ?? null, nordeste: meth.nordeste ?? null,
    });
  }
  return out;
}

const W: Record<number, number> = { 0.25: 1, 0.5: 2, 1: 3, 2: 2, 3: 1.5, 5: 1.5, 10: 1, 20: 0.7, 30: 0.5, 50: 0.4, 70: 0.3, 90: 0.2 };
function loss(ms: Metric[]): number {
  let s = 0, w = 0;
  for (const x of ms) { const k = (W[x.cp] ?? 0.2) * (x.key.includes('GOV') ? 0.5 : 1); s += k * x.crps; w += k; }
  return s / w;
}

function summarize(ms: Metric[]) {
  const by = new Map<number, Metric[]>();
  for (const x of ms) { if (!by.has(x.cp)) by.set(x.cp, []); by.get(x.cp)!.push(x); }
  const rows = [...by].sort((a, b) => a[0] - b[0]).map(([cp, xs]) => {
    const mae = (f: (x: Metric) => number) => xs.reduce((s, x) => s + Math.abs(f(x)), 0) / xs.length;
    return {
      cp, n: xs.length,
      maeBayes: mae((x) => x.err), maeUniform: mae((x) => x.uniform - x.truth), maeUF: mae((x) => x.ufextrap - x.truth), maeNaive: mae((x) => x.naive - x.truth),
      cover90: xs.filter((x) => x.covered).length / xs.length, winOk: xs.filter((x) => x.winOk).length / xs.length,
      pTrue: xs.reduce((s, x) => s + x.pTrue, 0) / xs.length, crps: xs.reduce((s, x) => s + x.crps, 0) / xs.length,
    };
  });
  return rows;
}

function sample(rng: Rng, base: ModelParams): ModelParams {
  const lu = (lo: number, hi: number) => Math.exp(Math.log(lo) + rng.uniform() * (Math.log(hi) - Math.log(lo)));
  return { ...base, sigmaOrd: lu(0.02, 0.35), sigmaSec: lu(0.08, 0.9), muLate: base.muLate, sigmaE: lu(0.02, 0.25), sigmaESmall: lu(0.01, 0.3), sigmaU: lu(0.01, 0.3), sigmaBeta: lu(0.2, 6), sigmaBeta2: lu(0.01, 0.5), sigmaZeta: lu(0.005, 0.2), sigmaZetaUF: lu(0.005, 0.2), alpha: 0.15 + rng.uniform() * 0.6 };
}

async function main() {
  const args = process.argv.slice(2);
  const tuneN = args.includes('--tune') ? Number(args[args.indexOf('--tune') + 1] ?? 60) : 0;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const defs = cases().filter((d) => !only || d.key.includes(only));
  console.log(`casos: ${defs.map((d) => d.key).join(', ')}`);
  const t0 = Date.now();
  const loaded = defs.map(loadCase);
  POLL_ERR = loaded.filter((l) => l.def.poll !== null).map((l) => ({ key: l.def.key, err: l.truthPct - (l.def.poll as number) }));
  console.log('erro histórico das pesquisas (real − pesquisa):', POLL_ERR.map((x) => `${x.key} ${x.err.toFixed(2)}`).join(' | '));
  console.log(`carregado em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const pfile = `${ROOT}data/model/params.json`;
  const saved = existsSync(pfile) ? JSON.parse(readFileSync(pfile, 'utf8')) : {};
  let mun: ModelParams = { ...DEFAULT_MUN_PARAMS, ...(saved.municipio ?? {}) };
  let uf: ModelParams = { ...DEFAULT_UF_PARAMS, ...(saved.uf ?? {}) };

  const evalAll = (p: ModelParams, level: 'municipio' | 'uf', draws: number, sub = loaded) =>
    sub.filter((l) => level === 'municipio' || l.def.kind === 'presidente').flatMap((l) => evaluate(l, { ...p, draws }, level));

  for (const kv of args.filter((a) => a.startsWith('--set=')).map((a) => a.slice(6).split('='))) { (mun as unknown as Record<string, number>)[kv[0]] = Number(kv[1]); (uf as unknown as Record<string, number>)[kv[0]] = Number(kv[1]); }
  if (args.includes('--eval-only')) {
    const level = (args[args.indexOf('--eval-only') + 1] ?? 'municipio') as 'municipio' | 'uf';
    const ms = evalAll(level === 'uf' ? uf : mun, level, 600);
    console.log(JSON.stringify({ loss: loss(ms), sum: summarize(ms).map((r) => [r.cp, +r.maeBayes.toFixed(2), +r.cover90.toFixed(2)]) }));
    return;
  }
  const seedArg = args.includes('--seed') ? Number(args[args.indexOf('--seed') + 1]) : 0;
  const levelArg = args.includes('--level') ? args[args.indexOf('--level') + 1] : null;
  const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  // --merge a.json b.json … : escolhe o melhor de cada nível entre buscas paralelas
  if (args.includes('--merge')) {
    const files = args.slice(args.indexOf('--merge') + 1).filter((x) => !x.startsWith('--'));
    for (const level of ['municipio', 'uf'] as const) {
      const cands = files.map((f) => JSON.parse(readFileSync(f, 'utf8'))).filter((r) => r.level === level).sort((a, b) => a.loss - b.loss);
      if (cands.length) { console.log(`[merge] ${level}: melhor CRPS ${cands[0].loss.toFixed(4)} (${cands.length} buscas)`); if (level === 'uf') uf = { ...uf, ...cands[0].params }; else mun = { ...mun, ...cands[0].params }; }
    }
    mkdirSync(`${ROOT}data/model`, { recursive: true });
    const strip = (p: ModelParams) => { const { priorLula, priorSd, draws, seed, ...rest } = p; void priorLula; void priorSd; void draws; void seed; return rest; };
    writeFileSync(pfile, JSON.stringify({ trainedAt: new Date().toISOString(), cases: defs.map((d) => d.key), municipio: strip(mun), uf: strip(uf) }, null, 2));
  }
  if (tuneN > 0 && outArg && levelArg) {
    const level = levelArg as 'municipio' | 'uf';
    const rng = new Rng(1000 + seedArg);
    let best = level === 'uf' ? uf : mun;
    let bestL = loss(evalAll(best, level, 300));
    for (let it = 0; it < tuneN; it++) {
      const cand = it % 2 === 0 ? sample(rng, best) : perturb(rng, best);
      const l = loss(evalAll(cand, level, 300));
      if (l < bestL) { bestL = l; best = cand; console.log(`[${level}#${seedArg}] it ${it}: CRPS=${l.toFixed(4)} ${fmt(best)}`); writeFileSync(outArg, JSON.stringify({ level, loss: bestL, params: best })); }
    }
    writeFileSync(outArg, JSON.stringify({ level, loss: bestL, params: best }));
    return;
  }
  if (tuneN > 0) {
    for (const level of ['municipio', 'uf'] as const) {
      const rng = new Rng(level === 'uf' ? 7 : 3);
      let best = level === 'uf' ? uf : mun;
      let bestL = loss(evalAll(best, level, 300));
      console.log(`[${level}] inicial CRPS=${bestL.toFixed(4)}`);
      for (let it = 0; it < tuneN; it++) {
        // metade exploração aleatória, metade perturbação local do melhor
        const cand = it % 2 === 0 ? sample(rng, best) : perturb(rng, best);
        const l = loss(evalAll(cand, level, 300));
        if (l < bestL) { bestL = l; best = cand; console.log(`[${level}] it ${it}: CRPS=${l.toFixed(4)} ${fmt(best)}`); }
      }
      if (level === 'uf') uf = best; else mun = best;
    }
    mkdirSync(`${ROOT}data/model`, { recursive: true });
    const strip = (p: ModelParams) => { const { priorLula, priorSd, draws, seed, ...rest } = p; void priorLula; void priorSd; void draws; void seed; return rest; };
    writeFileSync(pfile, JSON.stringify({ trainedAt: new Date().toISOString(), cases: defs.map((d) => d.key), municipio: strip(mun), uf: strip(uf) }, null, 2));
    console.log('params salvos →', pfile);
  }

  // avaliação final com mais sorteios
  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), cases: defs.map((d) => ({ key: d.key, title: d.title })), pollErrors: POLL_ERR, pollBiasAll: pollBiasExcluding('') };
  for (const level of ['municipio', 'uf'] as const) {
    const ms = evalAll(level === 'uf' ? uf : mun, level, 2000);
    const sum = summarize(ms);
    report[level] = { summary: sum, metrics: ms };
    console.log(`\n══ ${level.toUpperCase()} ══  (MAE em pontos percentuais do resultado final)`);
    console.log('  %apur  n  BAYES  UNIF   UF    CRU   cob90  acerto  P(vencedor)');
    for (const r of sum) console.log(`  ${String(r.cp).padStart(5)} ${String(r.n).padStart(2)}  ${r.maeBayes.toFixed(2).padStart(5)} ${r.maeUniform.toFixed(2).padStart(5)} ${r.maeUF.toFixed(2).padStart(5)} ${r.maeNaive.toFixed(2).padStart(5)}   ${(100 * r.cover90).toFixed(0).padStart(3)}%   ${(100 * r.winOk).toFixed(0).padStart(3)}%    ${(100 * r.pTrue).toFixed(1)}%`);
  }
  // detalhe por caso no checkpoint de 1%
  console.log('\n══ DETALHE @1% (municipal) ══');
  for (const x of (report.municipio as { metrics: Metric[] }).metrics.filter((x) => x.cp === 1))
    console.log(`  ${x.key.padEnd(16)} min ${String(x.minute).padStart(3)}  prev ${x.pred.toFixed(2)} [${x.lo.toFixed(1)}–${x.hi.toFixed(1)}]  real ${x.truth.toFixed(2)}  erro ${x.err >= 0 ? '+' : ''}${x.err.toFixed(2)}  cru ${x.naive.toFixed(2)}  P(venc) ${(100 * x.pTrue).toFixed(0)}%`);
  writeFileSync(`${ROOT}data/model/backtest.json`, JSON.stringify(report));
  console.log(`\nrelatório → data/model/backtest.json (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

function perturb(rng: Rng, p: ModelParams): ModelParams {
  const j = (v: number) => v * Math.exp(0.35 * rng.normal());
  return { ...p, sigmaOrd: Math.min(0.4, j(p.sigmaOrd)), sigmaSec: j(p.sigmaSec), sigmaE: j(p.sigmaE), sigmaESmall: j(p.sigmaESmall), sigmaU: j(p.sigmaU), sigmaBeta: j(p.sigmaBeta), sigmaBeta2: j(p.sigmaBeta2), sigmaZeta: j(p.sigmaZeta), sigmaZetaUF: j(p.sigmaZetaUF), alpha: Math.min(0.95, Math.max(0.05, p.alpha + 0.08 * rng.normal())) };
}
const fmt = (p: ModelParams) => `mu=${(p.muLate ?? 0).toFixed(3)} ord=${p.sigmaOrd.toFixed(3)} sec=${p.sigmaSec.toFixed(3)} E=${p.sigmaE.toFixed(3)} Es=${p.sigmaESmall.toFixed(3)} U=${p.sigmaU.toFixed(3)} B=${p.sigmaBeta.toFixed(2)} B2=${p.sigmaBeta2.toFixed(3)} Z=${p.sigmaZeta.toFixed(3)} Zu=${p.sigmaZetaUF.toFixed(3)} a=${p.alpha.toFixed(2)}`;

main().catch((e) => { console.error(e); process.exit(1); });
