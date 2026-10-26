// ARENA: gráfico principal em pixel art.
// Desenha num buffer de baixa resolução (ImageData) e amplia com image-rendering: pixelated.
// x = % seções totalizadas (0→100); y = % dos válidos do Lula (faixa simétrica em torno de 50).
import type { ForecastState, HistoryPoint } from '../../engine/types';
import { clamp, easeOutCubic, el, fmtNum, fmtPct, fmtProb, lerp, reducedMotion, timeHM } from './format';
import { iconSvg } from './sprites';

type RGB = [number, number, number];
const C = {
  bg: [8, 10, 34] as RGB,
  tintL: [232, 34, 46] as RGB,
  tintF: [25, 195, 90] as RGB,
  grid: [30, 34, 86] as RGB,
  gridV: [20, 23, 62] as RGB,
  gold: [255, 212, 0] as RGB,
  lula: [255, 59, 71] as RGB,
  lulaL: [255, 120, 126] as RGB,
  flav: [34, 214, 102] as RGB,
  flavL: [124, 242, 164] as RGB,
  ink: [245, 243, 255] as RGB,
  proj: [196, 192, 255] as RGB,
  shadow: [3, 3, 14] as RGB,
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const GRID_N = 401; // amostras da trajetória em 0..100 (passo 0,25)

interface HistP { pct: number; lula: number; proj: number; lo: number; hi: number; win: number; t: string }
interface Geo {
  yMin: number; yMax: number; head: number; headLula: number;
  hist: HistP[];
  traj: Float32Array; // 3 * GRID_N (p05, p50, p95), NaN fora do domínio
  fin: [number, number, number];
  leader: 'lula' | 'flavio';
}

function emptyTraj(): Float32Array {
  const a = new Float32Array(GRID_N * 3);
  a.fill(NaN);
  return a;
}

function buildGeo(s: ForecastState): Geo {
  const hist: HistP[] = (s.history ?? [])
    .filter((h: HistoryPoint) => Number.isFinite(h.pct) && Number.isFinite(h.lulaPct) && h.lulaPct > 0 && h.pct > 0)
    .map((h) => ({ pct: h.pct, lula: h.lulaPct, proj: h.projLulaPct, lo: h.projLo, hi: h.projHi, win: h.winProbLula, t: h.t }))
    .sort((a, b) => a.pct - b.pct);
  const head = s.progress.pct > 0 ? s.progress.pct : hist.length ? hist[hist.length - 1].pct : 0;
  const headLula = s.current.validos > 0 ? s.current.lulaPct : hist.length ? hist[hist.length - 1].lula : 50;
  if (s.current.validos > 0 && (!hist.length || hist[hist.length - 1].pct < head - 1e-6)) {
    hist.push({ pct: head, lula: headLula, proj: s.forecast.lulaPct.p50, lo: s.forecast.lulaPct.p05, hi: s.forecast.lulaPct.p95, win: s.forecast.winProbLula, t: s.generatedAt });
  }
  // trajetória → grade fixa
  const traj = emptyTraj();
  const tp = [...(s.forecast.trajectory ?? [])].filter((p) => Number.isFinite(p.pct)).sort((a, b) => a.pct - b.pct);
  if (tp.length && tp[0].pct > head + 0.01 && s.current.validos > 0) {
    tp.unshift({ pct: head, lula: { p05: headLula, p50: headLula, p95: headLula } });
  }
  if (tp.length >= 2) {
    for (let i = 0; i < GRID_N; i++) {
      const x = (i / (GRID_N - 1)) * 100;
      if (x < tp[0].pct - 1e-9 || x > tp[tp.length - 1].pct + 1e-9) continue;
      let j = 0;
      while (j < tp.length - 2 && tp[j + 1].pct < x) j++;
      const a = tp[j], b = tp[j + 1];
      const u = b.pct > a.pct ? clamp((x - a.pct) / (b.pct - a.pct), 0, 1) : 0;
      traj[i * 3] = lerp(a.lula.p05, b.lula.p05, u);
      traj[i * 3 + 1] = lerp(a.lula.p50, b.lula.p50, u);
      traj[i * 3 + 2] = lerp(a.lula.p95, b.lula.p95, u);
    }
  }
  const q = s.forecast.lulaPct;
  const fin: [number, number, number] = [q.p05, q.p50, q.p95];

  // faixa y: cobre os dados (sempre incluindo 50 ± 3) em passos de 2 pp
  let lo = 47, hi = 53;
  const take = (v: number) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
  for (const h of hist) if (h.pct >= 1) { take(h.lula); take(h.lo); take(h.hi); }
  for (let i = 0; i < GRID_N; i++) { take(traj[i * 3]); take(traj[i * 3 + 2]); }
  fin.forEach(take);
  const yMin = clamp(Math.floor((lo - 0.6) / 2) * 2, 20, 46);
  const yMax = clamp(Math.ceil((hi + 0.6) / 2) * 2, 54, 80);
  return { yMin, yMax, head, headLula, hist, traj, fin, leader: s.forecast.leader };
}

function lerpGeo(a: Geo, b: Geo, t: number): Geo {
  const traj = emptyTraj();
  for (let i = 0; i < traj.length; i++) {
    const va = a.traj[i], vb = b.traj[i];
    traj[i] = Number.isNaN(vb) ? NaN : Number.isNaN(va) ? vb : lerp(va, vb, t);
  }
  return {
    yMin: lerp(a.yMin, b.yMin, t), yMax: lerp(a.yMax, b.yMax, t),
    head: lerp(a.head, b.head, t), headLula: lerp(a.headLula, b.headLula, t),
    hist: b.hist, traj,
    fin: [lerp(a.fin[0], b.fin[0], t), lerp(a.fin[1], b.fin[1], t), lerp(a.fin[2], b.fin[2], t)],
    leader: b.leader,
  };
}

export class Arena {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private labels = el('div', 'arena-labels');
  private tip = el('div', 'tip');
  private img: ImageData | null = null;
  private buf: Uint8ClampedArray = new Uint8ClampedArray(0);
  private lw = 0; private lh = 0; private scale = 2;
  private cssW = 0; private cssH = 0;
  private m = { l: 46, r: 108, t: 14, b: 46 }; // margens em px CSS
  private from: Geo | null = null;
  private to: Geo | null = null;
  private cur: Geo | null = null;
  private t0 = 0;
  private dur = 1100;
  private raf = 0;
  private hoverX: number | null = null;
  private blinkOn = true;
  private state: ForecastState | null = null;
  private labelEls = new Map<string, HTMLElement>();

  constructor(private root: HTMLElement, legend: HTMLElement, private table: HTMLElement) {
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Gráfico da apuração: % dos votos válidos do Lula por % de seções apuradas, com a previsão do restante.');
    root.append(this.canvas, this.labels, this.tip);
    this.buildLegend(legend);
    new ResizeObserver(() => this.resize()).observe(root);
    root.addEventListener('pointermove', (e) => { this.hoverX = e.offsetX; this.request(); });
    root.addEventListener('pointerdown', (e) => { this.hoverX = e.offsetX; this.request(); });
    root.addEventListener('pointerleave', () => { this.hoverX = null; this.tip.classList.remove('on'); this.request(); });
    setInterval(() => { if (!reducedMotion()) { this.blinkOn = !this.blinkOn; this.request(); } }, 500);
    const det = table.closest('details');
    det?.addEventListener('toggle', () => { if (det.open) this.buildTable(); });
    this.resize();
  }

  private buildLegend(lg: HTMLElement): void {
    const sw = (inner: string) => `<svg width="26" height="12" viewBox="0 0 13 6" shape-rendering="crispEdges" aria-hidden="true">${inner}</svg>`;
    const r = (x: number, y: number, w: number, h: number, c: string, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" opacity="${o}"/>`;
    let dith = '';
    for (let x = 0; x < 13; x++) for (let y = 0; y < 6; y++) if ((x + y) % 2 === 0) dith += r(x, y, 1, 1, y < 3 ? '#ff3b47' : '#22d666', 0.7);
    lg.innerHTML = [
      `<span class="lg">${sw(r(0, 1, 4, 2, '#ff3b47') + r(4, 1, 2, 3, '#ff3b47') + r(6, 3, 7, 2, '#22d666'))}Apurado até agora</span>`,
      `<span class="lg">${sw(r(0, 2, 2, 1, '#ff787e') + r(3, 2, 2, 1, '#ff787e') + r(6, 3, 2, 1, '#7cf2a4') + r(9, 3, 2, 1, '#7cf2a4'))}Previsão do resto da apuração</span>`,
      `<span class="lg">${sw(dith)}Faixa de 90% da previsão</span>`,
      `<span class="lg">${sw(r(0, 3, 13, 1, '#c4c0ff', 0.7))}Projeção final, ao longo da noite</span>`,
      `<span class="lg">${sw(r(0, 2, 3, 2, '#ffd400') + r(5, 2, 3, 2, '#ffd400') + r(10, 2, 3, 2, '#ffd400'))}Linha da vitória (50%)</span>`,
    ].join('');
  }

  private resize(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pdev = Math.max(2, Math.round(2 * dpr));
    this.scale = pdev / dpr;
    this.lw = Math.floor(w / this.scale);
    this.lh = Math.floor(h / this.scale);
    this.cssW = this.lw * this.scale;
    this.cssH = this.lh * this.scale;
    const narrow = w < 560;
    this.m = narrow ? { l: 38, r: 84, t: 12, b: 44 } : { l: 46, r: 112, t: 14, b: 46 };
    this.canvas.width = this.lw;
    this.canvas.height = this.lh;
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.img = this.ctx.createImageData(this.lw, this.lh);
    this.buf = this.img.data;
    this.draw();
  }

  update(s: ForecastState): void {
    this.state = s;
    const g = buildGeo(s);
    const prev = this.cur;
    // primeira carga: sem animação de volta
    const restart = !prev || g.head + 5 < prev.head;
    this.from = restart ? g : prev;
    this.to = g;
    this.t0 = performance.now();
    this.dur = reducedMotion() || restart ? 0 : 1100;
    this.request();
    const det = this.table.closest('details');
    if (det?.open) this.buildTable();
  }

  private request(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  // ---------------------------------------------------------------- raster
  private clear(): void { this.buf.fill(0); }
  private px(x: number, y: number, c: RGB, a = 1): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.lw || y >= this.lh) return;
    const i = (y * this.lw + x) * 4;
    const b = this.buf;
    const da = b[i + 3] / 255;
    if (a >= 1 || da === 0) {
      b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2];
      b[i + 3] = a >= 1 ? 255 : Math.round(255 * a);
      return;
    }
    const oa = a + da * (1 - a);
    b[i] = (c[0] * a + b[i] * da * (1 - a)) / oa;
    b[i + 1] = (c[1] * a + b[i + 1] * da * (1 - a)) / oa;
    b[i + 2] = (c[2] * a + b[i + 2] * da * (1 - a)) / oa;
    b[i + 3] = oa * 255;
  }
  private rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }

  // ---------------------------------------------------------------- desenho
  private draw(): void {
    if (!this.img || !this.to) return;
    const now = performance.now();
    const t = this.dur > 0 ? clamp((now - this.t0) / this.dur, 0, 1) : 1;
    const g = this.from && t < 1 ? lerpGeo(this.from, this.to, easeOutCubic(t)) : this.to;
    this.cur = g;
    if (t < 1) this.request();

    const sc = this.scale;
    const L = Math.round(this.m.l / sc), R = this.lw - Math.round(this.m.r / sc);
    const T = Math.round(this.m.t / sc), B = this.lh - Math.round(this.m.b / sc);
    const pw = R - L, ph = B - T;
    if (pw < 20 || ph < 20) return;
    const X = (p: number) => Math.round(L + (clamp(p, 0, 100) / 100) * (pw - 1));
    const Y = (v: number) => Math.round(T + ((g.yMax - v) / (g.yMax - g.yMin)) * (ph - 1));
    const y50 = Y(50);

    this.clear();
    // fundo da arena + territórios
    this.rect(L, T, pw, ph, C.bg);
    for (let y = T; y < B; y++) {
      if (y === y50) continue;
      const above = y < y50;
      const d = Math.abs(y - y50) / (ph / 2);
      const a = 0.05 + 0.07 * d;
      for (let x = L; x < R; x++) this.px(x, y, above ? C.tintL : C.tintF, a);
    }
    // grade
    for (let p = 10; p < 100; p += 10) {
      const x = X(p);
      for (let y = T; y < B; y++) this.px(x, y, C.gridV);
    }
    const step = (g.yMax - g.yMin) / 2 > 12 ? 4 : 2;
    for (let v = Math.ceil(g.yMin / step) * step; v <= g.yMax + 1e-9; v += step) {
      if (Math.abs(v - 50) < 1e-6) continue;
      const y = Y(v);
      for (let x = L; x < R; x++) this.px(x, y, C.grid);
    }

    const sideCol = (y: number, bright = true): RGB => (y < y50 ? (bright ? C.lula : C.lulaL) : y > y50 ? (bright ? C.flav : C.flavL) : C.gold);

    // banda da trajetória (p05–p95), pontilhada (dither Bayer)
    const xh = X(g.head);
    let prevMid: [number, number] | null = null;
    let dot = 0;
    for (let x = xh; x <= X(100); x++) {
      const pct = ((x - L) / (pw - 1)) * 100;
      const v = this.sampleTraj(g, pct);
      if (!v) continue;
      const y95 = Y(v[2]), y05 = Y(v[0]);
      for (let y = Math.max(T, y95); y <= Math.min(B - 1, y05); y++) {
        const th = BAYER[(y & 3) * 4 + (x & 3)];
        if (th < 6) this.px(x, y, sideCol(y, false), 0.55);
      }
      if (y95 >= T && y95 < B) this.px(x, y95, sideCol(y95, false), 0.5);
      if (y05 >= T && y05 < B) this.px(x, y05, sideCol(y05, false), 0.5);
      // mediana pontilhada (linha de Bresenham entre colunas)
      const ym = Y(v[1]);
      if (prevMid) {
        this.line(prevMid[0], prevMid[1], x, ym, (px, py) => {
          if (dot++ % 3 !== 2) { this.px(px, py, sideCol(py, false)); this.px(px, py + 1, sideCol(py, false)); }
        });
      }
      prevMid = [x, ym];
    }

    // linha da vitória (tracejada)
    for (let x = L; x < R; x++) if (x % 6 < 4) { this.px(x, y50, C.gold); }

    // histórico da projeção (fraco)
    const hv = g.hist.filter((h) => h.pct <= g.head + 1e-6);
    if (hv.length) {
      let px0 = X(hv[0].pct);
      let py0 = Y(hv[0].proj);
      for (let i = 1; i <= hv.length; i++) {
        const nx = i < hv.length ? X(hv[i].pct) : xh;
        for (let x = px0; x <= nx; x++) this.px(x, py0, C.proj, 0.55);
        if (i < hv.length) {
          const ny = Y(hv[i].proj);
          for (let y = Math.min(py0, ny); y <= Math.max(py0, ny); y++) this.px(nx, y, C.proj, 0.55);
          px0 = nx; py0 = ny;
        }
      }
    }

    // histórico apurado: linha em degraus, 2px, com sombra
    if (hv.length) {
      const pts: [number, number][] = hv.map((h) => [X(h.pct), Y(clamp(h.lula, g.yMin, g.yMax))]);
      // ponta interpolada até a cabeça animada
      const last = pts[pts.length - 1];
      if (last[0] < xh) pts.push([xh, Y(clamp(g.headLula, g.yMin, g.yMax))]);
      const plot = (fn: (x: number, y: number) => void) => {
        for (let i = 0; i < pts.length; i++) {
          const [x0, y0] = pts[i];
          if (i === 0) { fn(x0, y0); continue; }
          const [xp, yp] = pts[i - 1];
          for (let x = xp; x <= x0; x++) fn(x, yp);
          for (let y = Math.min(yp, y0); y <= Math.max(yp, y0); y++) fn(x0, y);
        }
      };
      plot((x, y) => { this.px(x + 1, y + 1, C.shadow); this.px(x + 1, y + 2, C.shadow); this.px(x + 2, y + 2, C.shadow); });
      plot((x, y) => {
        const c = sideCol(y);
        this.px(x, y, c); this.px(x + 1, y, c); this.px(x, y + 1, c); this.px(x + 1, y + 1, c);
      });
    }

    // marcador "agora"
    if (hv.length && g.head < 99.99) {
      const hx = xh, hy = Y(clamp(g.headLula, g.yMin, g.yMax));
      const c = sideCol(hy);
      this.rect(hx - 2, hy - 2, 6, 6, C.shadow);
      this.rect(hx - 1, hy - 1, 4, 4, this.blinkOn ? C.ink : c);
      this.rect(hx, hy, 2, 2, c);
    }

    // marcador da previsão final em x=100
    {
      const fx = X(100) + Math.max(4, Math.round(10 / sc));
      const [a, m, b] = g.fin;
      if (Number.isFinite(m)) {
        const yA = clamp(Y(b), T, B - 1), yB = clamp(Y(a), T, B - 1), yM = clamp(Y(m), T, B - 1);
        this.rect(fx - 1, yA, 3, yB - yA + 1, C.shadow);
        this.rect(fx, yA, 1, yB - yA + 1, C.ink);
        this.rect(fx - 3, yA, 7, 1, C.ink);
        this.rect(fx - 3, yB, 7, 1, C.ink);
        const c = m >= 50 ? C.lula : C.flav;
        for (let dy = -4; dy <= 4; dy++) {
          const w = 4 - Math.abs(dy);
          for (let dx = -w - 1; dx <= w + 1; dx++) this.px(fx + dx, yM + dy, C.shadow);
        }
        for (let dy = -3; dy <= 3; dy++) {
          const w = 3 - Math.abs(dy);
          for (let dx = -w; dx <= w; dx++) this.px(fx + dx, yM + dy, dy < 0 && dx <= 0 ? (m >= 50 ? C.lulaL : C.flavL) : c);
        }
      }
    }

    // mira (hover)
    let hoverInfo: { pct: number; kind: 'hist' | 'fut'; h?: HistP; v?: [number, number, number] } | null = null;
    if (this.hoverX != null) {
      const lx = Math.round(this.hoverX / sc);
      if (lx >= L - 4 && lx <= X(100) + 6) {
        const pct = clamp(((lx - L) / (pw - 1)) * 100, 0, 100);
        if (pct <= g.head && hv.length) {
          let best = hv[0];
          for (const h of hv) if (Math.abs(h.pct - pct) < Math.abs(best.pct - pct)) best = h;
          hoverInfo = { pct: best.pct, kind: 'hist', h: best };
        } else {
          const v = this.sampleTraj(g, pct);
          if (v) hoverInfo = { pct, kind: 'fut', v };
        }
        if (hoverInfo) {
          const cx = X(hoverInfo.pct);
          for (let y = T; y < B; y++) if (y % 2 === 0) this.px(cx, y, C.ink, 0.45);
          const vy = hoverInfo.kind === 'hist' ? Y(hoverInfo.h!.lula) : Y(hoverInfo.v![1]);
          this.rect(cx - 2, vy - 2, 5, 5, C.shadow);
          this.rect(cx - 1, vy - 1, 3, 3, C.ink);
        }
      }
    }

    this.ctx.putImageData(this.img, 0, 0);
    this.placeLabels(g, X, Y, L, R, T, B);
    this.placeTip(hoverInfo, X, Y, T, B);
  }

  private sampleTraj(g: Geo, pct: number): [number, number, number] | null {
    const f = (pct / 100) * (GRID_N - 1);
    const i0 = Math.floor(f), i1 = Math.min(GRID_N - 1, i0 + 1);
    const u = f - i0;
    const a0 = g.traj[i0 * 3], a1 = g.traj[i1 * 3];
    if (Number.isNaN(a0) && Number.isNaN(a1)) return null;
    const pick = (k: number) => {
      const v0 = g.traj[i0 * 3 + k], v1 = g.traj[i1 * 3 + k];
      return Number.isNaN(v0) ? v1 : Number.isNaN(v1) ? v0 : lerp(v0, v1, u);
    };
    return [pick(0), pick(1), pick(2)];
  }

  private line(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let first = true;
    for (;;) {
      if (!first) fn(x0, y0);
      first = false;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---------------------------------------------------------------- rótulos DOM
  private lbl(key: string, cls: string, html?: string): HTMLElement {
    let e = this.labelEls.get(key);
    if (!e) {
      e = el('div', cls);
      this.labels.appendChild(e);
      this.labelEls.set(key, e);
    }
    if (html != null && e.dataset.h !== html) { e.innerHTML = html; e.dataset.h = html; }
    e.dataset.live = '1';
    return e;
  }

  private placeLabels(g: Geo, X: (p: number) => number, Y: (v: number) => number, L: number, R: number, T: number, B: number): void {
    const sc = this.scale;
    for (const e of this.labelEls.values()) e.dataset.live = '';
    const step = (g.yMax - g.yMin) / 2 > 12 ? 4 : 2;
    for (let v = Math.ceil(g.yMin / step) * step; v <= g.yMax + 1e-9; v += step) {
      const e = this.lbl(`y${v}`, `ax y${v === 50 ? ' y50' : ''}`, `${v}%`);
      e.style.left = '0px';
      e.style.width = `${L * sc - 8}px`;
      e.style.top = `${(Y(v) + 0.5) * sc}px`;
    }
    for (let p = 0; p <= 100; p += 20) {
      const e = this.lbl(`x${p}`, 'ax x', `${p}%`);
      e.style.left = `${(X(p) + 0.5) * sc}px`;
      e.style.top = `${B * sc + 8}px`;
    }
    const xt = this.lbl('xt', 'ax-title', '% DAS SEÇÕES TOTALIZADAS');
    xt.style.left = `${L * sc}px`;
    xt.style.top = `${B * sc + 30}px`;
    const narrow = this.cssW < 560;
    const zl = this.lbl('zl', 'zone l', `${iconSvg('star', '#ff6b72', 10)}${narrow ? 'LULA NA FRENTE' : 'ZONA LULA: LULA NA FRENTE'}`);
    zl.style.left = `${L * sc + 10}px`;
    zl.style.top = `${T * sc + 10}px`;
    const zf = this.lbl('zf', 'zone f', `${iconSvg('diamond', '#7cf2a4', 10)}${narrow ? 'FLÁVIO NA FRENTE' : 'ZONA FLÁVIO: FLÁVIO NA FRENTE'}`);
    zf.style.left = `${L * sc + 10}px`;
    zf.style.top = `${B * sc - 22}px`;
    const vl = this.lbl('vl', 'vline-label', 'LINHA DA VITÓRIA');
    vl.style.left = `${L * sc + 10}px`;
    vl.style.top = `${Y(50) * sc - 18}px`;
    // previsão final
    const [a, m, b] = g.fin;
    if (Number.isFinite(m)) {
      const fl = this.lbl('fin', 'final-label',
        `<span class="fl-t">${narrow ? 'FINAL' : 'PREVISÃO<br>FINAL'}</span><span class="fl-v">${fmtNum(m, 1)}%</span><span class="fl-r">${fmtNum(a, 1)}–${fmtNum(b, 1)}</span>`);
      const fx = (X(100) + Math.max(4, Math.round(10 / sc))) * sc;
      fl.style.left = `${fx + 14}px`;
      const h = fl.offsetHeight || 60;
      const top = clamp(Y(m) * sc - h / 2, T * sc, B * sc - h);
      fl.style.top = `${top}px`;
      fl.style.maxWidth = `${this.cssW - fx - 16}px`;
    }
    for (const [k, e] of this.labelEls) if (!e.dataset.live) { e.remove(); this.labelEls.delete(k); }
    void R;
  }

  private placeTip(info: { pct: number; kind: 'hist' | 'fut'; h?: HistP; v?: [number, number, number] } | null, X: (p: number) => number, Y: (v: number) => number, T: number, B: number): void {
    if (!info) { this.tip.classList.remove('on'); return; }
    const sc = this.scale;
    const row = (c: string, val: string, lab: string) => `<div class="tip-r"><i style="background:${c}"></i><b>${val}</b><span>${lab}</span></div>`;
    let html = '';
    if (info.kind === 'hist' && info.h) {
      const h = info.h;
      html = `<div class="tip-h">${fmtNum(h.pct, 1)}% APURADO · ${timeHM(h.t)}</div>`
        + row('#ff3b47', fmtPct(h.lula, 2), 'Lula')
        + row('#22d666', fmtPct(100 - h.lula, 2), 'Flávio')
        + row('#c4c0ff', `${fmtNum(h.proj, 1)}% <span>(${fmtNum(h.lo, 1)}–${fmtNum(h.hi, 1)})</span>`, 'proj. Lula')
        + row('#ffd400', fmtProb(h.win), 'chance Lula');
    } else if (info.v) {
      const v = info.v;
      html = `<div class="tip-h">PREVISÃO EM ${fmtNum(info.pct, 0)}% APURADO</div>`
        + row('#ff787e', `${fmtNum(v[1], 1)}% <span>(${fmtNum(v[0], 1)}–${fmtNum(v[2], 1)})</span>`, 'Lula')
        + row('#7cf2a4', fmtPct(100 - v[1], 1), 'Flávio');
    }
    if (this.tip.dataset.h !== html) { this.tip.innerHTML = html; this.tip.dataset.h = html; }
    this.tip.classList.add('on');
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    const cx = X(info.pct) * sc;
    const vy = info.kind === 'hist' && info.h ? Y(info.h.lula) * sc : info.v ? Y(info.v[1]) * sc : T * sc;
    let left = cx + 16;
    if (left + tw > this.cssW - 4) left = cx - tw - 16;
    let top = vy - th - 14;
    if (top < T * sc) top = vy + 16;
    top = clamp(top, 0, B * sc - th);
    this.tip.style.left = `${Math.max(0, left)}px`;
    this.tip.style.top = `${top}px`;
  }

  private buildTable(): void {
    const s = this.state;
    if (!s) return;
    const rows = [...(s.history ?? [])].sort((a, b) => b.pct - a.pct);
    const pick = rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 40)) === 0);
    const tb = document.createElement('table');
    tb.innerHTML = '<thead><tr><th>HORA</th><th>% APURADO</th><th>LULA</th><th>FLÁVIO</th><th>PROJ. LULA</th><th>CHANCE LULA</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const h of pick) {
      const tr = document.createElement('tr');
      for (const v of [timeHM(h.t), fmtPct(h.pct, 1), fmtPct(h.lulaPct, 2), fmtPct(100 - h.lulaPct, 2), `${fmtPct(h.projLulaPct, 1)} (${fmtNum(h.projLo, 1)}–${fmtNum(h.projHi, 1)})`, fmtProb(h.winProbLula)]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    tb.appendChild(body);
    this.table.replaceChildren(tb);
  }
}
