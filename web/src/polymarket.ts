// Widget do Polymarket (mercado de apostas), buscado direto do navegador a cada 30 s.
import { fmtNum, fmtUsd, timeHMS } from './format';
import { iconSvg } from './sprites';

const URL_EVT = 'https://gamma-api.polymarket.com/events?slug=brazil-presidential-election';
const SLUG_LULA = 'will-luiz-incio-lula-da-silva-win-the-2026-brazilian-presidential-election';
const SLUG_FLAVIO = 'will-flvio-bolsonaro-win-the-2026-brazilian-presidential-election';
const EVERY = 30_000;

export interface PolyData {
  lula: number | null;      // 0..1 (preço do "Yes")
  flavio: number | null;
  lulaLast: number | null;
  flavioLast: number | null;
  volume: number | null;    // USD
  at: number;               // epoch ms
}

interface Market { slug?: string; groupItemTitle?: string; question?: string; outcomePrices?: string | string[]; lastTradePrice?: number | string }
interface EventResp { volume?: number | string; markets?: Market[] }

function yesPrice(m?: Market): number | null {
  if (!m) return null;
  try {
    const arr = typeof m.outcomePrices === 'string' ? (JSON.parse(m.outcomePrices) as unknown[]) : m.outcomePrices;
    const v = Number(arr?.[0]);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}
const num = (x: unknown): number | null => { const v = Number(x); return x != null && Number.isFinite(v) ? v : null; };

function findMarket(ms: Market[], slug: string, name: string): Market | undefined {
  const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return ms.find((m) => m.slug === slug) ?? ms.find((m) => norm(m.groupItemTitle).includes(name)) ?? ms.find((m) => norm(m.question).includes(name));
}

type Sub = (d: PolyData | null, err: boolean) => void;
const subs = new Set<Sub>();
let last: PolyData | null = null;
let lastErr = false;
let timer = 0;

async function poll(): Promise<void> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12_000);
    const r = await fetch(URL_EVT, { signal: ctl.signal, headers: { accept: 'application/json' } });
    clearTimeout(to);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const js = (await r.json()) as EventResp[] | EventResp;
    const ev = Array.isArray(js) ? js[0] : js;
    const ms = ev?.markets ?? [];
    const ml = findMarket(ms, SLUG_LULA, 'lula');
    const mf = findMarket(ms, SLUG_FLAVIO, 'flavio');
    if (!ml && !mf) throw new Error('mercados não encontrados');
    last = {
      lula: yesPrice(ml), flavio: yesPrice(mf),
      lulaLast: num(ml?.lastTradePrice), flavioLast: num(mf?.lastTradePrice),
      volume: num(ev?.volume), at: Date.now(),
    };
    lastErr = false;
  } catch {
    lastErr = true;
  }
  subs.forEach((f) => f(last, lastErr));
}

export function subscribePoly(fn: Sub): () => void {
  subs.add(fn);
  if (last || lastErr) fn(last, lastErr);
  if (!timer) {
    void poll();
    timer = window.setInterval(() => void poll(), EVERY);
  }
  return () => {
    subs.delete(fn);
    if (!subs.size && timer) { clearInterval(timer); timer = 0; }
  };
}

/** Monta o widget dentro de `root`. */
export function mountPoly(root: HTMLElement, titleId = ''): () => void {
  root.innerHTML = `
    <div class="panel-head"><h2 ${titleId ? `id="${titleId}"` : ''} class="panel-title">POLYMARKET<small>Mercado de apostas — não é previsão do modelo</small></h2></div>
    <div class="pm-rows">
      <div class="pm-row l"><span class="who">${iconSvg('star', '#ff6b72', 10)} LULA</span><span class="pm-bar"><i style="width:0"></i></span><b>—</b></div>
      <div class="pm-row f"><span class="who">${iconSvg('diamond', '#7cf2a4', 10)} FLÁVIO</span><span class="pm-bar"><i style="width:0"></i></span><b>—</b></div>
    </div>
    <div class="pm-meta"><span class="vol">Volume —</span><span class="upd">conectando…</span></div>`;
  const rows = root.querySelectorAll<HTMLElement>('.pm-row');
  const vol = root.querySelector<HTMLElement>('.vol')!;
  const upd = root.querySelector<HTMLElement>('.upd')!;
  const pct = (p: number | null) => (p == null ? '—' : `${fmtNum(p * 100, p < 0.1 ? 1 : 0)}%`);
  return subscribePoly((d, err) => {
    root.classList.toggle('is-off', err);
    if (d) {
      const set = (row: HTMLElement, p: number | null, lastP: number | null) => {
        row.querySelector<HTMLElement>('.pm-bar i')!.style.width = `calc(${Math.max(0, Math.min(1, p ?? 0)) * 100}% - 4px)`;
        const b = row.querySelector('b')!;
        b.textContent = pct(p);
        b.title = lastP != null ? `Último negócio: ${pct(lastP)}` : '';
      };
      set(rows[0], d.lula, d.lulaLast);
      set(rows[1], d.flavio, d.flavioLast);
      vol.textContent = d.volume != null ? `Volume ${fmtUsd(d.volume)}` : 'Volume —';
    }
    upd.className = `upd${err ? ' off' : ''}`;
    upd.textContent = err ? (d ? `offline · último ${timeHMS(d.at)}` : 'offline — sem conexão com o Polymarket') : d ? `atualizado ${timeHMS(d.at)}` : 'conectando…';
  });
}
