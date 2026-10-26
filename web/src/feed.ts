// Fonte de dados do dashboard — tudo automático, sem precisar recarregar a página.
//  1) WORKER: o programa local (modelo por município) publica no Vercel Blob → lemos a cada 20 s
//     (o Blob tem cache de até 60 s, então a PREVISÃO municipal chega com ~1 min de atraso).
//  2) NAVEGADOR: a cada 15 s o próprio navegador baixa os totais do TSE (BR + UFs; CORS aberto)
//     e roda o mesmo motor por UF. O PLACAR (votos, % apurado, estados) vem sempre da fonte mais
//     recente — então os números andam no ritmo do TSE, e a previsão municipal é sobreposta.
//     Se o worker cair ou atrasar mais de 150 s, o navegador assume a previsão sozinho.
//  Ao voltar para a aba (ou a internet voltar), atualiza na hora.
//  ?local=1 → lê o worker em http://localhost:8787
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

export interface FeedMeta {
  mode: 'worker' | 'browser' | 'pre';
  lastOk: number;          // epoch ms do último dado bom
  error?: string;
}

export const WORKER_URL = 'https://u0jc3e2rvtfdcwiu.public.blob.vercel-storage.com/live/state.json';
const LOCAL_URL = 'http://localhost:8787/state.json';
const STALE_MS = 240_000;   // medido a partir de quando ESTE navegador viu o dado novo (não do relógio do visitante)
const HIST_KEY = 'qg-browser-history-v1';

const params = new URLSearchParams(location.search);

type Hist = ForecastState['history'][number];

