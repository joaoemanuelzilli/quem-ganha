// ════════════════════════════════════════════════════════════════════════════
//  WORKER AO VIVO — roda na sua máquina durante a apuração
//   • puxa do TSE: BR + 28 UFs a cada ciclo; andamento por município; e o
//     resultado de cada município que mudou
//   • roda o modelo bayesiano por MUNICÍPIO (5.757 unidades) + o por UF
//   • grava live/state.json, serve http://localhost:8787/state.json
//   • publica no Vercel Blob → o dashboard público lê de lá
//
//   npm run worker            (precisa de .env.local com BLOB_READ_WRITE_TOKEN p/ publicar)
// ════════════════════════════════════════════════════════════════════════════
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { DEFAULT_MUN_PARAMS, DEFAULT_UF_PARAMS, prepare, run, type ModelParams, type PreparedModel } from '../engine/model';
import { buildForecast, comboWeight, COUNT_START, type National } from '../engine/forecast';
import { ELE_T2, NR_FLAVIO, NR_LULA, UFS, fetchJson, parseProgress, parseResult, resultToObs, tseDate, urls } from '../engine/tse';
import { loadPriors, slimState } from '../engine/priors';
import type { Curves } from '../engine/trajectory';
import type { ForecastState, UnitObs } from '../engine/types';

const ROOT = new URL('../', import.meta.url).pathname;
const LIVE = process.env.LIVE_DIR ? `${process.env.LIVE_DIR}/` : `${ROOT}live/`;
mkdirSync(LIVE, { recursive: true });

// .env.local (token do Blob)
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const mm = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim());
    if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2];
  }
}
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PORT = Number(process.env.PORT ?? 8787);
const POLL_MS = Number(process.env.POLL_MS ?? 15000);
const PUBLISH_MS = Number(process.env.PUBLISH_MS ?? 30000);
// ensaio: relógio = horário de geração do TSE (servidor de replay) e início configurável
const USE_TSE_CLOCK = !!process.env.USE_TSE_CLOCK;
const START = process.env.COUNT_START ? new Date(process.env.COUNT_START) : COUNT_START;
const NO_PUBLISH = !!process.env.NO_PUBLISH;
// papéis: 'primary' (nuvem — GitHub Actions) sempre publica; 'backup' (notebook) só publica
// se ninguém mais publicou nos últimos 150 s — troca automática se a nuvem cair.
const ROLE = (process.env.WORKER_ROLE ?? 'primary') as 'primary' | 'backup';
const WORKER_ID = process.env.WORKER_ID ?? `notebook-${os.hostname()}`;
const PUBLIC_STATE_URL = process.env.PUBLIC_STATE_URL ?? 'https://u0jc3e2rvtfdcwiu.public.blob.vercel-storage.com/live/state.json';
const EXIT_AFTER_FINAL_MIN = Number(process.env.EXIT_AFTER_FINAL_MIN ?? 0);

const readJson = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8'));
const trained = existsSync(`${ROOT}data/model/params.json`) ? readJson('data/model/params.json') : {};
const livePrior = readJson('data/model/live_prior.json');
const scores = existsSync(`${ROOT}data/model/method_scores.json`) ? readJson('data/model/method_scores.json') : undefined;
const curvesAll = readJson('data/model/curves.json');
const curveKey = livePrior.curves ?? '2022_t2';
const curves: Curves = { K: curvesAll.K, ...curvesAll[curveKey] };

const munParams: ModelParams = { ...DEFAULT_MUN_PARAMS, ...(trained.municipio ?? {}), alpha: livePrior.alpha, priorLula: livePrior.priorLula, priorSd: livePrior.priorSd, draws: 2000 };
const ufParams: ModelParams = { ...DEFAULT_UF_PARAMS, ...(trained.uf ?? {}), alpha: livePrior.alpha, priorLula: livePrior.priorLula, priorSd: livePrior.priorSd, draws: 2000 };

