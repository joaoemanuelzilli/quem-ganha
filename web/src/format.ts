// Formatação pt-BR e horário de Brasília.

const nf = (min: number, max = min) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

const NF0 = nf(0);
const NF1 = nf(1);
const NF2 = nf(2);

export function fmtNum(x: number, dec = 0): string {
  if (!Number.isFinite(x)) return '—';
  return dec === 0 ? NF0.format(Math.round(x)) : dec === 1 ? NF1.format(x) : dec === 2 ? NF2.format(x) : nf(dec).format(x);
}

/** 50.62 → "50,6%" */
export function fmtPct(x: number | null | undefined, dec = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${fmtNum(x, dec)}%`;
}

/** 0.374 → "37%" */
export function fmtProb(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v > 99.5 && v < 100) return '>99%';
  if (v < 0.5 && v > 0) return '<1%';
  return `${Math.round(v)}%`;
}

/** 61234567 → "61,2 mi" ; 980000 → "980 mil" */
export function fmtVotesShort(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e6) return `${fmtNum(x / 1e6, a >= 1e8 ? 0 : 1)} mi`;
  if (a >= 1e3) return `${fmtNum(x / 1e3, 0)} mil`;
  return fmtNum(x);
}

/** US$ 198 mi */
export function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return '—';
  if (x >= 1e9) return `US$ ${fmtNum(x / 1e9, 1)} bi`;
  if (x >= 1e6) return `US$ ${fmtNum(x / 1e6, 0)} mi`;
  if (x >= 1e3) return `US$ ${fmtNum(x / 1e3, 0)} mil`;
  return `US$ ${fmtNum(x)}`;
}

/** sinal explícito: +1,2 */
export function fmtSigned(x: number, dec = 1): string {
  if (!Number.isFinite(x)) return '—';
  const s = fmtNum(Math.abs(x), dec);
  return x > 0 ? `+${s}` : x < 0 ? `−${s}` : s;
}

const TZ = 'America/Sao_Paulo';
const TF_HMS = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const TF_HM = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function toDate(t: string | number | Date): Date {
  return t instanceof Date ? t : new Date(t);
}

export function timeHMS(t: string | number | Date): string {
  const d = toDate(t);
  return Number.isNaN(d.getTime()) ? '--:--:--' : TF_HMS.format(d);
}

export function timeHM(t: string | number | Date): string {
  const d = toDate(t);
  return Number.isNaN(d.getTime()) ? '--:--' : TF_HM.format(d);
}

/** Contagem regressiva "HH:MM:SS" (ou "Xd HH:MM:SS"). */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d > 0 ? `${d}d ` : ''}${p(h)}:${p(m)}:${p(ss)}`;
}

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} não encontrado`);
  return e;
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
