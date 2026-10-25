// Efeitos: céu noturno pixelado, confete de vitória e splash "ROUND 1 — FIGHT!".
import { reducedMotion } from './format';

// ---------------------------------------------------------------- céu
export function startSky(cv: HTMLCanvasElement): void {
  const ctx = cv.getContext('2d')!;
  const P = 4; // px CSS por pixel lógico
  let w = 0, h = 0;
  let stars: { x: number; y: number; b: number; tw: number }[] = [];
  const build = () => {
    w = Math.ceil(innerWidth / P);
    h = Math.ceil(innerHeight / P);
    cv.width = w;
    cv.height = h;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    stars = Array.from({ length: Math.round((w * h) / 90) }, () => ({ x: Math.floor(rnd() * w), y: Math.floor(rnd() * h * 0.85), b: rnd(), tw: rnd() * 6.28 }));
    paint(0);
  };
  const bands = ['#05061a', '#070823', '#090b2c', '#0c0e35', '#10123e', '#141646'];
  const paint = (t: number) => {
    // degradê em faixas com dither entre faixas
    const bh = h / bands.length;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, Math.floor(i * bh), w, Math.ceil(bh) + 1);
      if (i > 0) {
        ctx.fillStyle = bands[i - 1];
        const y0 = Math.floor(i * bh);
        for (let y = y0; y < y0 + 2; y++) for (let x = (y & 1); x < w; x += 2) ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const s of stars) {
      const tw = reducedMotion() ? 1 : 0.55 + 0.45 * Math.sin(t / 900 + s.tw);
      const a = (0.25 + 0.75 * s.b) * tw;
      ctx.fillStyle = s.b > 0.93 ? `rgba(255,212,0,${a})` : `rgba(220,220,255,${a})`;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.b > 0.985) {
        ctx.fillStyle = `rgba(220,220,255,${a * 0.5})`;
        ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1); ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
  };
  build();
  addEventListener('resize', () => build());
  if (!reducedMotion()) {
    let lastT = 0;
    const loop = (t: number) => {
      if (t - lastT > 120) { paint(t); lastT = t; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ---------------------------------------------------------------- confete
export function confetti(layer: HTMLElement, colors: string[], ms = 4200): void {
  if (reducedMotion()) return;
  const cv = document.createElement('canvas');
  const P = 4;
  const w = Math.ceil(innerWidth / P), h = Math.ceil(innerHeight / P);
  cv.width = w;
  cv.height = h;
  layer.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  const parts = Array.from({ length: 220 }, () => ({
    x: Math.random() * w, y: -Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.9,
    c: colors[Math.floor(Math.random() * colors.length)], s: Math.random() < 0.2 ? 2 : 1, ph: Math.random() * 6.28,
  }));
  const t0 = performance.now();
  const loop = (t: number) => {
    const el = t - t0;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx + Math.sin(el / 300 + p.ph) * 0.25;
      p.y += p.vy;
      ctx.globalAlpha = el > ms - 800 ? Math.max(0, (ms - el) / 800) : 1;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, Math.sin(el / 120 + p.ph) > 0 ? p.s : 1);
    }
    if (el < ms) requestAnimationFrame(loop);
    else cv.remove();
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- splash
export function roundSplash(top: string, big: string): void {
  if (reducedMotion()) return;
  const d = document.createElement('div');
  d.className = 'round-splash';
  const a = document.createElement('div'); a.className = 'r1'; a.textContent = top;
  const b = document.createElement('div'); b.className = 'r2'; b.textContent = big;
  d.append(a, b);
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}