const { mun: munPriors, uf: ufPriors } = loadPriors(readJson('data/priors/t1_2026_mun.json'), readJson('data/priors/t1_2026_uf.json'));
const prepMun: PreparedModel = prepare(munPriors, 'municipio', munParams);
const prepUF: PreparedModel = prepare(ufPriors, 'uf', ufParams);

let prev: ForecastState | null = !process.env.FRESH && existsSync(`${LIVE}state.json`) ? JSON.parse(readFileSync(`${LIVE}state.json`, 'utf8')) : null;
if (prev && prev.status === 'pre') prev = { ...prev, history: [] };
let lastPublished = 0, lastPublishedKey = '';
const munObs = new Map<string, UnitObs>();
const munSt = new Map<string, number>(); // seções totalizadas no último resultado municipal baixado
let cycle = 0;

const log = (...a: unknown[]) => {
  const t = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${t}]`, ...a);
};

async function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); } }
  throw err;
}
async function pool<T>(items: T[], conc: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (next < items.length) await fn(items[next++]).catch(() => {}); }));
}

async function fetchNational(): Promise<National> {
  const r = parseResult('br', await retry(() => fetchJson(urls.result('br', ELE_T2))));
  return { dg: r.dg, hg: r.hg, secoes: r.secoes, secoesTot: r.secoesTot, aptos: r.aptos, aptosTot: r.aptosTot, comp: r.comp, lula: r.votes[NR_LULA] ?? 0, flavio: r.votes[NR_FLAVIO] ?? 0, brancos: r.brancos, nulos: r.nulos };
}

async function fetchUFs(): Promise<Map<string, UnitObs>> {
  const out = new Map<string, UnitObs>();
  await pool([...UFS], 14, async (uf) => {
    const r = parseResult(uf, await retry(() => fetchJson(urls.result(uf, ELE_T2))));
    out.set(uf, resultToObs(uf, r));
  });
  return out;
}

/** andamento por município → baixa só os municípios que mudaram */
async function refreshMunicipios(): Promise<{ changed: number; failed: number }> {
  const todo: string[] = [];
  await pool([...UFS], 10, async (uf) => {
    const p = parseProgress(await retry(() => fetchJson(urls.progress(uf, ELE_T2))));
    for (const row of p.rows) {
      if (!row.tp.startsWith('mu')) continue;
      const id = `${uf}${row.abr}`;
      if (row.secoesTot > 0 && row.secoesTot !== (munSt.get(id) ?? 0)) todo.push(id);
    }
  });
  let failed = 0;
  await pool(todo, 40, async (id) => {
    try {
      const r = parseResult(id, await retry(() => fetchJson(urls.result(id, ELE_T2)), 2));
      const o = resultToObs(id, r);
      if (o.secoesTot >= (munObs.get(id)?.secoesTot ?? 0)) { munObs.set(id, o); munSt.set(id, o.secoesTot); }
    } catch { failed++; }
  });
  return { changed: todo.length, failed };
}

function publishable(s: ForecastState) {
  return JSON.stringify(slimState(s));
}

let otherCache = { t: 0, alive: false, who: '' };
/** outro worker (ex.: a nuvem) publicou há menos de 150 s? */
async function otherPublisherAlive(): Promise<boolean> {
  if (ROLE === 'primary' || NO_PUBLISH) return false;
  if (Date.now() - otherCache.t < 20000) return otherCache.alive;
  let alive = false, who = '';
  try {
    const s = await fetchJson(`${PUBLIC_STATE_URL}?t=${Date.now()}`, 8000) as ForecastState;
    who = s.publisher ?? '';
    alive = !!s.publisher && s.publisher !== WORKER_ID && Date.now() - new Date(s.generatedAt).getTime() < 150000;
  } catch { alive = false; }
  if (alive !== otherCache.alive) log(alive ? `🛰  ${who} está publicando — este notebook fica de reserva` : '🛟 ninguém publicando — este notebook assume');
  otherCache = { t: Date.now(), alive, who };
  return alive;
}
let standby = false;

async function publish(s: ForecastState) {
  s.publisher = WORKER_ID;
  writeFileSync(`${LIVE}state.json`, JSON.stringify(s));
  const body = publishable(s);
  writeFileSync(`${LIVE}state.public.json`, body);
  if (!BLOB_TOKEN || NO_PUBLISH) return;
  standby = await otherPublisherAlive();
  if (standby) return;
  const key = `${s.progress.secoesTot}|${s.forecast.lulaPct.mean.toFixed(3)}|${s.status}`;
  const now = Date.now();
  if (now - lastPublished < PUBLISH_MS && key === lastPublishedKey) return;
  if (now - lastPublished < PUBLISH_MS && s.status !== 'pre') return;
  if (s.status === 'pre' && now - lastPublished < 120000 && key === lastPublishedKey) return;
  try {
    const { put } = await import('@vercel/blob');
    await put('live/state.json', body, { access: 'public', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: 'application/json', token: BLOB_TOKEN });
    lastPublished = now; lastPublishedKey = key;
  } catch (e) {
    log('⚠ falha ao publicar no Blob:', (e as Error).message);
  }
}

async function tick() {
  cycle++;
  const t0 = Date.now();
  const nat = await fetchNational();
  const counting = nat.secoesTot > 0;
  let ufObs = new Map<string, UnitObs>();
  let munInfo = { changed: 0, failed: 0 };
  if (counting) {
    ufObs = await fetchUFs();
    munInfo = await refreshMunicipios();
  }
  // modelo por UF (comparação / método extra)
  const ufRun = run(prepUF, ufObs);
  const natPct = nat.secoes > 0 ? (100 * nat.secoesTot) / nat.secoes : 0;
  const { state } = buildForecast({
    blend: counting ? { uf: ufRun, weight: comboWeight(natPct) } : undefined,
    scores,
    priors: munPriors, level: 'municipio', params: munParams, prepared: prepMun,
    obs: munObs, national: nat, curves, now: (USE_TSE_CLOCK && tseDate(nat.dg, nat.hg)) || new Date(), start: START, source: 'worker', prev,
    priorSource: livePrior.source,
  });
  const bIdx = state.forecast.methods.findIndex((x) => x.id === 'bayes');
  state.forecast.methods.splice(bIdx + 1, 0, { id: 'bayes-uf', name: 'BAYES POR ESTADO', desc: 'O mesmo modelo, só com os totais das 27 UFs + exterior', lulaPct: ufRun.lulaQ.mean, winProbLula: ufRun.winProbLula, weight: counting ? comboWeight(natPct) : 0, mae1: scores?.['bayes-uf']?.mae1, mae5: scores?.['bayes-uf']?.mae5 });
  // municípios ainda sem resultado baixado, mas com UF reportando → usa o total da UF para a fração apurada do mapa
  for (const s of state.states) {
    const u = ufObs.get(s.uf);
    if (u && u.secoes > 0) { s.pct = (100 * u.secoesTot) / u.secoes; const v = u.lula + u.flavio; s.lulaPct = v > 0 ? (100 * u.lula) / v : null; }
  }
  prev = state;
  await publish(state);
  if (!standby) gitSnapshot(state);
  if (state.status === 'final' && EXIT_AFTER_FINAL_MIN > 0) {
    finalSince ??= Date.now();
    if (Date.now() - finalSince > EXIT_AFTER_FINAL_MIN * 60000) {
      log('🏁 apuração encerrada — último snapshot e saída');
      if (!standby && GIT_SNAPSHOTS) spawnSync('bash', [`${ROOT}scripts/snapshot-git.sh`], { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
      process.exit(10);
    }
  }
  const f = state.forecast;
  log(`${state.progress.pct.toFixed(2).padStart(6)}% apurado | atual Lula ${state.current.lulaPct.toFixed(2)}% | PREVISÃO Lula ${f.lulaPct.mean.toFixed(2)}% [${f.lulaPct.p05.toFixed(1)}–${f.lulaPct.p95.toFixed(1)}] | P(Lula) ${(100 * f.winProbLula).toFixed(1)}% | ${f.call.toUpperCase()} | mun ${f.unitsReporting}${munInfo.changed ? ` (+${munInfo.changed}${munInfo.failed ? `, ${munInfo.failed} falhas` : ''})` : ''} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  appendFileSync(`${LIVE}history.ndjson`, JSON.stringify({ t: state.generatedAt, pct: state.progress.pct, lula: state.current.lulaPct, prev: f.lulaPct.mean, lo: f.lulaPct.p05, hi: f.lulaPct.p95, p: f.winProbLula, call: f.call }) + '\n');
  return state;
}