export function startFeed(onState: (s: ForecastState, meta: FeedMeta) => void): () => void {
  // ?worker= só vale em testes locais (página E worker em localhost): no domínio público é ignorado,
  // para ninguém compartilhar um link do site exibindo uma "previsão" vinda de outra fonte.
  const override = safeTestWorker(params.get('worker'));
  const workerUrl = override ?? (params.has('local') ? LOCAL_URL : WORKER_URL);
  const persist = !override; // nunca grava no navegador dados de uma fonte de teste

  let worker: ForecastState | null = null;
  let workerAt = 0;
  let workerSeenAt = 0;
  let browser: ForecastState | null = null;
  let browserAt = 0;
  let lastErr: string | undefined;
  let stopped = false;
  const lastObs = new Map<string, UnitObs>();
  let ufFail = false;

  // ── motor no navegador (nível UF) ──
  const ufPriors = unpack(ufPacked as never);
  const p: ModelParams = { ...DEFAULT_UF_PARAMS, ...((trained as { uf?: Partial<ModelParams> }).uf ?? {}), alpha: livePrior.alpha, priorLula: livePrior.priorLula, priorSd: livePrior.priorSd, draws: 1500 };
  const prepared = prepare(ufPriors, 'uf', p);
  const cu = curvesUF as unknown as { K: number } & Record<string, { nat: number[]; uf: Record<string, number[]> }>;
  const curves: Curves = { K: cu.K, ...(cu[livePrior.curves] ?? cu['2022_t2']) };
  let savedHist: Hist[] = [];
  try {
    const h = localStorage.getItem(HIST_KEY);
    const arr: unknown = h ? JSON.parse(h) : [];
    // só aceita pontos bem formados (proteção contra dados corrompidos)
    if (Array.isArray(arr)) savedHist = arr.filter((x): x is Hist =>
      !!x && typeof x.t === 'string' && [x.pct, x.lulaPct, x.projLulaPct, x.projLo, x.projHi, x.winProbLula].every((v) => typeof v === 'number' && Number.isFinite(v))
      && x.pct >= 0 && x.pct <= 100 && x.lulaPct >= 0 && x.lulaPct <= 100 && x.winProbLula >= 0 && x.winProbLula <= 1
      && Date.parse(x.t) >= COUNT_START.getTime() - 3_600_000);
  } catch { /* sem storage */ }

  /** histórico e eventos mais ricos do worker (mesmo atrasado) + o que o navegador viu depois */
  const withWorkerHistory = (b: ForecastState): ForecastState => {
    if (!worker?.history?.length) return b;
    const last = worker.history[worker.history.length - 1];
    const newestW = worker.events?.[0]?.t ?? '';
    return {
      ...b,
      history: [...worker.history, ...b.history.filter((h) => h.t > last.t && h.pct > last.pct)],
      events: dedupeEvents([...b.events.filter((e) => e.t > newestW), ...(worker.events ?? [])]),
    };
  };

  /** previsão municipal do worker + placar mais fresco do navegador */
  const overlay = (w: ForecastState, b: ForecastState): ForecastState => {
    const f = w.forecast;
    const last = w.history[w.history.length - 1];
    const extra = b.history
      .filter((h) => (!last || (h.t > last.t && h.pct > last.pct)))
      .map((h) => ({ ...h, projLulaPct: f.lulaPct.mean, projLo: f.lulaPct.p05, projHi: f.lulaPct.p95, winProbLula: f.winProbLula }));
    const traj = f.trajectory.filter((pt) => pt.pct >= b.progress.pct);
    return {
      ...w,
      status: b.status === 'final' ? 'final' : w.status === 'pre' ? b.status : w.status,
      tse: b.tse, progress: b.progress, current: b.current,
      states: w.states.map((st) => { const bs = b.states.find((x) => x.uf === st.uf); return bs && bs.pct >= st.pct ? { ...st, pct: bs.pct, lulaPct: bs.lulaPct } : st; }),
      history: [...w.history, ...extra],
      forecast: { ...f, trajectory: traj.length ? traj : f.trajectory.slice(-1) },
    };
  };

  const emit = () => {
    const now = Date.now();
    const w = worker && now - workerSeenAt < STALE_MS ? worker : null;
    const b = browser?.progress ? browser : null;
    const ahead = (a: ForecastState, c: ForecastState) => (a.status !== 'pre' && c.status === 'pre') || a.progress.secoesTot > c.progress.secoesTot;
    let s: ForecastState | null = null;
    let mode: FeedMeta['mode'] = 'browser';
    if (w && b && w.status === 'pre' && b.status !== 'pre') s = withWorkerHistory(b);          // a apuração começou e o worker ainda não propagou
    else if (w && b && b.progress.secoesTot > w.progress.secoesTot) { s = overlay(w, b); mode = 'worker'; }
    else if (w) { s = w; mode = 'worker'; }
    else if (b && worker && ahead(worker, b)) { s = worker; mode = 'worker'; }                // worker parado, mas o navegador está ainda mais atrás
    else if (b) s = withWorkerHistory(b);
    else if (worker) { s = worker; mode = 'worker'; }
    if (!s) return;
    if (s.status === 'pre' && mode !== 'worker') mode = 'pre';
    onState(s, { mode, lastOk: Math.max(workerAt, browserAt), error: lastErr });
  };

  async function pollWorker() {
    try {
      const r = await fetch(`${workerUrl}?t=${Math.floor(Date.now() / 10000)}`, { cache: 'no-store' });
      if (r.ok) {
        const s = (await r.json()) as ForecastState;
        const regress = worker && worker.status !== 'pre' && s.status === 'pre';
        if (s?.progress && s.forecast && (!worker || (s.generatedAt >= worker.generatedAt && !regress))) {
          if (!worker || s.generatedAt > worker.generatedAt) workerSeenAt = Date.now();
          worker = s; workerAt = Date.now();
        }
      }
    } catch (e) { lastErr = `worker: ${(e as Error).message}`; }
    emit();
  }

  async function pollTSE() {
    try {
      const nearStart = Date.now() > COUNT_START.getTime() - 10 * 60000;
      const br = parseResult('br', await fetchJson(urls.result('br', ELE_T2)));
      const national: National = { dg: br.dg, hg: br.hg, secoes: br.secoes, secoesTot: br.secoesTot, aptos: br.aptos, aptosTot: br.aptosTot, comp: br.comp, lula: br.votes[NR_LULA] ?? 0, flavio: br.votes[NR_FLAVIO] ?? 0, brancos: br.brancos, nulos: br.nulos, finished: br.finished };
      if (br.secoes === 0) throw new Error('arquivo BR inválido');
      // cópia mais antiga no CDN do TSE: ignora (o placar nunca anda para trás)
      if (browser?.progress && browser.status !== 'pre' && br.secoesTot < browser.progress.secoesTot) { browserAt = Date.now(); emit(); return; }
      // nada mudou no TSE desde a última leitura → não refaz a conta
      if (!ufFail && browser?.progress && browser.tse.hg === br.hg && browser.tse.dg === br.dg && browser.progress.secoesTot === br.secoesTot) { browserAt = Date.now(); emit(); return; }
      const obs = new Map<string, UnitObs>();
      if (br.secoesTot > 0 || nearStart) {
        ufFail = false;
        await Promise.all(UFS.map(async (uf) => {
          try { const o = resultToObs(uf, parseResult(uf, await fetchJson(urls.result(uf, ELE_T2)))); obs.set(uf, o); lastObs.set(uf, o); }
          catch { ufFail = true; const o = lastObs.get(uf); if (o) obs.set(uf, o); }
        }));
      }
      const { state } = buildForecast({ priors: ufPriors, level: 'uf', params: p, prepared, obs, national, curves, now: new Date(), source: 'browser', prev: browser, priorSource: livePrior.source, scores: scores as never });
      { const b = state.forecast.methods.find((x) => x.id === 'bayes'); if (b) { b.id = 'bayes-uf'; b.name = 'BAYES POR ESTADO'; b.desc = 'Modelo bayesiano com os totais das 27 UFs + exterior, rodando no seu navegador (plano B)'; const sc = (scores as unknown as Record<string, { mae1: number | null; mae5: number | null }>)['bayes-uf']; b.mae1 = sc?.mae1; b.mae5 = sc?.mae5; } }
      if (!browser && savedHist.length && state.status !== 'pre') {
        // recarregou a página: recupera o histórico que este navegador já tinha visto
        const first = state.history[0]?.t ?? '9';
        state.history = [...savedHist.filter((h) => h.t < first), ...state.history];
      }
      browser = state; browserAt = Date.now(); lastErr = undefined;
      if (persist) try { localStorage.setItem(HIST_KEY, JSON.stringify(state.history.slice(-600))); } catch { /* cheio */ }
    } catch (e) { lastErr = `TSE: ${(e as Error).message}`; }
    emit();
  }

  // ── agendamento com "chute": ao voltar para a aba ou a internet voltar, busca na hora ──
  const pollers: { fn: () => Promise<void>; every: () => number; timer: number; busy: boolean; last: number }[] = [];
  const add = (fn: () => Promise<void>, every: () => number) => {
    const it = { fn, every, timer: 0, busy: false, last: 0 };
    pollers.push(it);
    run(it);
  };
  async function run(it: (typeof pollers)[number]) {
    if (stopped || it.busy) return;
    clearTimeout(it.timer);
    it.busy = true; it.last = Date.now();
    try { await it.fn(); } finally { it.busy = false; }
    if (!stopped) it.timer = window.setTimeout(() => run(it), it.every());
  }
  const kick = () => { for (const it of pollers) if (Date.now() - it.last > 4000) run(it); };
  const onVis = () => { if (document.visibilityState === 'visible') kick(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);

  const tseEvery = () => {
    const toStart = COUNT_START.getTime() - Date.now();
    if (toStart > 10 * 60000) return 120_000;           // antes das 16:50: a cada 2 min
    if (browser?.status === 'final') return 60_000;
    return 15_000;                                       // apuração: a cada 15 s
  };
  add(pollWorker, () => 20_000);
  add(pollTSE, tseEvery);
  // mantém o "há X s" e a troca de fonte em dia mesmo sem dado novo
  const tick = window.setInterval(emit, 10_000);
  return () => {
    stopped = true;
    pollers.forEach((it) => clearTimeout(it.timer));
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', kick);
    window.removeEventListener('focus', kick);
  };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function safeTestWorker(raw: string | null): string | null {
  if (!raw || !LOCAL_HOSTS.has(location.hostname)) return null;
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch { return null; }
}

/** remove eventos repetidos (mesmo significado em até 10 min) — acontece ao alternar worker ↔ navegador */
function dedupeEvents(evs: ForecastState['events']): ForecastState['events'] {
  const sorted = [...evs].sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  const seen = new Map<string, number>();
  const out: ForecastState['events'] = [];
  for (const e of sorted) {
    const key = `${e.kind}|${e.who ?? ''}|${e.text.split(/ — |[(:]/)[0].trim()}`;
    const t = Date.parse(e.t);
    const prev = seen.get(key);
    if (prev !== undefined && Math.abs(prev - t) < 10 * 60000) continue;
    seen.set(key, t);
    out.push(e);
  }
  return out.slice(0, 80);
}
