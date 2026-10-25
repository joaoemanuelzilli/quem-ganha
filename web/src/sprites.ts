// Sprites em pixel art desenhados em código (sem imagens externas).
// Retratos 32x32 gerados por formas implícitas + contorno automático.
import type { CandKey } from '../../engine/types';

export type Face = 'idle' | 'blink' | 'win';

const W = 32;
const H = 32;
const OUTLINE = '#140c1c';

type Grid = (string | null)[][];

function blank(): Grid {
  return Array.from({ length: H }, () => Array<string | null>(W).fill(null));
}

const inEll = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

function outline(g: Grid): Grid {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (g[y][x]) continue;
      const n = [g[y - 1]?.[x], g[y + 1]?.[x], g[y]?.[x - 1], g[y]?.[x + 1]];
      if (n.some((c) => c && c !== OUTLINE)) out[y][x] = OUTLINE;
    }
  return out;
}

interface Pal {
  skin: string; skinSh: string; skinHi: string;
  hair: string; hairSh: string; hairHi: string;
  shirt: string; shirtSh: string; shirtHi: string;
  accent: string; mouth: string; eye: string;
}

const PAL: Record<CandKey, Pal> = {
  lula: {
    skin: '#e7ad7e', skinSh: '#bf7f55', skinHi: '#f6cda1',
    hair: '#eeeef6', hairSh: '#a9a9c2', hairHi: '#ffffff',
    shirt: '#e8222e', shirtSh: '#9c1520', shirtHi: '#ff5a62',
    accent: '#ffd400', mouth: '#6e2430', eye: '#1c1428',
  },
  flavio: {
    skin: '#eab48a', skinSh: '#c38660', skinHi: '#f8d3ad',
    hair: '#3a2618', hairSh: '#24170f', hairHi: '#5b3c26',
    shirt: '#19c35a', shirtSh: '#0d7a37', shirtHi: '#5ce68e',
    accent: '#ffd400', mouth: '#7a3036', eye: '#1c1428',
  },
};