// registro público: snapshot no branch "ao-vivo" do GitHub a cada 10 min durante a apuração
const GIT_SNAPSHOTS = process.env.GIT_SNAPSHOTS !== '0' && !process.env.NO_PUBLISH;
let lastSnap = 0, finalSnapped = false;
let finalSince: number | undefined;
function gitSnapshot(s: ForecastState) {
  if (!GIT_SNAPSHOTS || s.status === 'pre') return;
  const now = Date.now();
  const finalNow = s.status === 'final' && !finalSnapped;
  if (!finalNow && (s.status === 'final' || now - lastSnap < 10 * 60000)) return;
  if (finalNow) finalSnapped = true;
  lastSnap = now;
  const ch = spawn('bash', [`${ROOT}scripts/snapshot-git.sh`], { cwd: ROOT, stdio: 'ignore', detached: true });
  ch.on('error', () => {});
  ch.unref();
}

function interval(s: ForecastState | null): number {
  const msTo17 = START.getTime() - Date.now();
  if (msTo17 > 15 * 60000 && !USE_TSE_CLOCK) return 60000;    // longe das 17h: a cada minuto
  if (s?.status === 'final') return 60000;
  return POLL_MS;
}

async function loop() {
  for (;;) {
    let s: ForecastState | null = null;
    try { s = await tick(); } catch (e) { log('⚠ erro no ciclo:', (e as Error).message); }
    await new Promise((r) => setTimeout(r, interval(s ?? prev)));
  }
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.url?.startsWith('/state.json') && prev) { res.setHeader('Content-Type', 'application/json'); res.end(publishable(prev)); return; }
  if (req.url?.startsWith('/health')) { res.end(JSON.stringify({ ok: true, cycle, last: prev?.generatedAt })); return; }
  res.statusCode = 404; res.end('not found');
}).on('error', (e) => log(`⚠ servidor local indisponível (${(e as Error).message}) — seguindo só com o Blob`)).listen(PORT, () => log(`🕹  worker no ar — http://localhost:${PORT}/state.json ${BLOB_TOKEN ? '· publicando no Vercel Blob' : '· (sem BLOB_READ_WRITE_TOKEN: só local)'}`));

log(`prior: Lula ${munParams.priorLula}% ± ${munParams.priorSd} · α=${munParams.alpha} · curvas ${curveKey} · ${munPriors.length} municípios · papel ${ROLE} (${WORKER_ID})`);

/** continuidade: se este worker não tem estado salvo, retoma o último publicado (histórico, eventos) */
async function seedFromPublished() {
  if (prev || USE_TSE_CLOCK || NO_PUBLISH) return;
  try {
    const s = await fetchJson(`${PUBLIC_STATE_URL}?t=${Date.now()}`, 10000) as ForecastState;
    if (s?.status && s.status !== 'pre' && s.election?.id === ELE_T2) { prev = s; log(`↺ retomando estado publicado (${s.progress.pct.toFixed(2)}% apurado, ${s.history.length} pontos de histórico)`); }
  } catch { /* começa do zero */ }
}
seedFromPublished().finally(loop);
