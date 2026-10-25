// Fonte de dados do dashboard.
//  1) WORKER: o programa local (modelo por município) publica no Vercel Blob → lemos daqui.
//  2) NAVEGADOR: em paralelo, o próprio navegador baixa os totais do TSE (BR + UFs; CORS aberto)
//     e roda o mesmo motor no nível de UF. Se o worker cair/atrasar, assumimos sozinhos.
//  ?demo=1  → simulação acelerada (mock)       ?local=1 → lê o worker em http://localhost:8787
import type { ForecastState, UnitObs } from '../../engine/types';
import { DEFAULT_UF_PARAMS, prepare, type ModelParams } from '../../engine/model';
import { buildForecast, COUNT_START, type National } from '../../engine/forecast';
import { ELE_T2, NR_FLAVIO, NR_LULA, UFS, fetchJson, parseResult, resultToObs, urls } from '../../engine/tse';
import { unpack } from '../../engine/priors';
import type { Curves } from '../../engine/trajectory';
import ufPacked from '../../data/priors/t1_2026_uf.json';
import curvesUF from '../../data/model/curves_uf.json';
import trained from '../../data/model/params.json';
import livePrior from '../../data/model/live_prior.json';
import scores from '../../data/model/method_scores.json';
import { startMock } from './mock';

export interface FeedMeta {
  mode: 'worker' | 'browser' | 'demo' | 'pre';
  lastOk: number;          // epoch ms do último dado bom
  error?: string;
}

export const WORKER_URL = 'https://u0jc3e2rvtfdcwiu.public.blob.vercel-storage.com/live/state.json';
const LOCAL_URL = 'http://localhost:8787/state.json';
const STALE_MS = 150_000;
const HIST_KEY = 'qg-browser-history-v1';

const params = new URLSearchParams(location.search);

export function startFeed(onState: (s: ForecastState, meta: FeedMeta) => void): () => void {
  if (params.has('demo')) return startMock(onState);
  const workerUrl = params.has('local') ? LOCAL_URL : WORKER_URL;

  let worker: ForecastState | null = null;
  let workerAt = 0;
  let browser: ForecastState | null = null;
  let browserAt = 0;
  let lastErr: string | undefined;
  let stopped = false;
  const timers: number[] = [];

  // ── motor no navegador (nível UF) ──
  const ufPriors = unpack(ufPacked as never);
  const p: ModelParams = { ...DEFAULT_UF_PARAMS, ...((trained as { uf?: Partial<ModelParams> }).uf ?? {}), alpha: livePrior.alpha, priorLula: livePrior.priorLula, priorSd: livePrior.priorSd, draws: 1500 };
  const prepared = prepare(ufPriors, 'uf', p);
  const cu = curvesUF as unknown as { K: number } & Record<string, { nat: number[]; uf: Record<string, number[]> }>;
  const curves: Curves = { K: cu.K, ...(cu[livePrior.curves] ?? cu['2022_t2']) };
  let savedHist: ForecastState['history'] = [];
  try { const h = localStorage.getItem(HIST_KEY); if (h) savedHist = JSON.parse(h); } catch { /* sem storage */ }

  const emit = () => {
    const now = Date.now();
    const workerFresh = worker && now - new Date(worker.generatedAt).getTime() < STALE_MS;
    let s: ForecastState | null = null;
    let mode: FeedMeta['mode'] = 'browser';
    if (workerFresh && worker && (!browser?.progress || worker.progress.pct >= browser.progress.pct - 0.75)) { s = worker; mode = 'worker'; }
    else if (browser?.progress) {
      s = browser;
      // histórico mais rico do worker (mesmo que atrasado) + pontos do navegador depois dele
      if (worker?.history?.length) {
        const lastT = worker.history[worker.history.length - 1].t;
        s = { ...browser, history: [...worker.history, ...browser.history.filter((h) => h.t > lastT)] };
      }
    } else if (worker) { s = worker; mode = 'worker'; }
    if (!s) return;
    if (s.status === 'pre') mode = mode === 'worker' ? 'worker' : 'pre';
    onState(s, { mode, lastOk: Math.max(workerAt, browserAt), error: lastErr });
  };

  async function pollWorker() {
    try {
      const r = await fetch(`${workerUrl}?t=${Math.floor(Date.now() / 15000)}`, { cache: 'no-store' });
      if (r.ok) { const s = (await r.json()) as ForecastState; if (!worker || s.generatedAt >= worker.generatedAt) { worker = s; workerAt = Date.now(); } }
    } catch (e) { lastErr = `worker: ${(e as Error).message}`; }
    emit();
  }

  async function pollTSE() {
    try {
      const nearStart = Date.now() > COUNT_START.getTime() - 10 * 60000;
      const br = parseResult('br', await fetchJson(urls.result('br', ELE_T2)));
      const national: National = { dg: br.dg, hg: br.hg, secoes: br.secoes, secoesTot: br.secoesTot, aptos: br.aptos, aptosTot: br.aptosTot, comp: br.comp, lula: br.votes[NR_LULA] ?? 0, flavio: br.votes[NR_FLAVIO] ?? 0, brancos: br.brancos, nulos: br.nulos };
      const obs = new Map<string, UnitObs>();
      if (br.secoesTot > 0 || nearStart) {
        await Promise.all(UFS.map(async (uf) => {
          try { obs.set(uf, resultToObs(uf, parseResult(uf, await fetchJson(urls.result(uf, ELE_T2))))); } catch { /* UF falhou neste ciclo */ }
        }));
      }
      const { state } = buildForecast({ priors: ufPriors, level: 'uf', params: p, prepared, obs, national, curves, now: new Date(), source: 'browser', prev: browser ?? worker, priorSource: livePrior.source, scores: scores as never });
      { const b = state.forecast.methods.find((x) => x.id === 'bayes'); if (b) { b.id = 'bayes-uf'; b.name = 'BAYES POR ESTADO'; b.desc = 'Modelo bayesiano com os totais das 27 UFs + exterior, rodando no seu navegador (plano B)'; const sc = (scores as unknown as Record<string, { mae1: number | null; mae5: number | null }>)['bayes-uf']; b.mae1 = sc?.mae1; b.mae5 = sc?.mae5; } }
      if (!browser && savedHist.length && state.status !== 'pre') {
        // recarregou a página: recupera o histórico que este navegador já tinha visto
        const first = state.history[0]?.t ?? '9';
        state.history = [...savedHist.filter((h) => h.t < first), ...state.history];
      }
      browser = state; browserAt = Date.now(); lastErr = undefined;
      try { localStorage.setItem(HIST_KEY, JSON.stringify(state.history.slice(-600))); } catch { /* cheio */ }
    } catch (e) { lastErr = `TSE: ${(e as Error).message}`; }
    emit();
  }

  const schedule = (fn: () => Promise<void>, ms: () => number) => {
    const loop = async () => { if (stopped) return; await fn(); timers.push(window.setTimeout(loop, ms())); };
    loop();
  };
  const tseEvery = () => (Date.now() < COUNT_START.getTime() - 10 * 60000 ? 120_000 : 20_000);
  schedule(pollWorker, () => 30_000); // o Blob tem cache de 60 s; mais que isso não traz nada novo
  schedule(pollTSE, tseEvery);
  return () => { stopped = true; timers.forEach(clearTimeout); };
}