function portraitGrid(who: CandKey, face: Face): Grid {
  const p = PAL[who];
  const g = blank();
  const cx = 16;
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
  };

  // corpo / ombros
  for (let y = 22; y < H; y++)
    for (let x = 0; x < W; x++) {
      const half = Math.min(14.5, 5 + (y - 22) * 2.2);
      if (Math.abs(x + 0.5 - cx) <= half) {
        const edge = x + 0.5 - cx;
        set(x, y, edge > half - 2.5 ? p.shirtSh : edge < -half + 2 ? p.shirtHi : p.shirt);
      }
    }
  // pescoço
  for (let y = 18; y < 24; y++) for (let x = cx - 3; x < cx + 3; x++) set(x, y, x >= cx + 1 ? p.skinSh : p.skin);
  // gola
  if (who === 'lula') {
    for (let i = 0; i < 4; i++) { set(cx - 4 + i, 22 + i, '#f2eee8'); set(cx + 3 - i, 22 + i, '#f2eee8'); }
  } else {
    for (let i = 0; i < 5; i++) { set(cx - 5 + i, 22 + i, p.accent); set(cx + 4 - i, 22 + i, p.accent); }
    for (let i = 0; i < 4; i++) { set(cx - 4 + i, 22 + i, '#fff3a3'); }
  }
  // orelhas
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inEll(x, y, cx - 7.6, 13.5, 1.6, 2.4) || inEll(x, y, cx + 7.6, 13.5, 1.6, 2.4)) set(x, y, p.skinSh);
  }
  // cabeça
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inEll(x, y, cx, 12.5, 7.2, 8.6)) {
      const dx = x + 0.5 - cx;
      set(x, y, dx > 4.6 ? p.skinSh : dx < -4.2 && y < 13 ? p.skinHi : p.skin);
    }
  }
  // cabelo
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx;
    if (who === 'lula') {
      const cap = inEll(x, y, cx, 10.2, 8.4, 8.2) && y < 7 - Math.abs(dx) * 0.12;
      const side = inEll(x, y, cx, 11.5, 8.3, 7.5) && Math.abs(dx) > 6.2 && y < 13;
      if (cap || side) set(x, y, (x + y) % 5 === 0 ? p.hairSh : dx > 5 ? p.hairSh : p.hair);
    } else {
      const cap = inEll(x, y, cx, 10.8, 8.1, 8.6) && y < 7.6 - Math.abs(dx) * 0.08;
      const side = inEll(x, y, cx, 11.5, 7.9, 7.8) && Math.abs(dx) > 6.4 && y < 11;
      const fringe = y === 7 && dx > -6 && dx < 2;
      if (cap || side || fringe) set(x, y, dx < -3 && y < 5 ? p.hairHi : dx > 5 ? p.hairSh : p.hair);
    }
  }
  // sobrancelhas
  const brow = who === 'lula' ? p.hairSh : p.hair;
  for (let x = cx - 5; x <= cx - 2; x++) set(x, 10, brow);
  for (let x = cx + 1; x <= cx + 4; x++) set(x, 10, brow);
  // olhos
  if (face === 'idle') {
    for (const ex of [cx - 4, cx + 2]) { set(ex + 1, 12, p.eye); set(ex + 1, 13, p.eye); set(ex, 12, '#ffffff'); set(ex, 13, '#ffffff'); }
  } else if (face === 'blink') {
    for (const ex of [cx - 4, cx + 2]) { set(ex, 13, p.eye); set(ex + 1, 13, p.eye); }
  } else {
    for (const ex of [cx - 4, cx + 2]) { set(ex, 13, p.eye); set(ex + 1, 12, p.eye); set(ex + 2, 13, p.eye); }
  }
  // nariz
  set(cx - 1, 14, p.skinSh); set(cx - 1, 15, p.skinSh); set(cx, 15, p.skinSh);

  if (who === 'lula') {
    // barba e bigode brancos
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const inBeard = inEll(x, y, cx, 13.2, 7.7, 9.4) && (y >= 16 || (Math.abs(dx) > 5.6 && y >= 13));
      if (inBeard) set(x, y, (x * 3 + y) % 4 === 0 ? p.hairSh : dx > 4.5 ? p.hairSh : p.hair);
    }
    for (let x = cx - 4; x < cx + 4; x++) set(x, 16, p.hair);
    // boca sorrindo dentro da barba
    const my = face === 'win' ? 18 : 18;
    for (let x = cx - 2; x < cx + 2; x++) set(x, my, p.mouth);
    if (face === 'win') { for (let x = cx - 2; x < cx + 2; x++) set(x, my + 1, p.mouth); set(cx - 1, my, '#ffffff'); set(cx, my, '#ffffff'); }
    set(cx - 3, my - 1, p.mouth); set(cx + 2, my - 1, p.mouth);
    // estrelinha no peito
    const sx = 9, sy = 27;
    set(sx, sy - 1, p.accent); set(sx - 1, sy, p.accent); set(sx, sy, p.accent); set(sx + 1, sy, p.accent);
    set(sx - 1, sy + 1, p.accent); set(sx + 1, sy + 1, p.accent);
  } else {
    // queixo barbeado com sombra leve
    for (let x = cx - 3; x < cx + 3; x++) set(x, 20, p.skinSh);
    const my = 17;
    for (let x = cx - 2; x < cx + 2; x++) set(x, my, p.mouth);
    set(cx - 3, my - 1, p.mouth); set(cx + 2, my - 1, p.mouth);
    if (face === 'win') { for (let x = cx - 2; x < cx + 2; x++) set(x, my + 1, p.mouth); set(cx - 1, my, '#ffffff'); set(cx, my, '#ffffff'); }
    // detalhe amarelo/azul no peito (faixa)
    for (let x = 6; x < 11; x++) set(x, 28, p.accent);
    for (let x = 7; x < 10; x++) set(x, 29, '#2f5bd9');
  }
  return outline(g);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas 32x32 (1px = 1 pixel lógico). Escale com CSS + image-rendering: pixelated. */
export function portraitCanvas(who: CandKey, face: Face = 'idle'): HTMLCanvasElement {
  const key = `${who}:${face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g = portraitGrid(who, face);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const col = g[y][x];
    if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }
  cache.set(key, c);
  return c;
}

/** Desenha o retrato num canvas de destino (escala inteira, sem suavização). */
export function drawPortrait(target: HTMLCanvasElement, who: CandKey, face: Face, mirror = false): void {
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  const src = portraitCanvas(who, face);
  ctx.save();
  if (mirror) { ctx.translate(target.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, 0, 0, target.width, target.height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ícones minúsculos (matrizes 7x7) → SVG inline nítido.

const ICONS: Record<string, string[]> = {
  info: ['..###..', '..###..', '.......', '.####..', '..###..', '..###..', '.#####.'],
  lead: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '##...##'],
  call: ['#######', '#######', '.#####.', '..###..', '...#...', '..###..', '.#####.'],
  state: ['##.....', '#####..', '#######', '#####..', '##.....', '#......', '#......'],
  milestone: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  swing: ['..#....', '.######', '..#....', '.......', '....#..', '######.', '....#..'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  diamond: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  coin: ['..###..', '.#...#.', '#..#..#', '#..#..#', '#..#..#', '.#...#.', '..###..'],
  clock: ['.#####.', '#..#..#', '#..#..#', '#..###.', '#.....#', '#.....#', '.#####.'],
  speaker: ['...#...', '..##...', '####.#.', '####..#', '####.#.', '..##...', '...#...'],
  mute: ['...#...', '..##...', '####...', '####.#.', '####...', '..##...', '...#...'],
  warn: ['...#...', '..###..', '..#.#..', '.##.##.', '.#####.', '###.###', '#######'],
};

export function iconSvg(name: keyof typeof ICONS | string, color = 'currentColor', size = 14): string {
  const m = ICONS[name] ?? ICONS.info;
  let rects = '';
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  });
  return `<svg class="pxi" viewBox="0 0 7 7" width="${size}" height="${size}" shape-rendering="crispEdges" fill="${color}" aria-hidden="true">${rects}</svg>`;
}

/** Ícones 10x10 dos "golpes" (métodos). */
const MOVE_ICONS: string[][] = [
  // espada
  ['........##', '.......#y#', '......#y#.', '.....#y#..', '#...#y#...', '.#.#y#....', '..##y.....', '..###.....', '.#..##....', '#.........'],
  // escudo
  ['.########.', '#yyyy#yyy#', '#yyyy#yyy#', '#yyyy#yyy#', '##########', '#yyy#yyyy#', '.#yy#yyy#.', '..#y#yy#..', '...##y#...', '....##....'],
  // bola de cristal
  ['...####...', '..#yy..#..', '.#y.....#.', '.#y.....#.', '.#......#.', '..#....#..', '...####...', '..######..', '.########.', '..........'],
  // raio
  ['.....###..', '....##y...', '...##y....', '..##yyy#..', '.#####y#..', '....##y...', '...##y....', '..##y.....', '.##y......', '.#........'],
  // olho/coruja
  ['..........', '.###..###.', '#yyy##yyy#', '#y#y##y#y#', '#yyy##yyy#', '.###..###.', '....##....', '...#..#...', '..........', '..........'],
  // coroa (ensemble)
  ['..........', '#...#...#.', '##.###.##.', '#########.', '#y#y#y#y#.', '#########.', '#########.', '..........', '..........', '..........'],
  // gráfico de barras (pesquisas)
  ['..........', '.......##.', '.......##.', '....##.##.', '....##.##.', '.##.##.##.', '.##.##.##.', '.##.##.##.', '##########', '..........'],
  // montanha (Minas)
  ['..........', '....#.....', '...#y#....', '..#yyy#.#.', '..#...##y#', '.#.....#.#', '#.........', '##########', '..........', '..........'],
  // sol (Nordeste)
  ['....#.....', '.#..#..#..', '..#####...', '..#yyy#...', '###yyy###.', '..#yyy#...', '..#####...', '.#..#..#..', '....#.....', '..........'],
  // mapa com pino (por UF)
  ['...###....', '..#yyy#...', '..#yyy#...', '...#y#....', '....#.....', '#.#.#.#.#.', '.#.#.#.#.#', '#.#.#.#.#.', '..........', '..........'],
];

/** Ícone de golpe por id de método. */
export function moveIndexFor(id: string, fallback: number): number {
  const map: Record<string, number> = {
    bayes: 2, 'bayes-uf': 9, uniform: 1, ufextrap: 3, naive: 0, polls: 6, minas: 7, nordeste: 8, ensemble: 5,
  };
  return map[id] ?? fallback % 5;
}

export function moveIconSvg(i: number, color: string, hi = '#ffd400', size = 30): string {
  const m = MOVE_ICONS[((i % MOVE_ICONS.length) + MOVE_ICONS.length) % MOVE_ICONS.length];
  let rects = '';
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      else if (c === 'y') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hi}"/>`;
    }
  });
  return `<svg class="pxi" viewBox="0 0 10 10" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export const CROWN_INDEX = 5;
