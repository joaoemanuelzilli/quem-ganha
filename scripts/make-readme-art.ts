// Gera a arte pixelada do README (docs/img/*.svg): banner, títulos de fase e
// o gráfico de "HIGH SCORES" do backtest. Fonte bitmap 5×7 própria.
//
//   npx tsx scripts/make-readme-art.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = `${ROOT}docs/img/`;
mkdirSync(OUT, { recursive: true });

// ── fonte 5×7 (linhas de 5 bits) ──
const F: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'], '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'], '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'], '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'], '<': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'], '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '#': ['01010', '11111', '01010', '01010', '01010', '11111', '01010'], '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'], ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  'º': ['01110', '01010', '01110', '00000', '11111', '00000', '00000'],
};
const ACC: Record<string, [string, 'acute' | 'tilde' | 'circ' | 'ced']> = { Á: ['A', 'acute'], É: ['E', 'acute'], Í: ['I', 'acute'], Ó: ['O', 'acute'], Ú: ['U', 'acute'], Ã: ['A', 'tilde'], Õ: ['O', 'tilde'], Â: ['A', 'circ'], Ê: ['E', 'circ'], Ô: ['O', 'circ'], Ç: ['C', 'ced'] };

function textRects(text: string, x0: number, y0: number, px: number, fill: string, extra = ''): { svg: string; w: number } {
  let x = x0; const parts: string[] = [];
  for (const ch0 of text.toUpperCase()) {
    let ch = ch0; let acc: string | null = null;
    if (ACC[ch0]) { ch = ACC[ch0][0]; acc = ACC[ch0][1]; }
    const g = F[ch] ?? F['?'];
    g.forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') parts.push(`<rect x="${x + c * px}" y="${y0 + r * px}" width="${px}" height="${px}"/>`); }));
    if (acc === 'acute') parts.push(`<rect x="${x + 2 * px}" y="${y0 - 2 * px}" width="${px}" height="${px}"/><rect x="${x + 3 * px}" y="${y0 - 3 * px}" width="${px}" height="${px}"/>`);
    if (acc === 'tilde') parts.push(`<rect x="${x + px}" y="${y0 - 2 * px}" width="${px}" height="${px}"/><rect x="${x + 2 * px}" y="${y0 - 3 * px}" width="${px}" height="${px}"/><rect x="${x + 3 * px}" y="${y0 - 2 * px}" width="${px}" height="${px}"/><rect x="${x + 4 * px}" y="${y0 - 3 * px}" width="${px}" height="${px}"/>`);
    if (acc === 'circ') parts.push(`<rect x="${x + 1 * px}" y="${y0 - 2 * px}" width="${px}" height="${px}"/><rect x="${x + 2 * px}" y="${y0 - 3 * px}" width="${px}" height="${px}"/><rect x="${x + 3 * px}" y="${y0 - 2 * px}" width="${px}" height="${px}"/>`);
    if (acc === 'ced') parts.push(`<rect x="${x + 2 * px}" y="${y0 + 7 * px}" width="${px}" height="${px}"/><rect x="${x + 1 * px}" y="${y0 + 8 * px}" width="${px * 2}" height="${px}"/>`);
    x += 6 * px;
  }
  return { svg: `<g fill="${fill}" ${extra}>${parts.join('')}</g>`, w: x - x0 - px };
}
const textW = (t: string, px: number) => [...t].length * 6 * px - px;

// ── sprites dos lutadores (16×16), paleta indexada ──
const LULA = [
  '................', '.....wwwwww.....', '....wwwwwwww....', '...wwssssssww...', '...wsskssksw....', '...wssssssssw...',
  '...wwsssssww....', '....wwwwwwww....', '.....wwwwww.....', '...rrrrryrrrr...', '..rrrryyyyyrrr..', '..rrrrryyyrrrr..',
  '..ss.rryryrr.ss.', '.....rr..rr.....', '.....dd..dd.....', '....ddd..ddd....',
];
const FLAVIO = [
  '................', '.....kkkkkk.....', '....kkkkkkkk....', '....kssssssk....', '....skssskss....', '....ssssssss....',
  '.....ssmmss.....', '......ssss......', '.....gggggg.....', '...ggggyygggg...', '..gggggyygggggg.', '..gggggggggggg..',
  '..ss.gggggg.ss..', '.....bb..bb.....', '.....kk..kk.....', '....kkk..kkk....',
];
const PAL: Record<string, string> = { w: '#e8e8e8', s: '#f0b48a', k: '#2a1d14', r: '#e8222e', y: '#ffd400', g: '#19c35a', d: '#3a2a2a', b: '#1d3fbf', m: '#b5523b' };
function sprite(rows: string[], x0: number, y0: number, px: number, flip = false): string {
  const out: string[] = [];
  rows.forEach((row, r) => [...row].forEach((ch, c0) => {
    const c = flip ? row.length - 1 - c0 : c0;
    if (PAL[ch]) out.push(`<rect x="${x0 + c * px}" y="${y0 + r * px}" width="${px}" height="${px}" fill="${PAL[ch]}"/>`);
  }));
  return out.join('');
}

const STYLE = `<style>
  .blink{animation:b 1.1s steps(1) infinite} @keyframes b{50%{opacity:0}}
  .bob{animation:bob 1.6s steps(2) infinite} @keyframes bob{50%{transform:translateY(4px)}}
  .scan{opacity:.10}
</style>`;
const scanlines = (w: number, h: number) => `<g class="scan">${Array.from({ length: Math.ceil(h / 4) }, (_, i) => `<rect x="0" y="${i * 4}" width="${w}" height="1" fill="#000"/>`).join('')}</g>`;
const stars = (w: number, h: number, n: number, seed = 7) => { let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280); return Array.from({ length: n }, () => `<rect x="${Math.floor(r() * w / 4) * 4}" y="${Math.floor(r() * h / 4) * 4}" width="4" height="4" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`).join(''); };

// ── BANNER ──
function banner() {
  const W = 1200, H = 420;
  const t1 = 'QUEM GANHA?', t2 = 'BRASIL 2026 - 2º TURNO';
  const px1 = 12, px2 = 4;
  const a = textRects(t1, (W - textW(t1, px1)) / 2, 50, px1, '#ffd400');
  const shadow = textRects(t1, (W - textW(t1, px1)) / 2 + 6, 56, px1, '#7a3b00');
  const b = textRects(t2, (W - textW(t2, px2)) / 2, 160, px2, '#ffffff');
  const vs = textRects('VS', (W - textW('VS', 10)) / 2, 240, 10, '#ffffff');
  const vsS = textRects('VS', (W - textW('VS', 10)) / 2 + 5, 245, 10, '#e8222e');
  const p1 = textRects('P1 LULA', 70, 360, 5, '#ff5a63');
  const p2 = textRects('P2 FLÁVIO', W - 70 - textW('P2 FLAVIO', 5), 360, 5, '#3ee07f');
  const coin = textRects('PRESS START', (W - textW('PRESS START', 4)) / 2, 372, 4, '#ffffff', 'class="blink"');
  // barras de HP
  const hp = (x: number, w: number, color: string, dir: 1 | -1) => {
    const seg = Array.from({ length: 12 }, (_, i) => `<rect x="${dir === 1 ? x + i * (w / 12) : x + w - (i + 1) * (w / 12)}" y="20" width="${w / 12 - 4}" height="16" fill="${color}"/>`).join('');
    return `<rect x="${x - 4}" y="16" width="${w + 4}" height="24" fill="#111" stroke="#fff" stroke-width="2"/>${seg}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${STYLE}
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b2b"/><stop offset=".6" stop-color="#241046"/><stop offset="1" stop-color="#3a0d2e"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(W, 300, 70)}
  <rect x="0" y="${H - 70}" width="${W}" height="70" fill="#1a0f24"/>${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 40}" y="${H - 70}" width="20" height="8" fill="#2c1a3c"/>`).join('')}
  <rect x="0" y="0" width="${W / 2}" height="${H}" fill="#e8222e" opacity=".07"/><rect x="${W / 2}" y="0" width="${W / 2}" height="${H}" fill="#19c35a" opacity=".07"/>
  ${hp(60, 420, '#e8222e', -1)}${hp(W - 480, 420, '#19c35a', 1)}
  ${shadow.svg}${a.svg}${b.svg}
  <g class="bob">${sprite(LULA, 150, 150, 11)}</g><g class="bob" style="animation-delay:.8s">${sprite(FLAVIO, W - 150 - 16 * 11, 150, 11, true)}</g>
  ${vsS.svg}${vs.svg}${p1.svg}${p2.svg}${coin.svg}
  ${scanlines(W, H)}</svg>`;
}

// ── títulos de fase ──
function stage(file: string, label: string, title: string, color: string) {
  const W = 1200, H = 100, px = 5;
  const l = textRects(label, 24, 14, 3, '#ffd400');
  const t = textRects(title, 24, 52, px, '#ffffff');
  writeFileSync(`${OUT}${file}`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${STYLE}
  <rect width="${W}" height="${H}" fill="#0e0b22"/><rect x="0" y="0" width="12" height="${H}" fill="${color}"/><rect x="12" y="${H - 6}" width="${W}" height="6" fill="${color}" opacity=".6"/>
  ${stars(W, H, 18, file.length)}${l.svg}${t.svg}<g class="blink">${textRects('>', W - 50, 40, 5, color).svg}</g>${scanlines(W, H)}</svg>`);
}

// ── high scores: MAE por % apurado (backtest) ──
function scores() {
  const p = `${ROOT}data/model/backtest.json`;
  if (!existsSync(p)) return;
  const bt = JSON.parse(readFileSync(p, 'utf8'));
  const sum: { cp: number; maeBayes: number; maeUniform: number; maeUF: number; maeNaive: number }[] = bt.municipio.summary;
  const W = 1200, H = 470, L = 90, B = 390, T = 70, maxY = Math.ceil(Math.max(...sum.map((s) => s.maeNaive)));
  const series = [
    { k: 'maeNaive', name: 'PLACAR CRU (TV)', c: '#8a8aa0' }, { k: 'maeUF', name: 'PROJEÇÃO POR UF', c: '#4d7cff' },
    { k: 'maeUniform', name: 'SWING UNIFORME', c: '#ffd400' }, { k: 'maeBayes', name: 'BAYES (ESTE MODELO)', c: '#ff3b6b' },
  ] as const;
  const gw = (W - L - 40) / sum.length;
  const bw = Math.floor((gw - 12) / series.length / 4) * 4;
  const y = (v: number) => B - ((B - T) * v) / maxY;
  let bars = '';
  sum.forEach((s, i) => {
    series.forEach((se, j) => {
      const v = (s as unknown as Record<string, number>)[se.k];
      const x = L + i * gw + 6 + j * bw;
      const h = Math.max(4, Math.round((B - y(v)) / 4) * 4);
      bars += `<rect x="${x}" y="${B - h}" width="${bw - 2}" height="${h}" fill="${se.c}"/>`;
    });
    bars += textRects(`${s.cp}%`.replace('.', ','), L + i * gw + gw / 2 - textW(`${s.cp}%`, 2) / 2, B + 12, 2, '#cfcfe6').svg;
  });
  let grid = '';
  for (let v = 0; v <= maxY; v++) { grid += `<rect x="${L}" y="${y(v)}" width="${W - L - 40}" height="1" fill="#ffffff" opacity=".12"/>` + textRects(`${v}`, L - 22, y(v) - 7, 2, '#cfcfe6').svg; }
  let legend = '';
  series.forEach((se, j) => { const x = L + j * 270; legend += `<rect x="${x}" y="${H - 34}" width="14" height="14" fill="${se.c}"/>` + textRects(se.name, x + 22, H - 33, 2, '#ffffff').svg; });
  const title = textRects('HIGH SCORES - ERRO MÉDIO (PONTOS) X % APURADO', L, 24, 3, '#ffd400');
  writeFileSync(`${OUT}highscores.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${STYLE}
  <rect width="${W}" height="${H}" fill="#0e0b22"/>${title.svg}${grid}${bars}${legend}${scanlines(W, H)}</svg>`);
}

writeFileSync(`${OUT}banner.svg`, banner());
stage('stage-select.svg', 'PLAYER SELECT', 'ESCOLHA SEU LUTADOR', '#ffd400');
stage('stage-1.svg', 'STAGE 1', 'COMO FUNCIONA', '#e8222e');
stage('stage-2.svg', 'STAGE 2', 'O CHEFÃO: O MODELO', '#19c35a');
stage('stage-3.svg', 'STAGE 3', 'TREINO: BACKTEST', '#4d7cff');
stage('stage-4.svg', 'STAGE 4', 'HIGH SCORES', '#ffd400');
stage('stage-5.svg', 'STAGE 5', 'COMO JOGAR', '#e8222e');
stage('stage-6.svg', 'STAGE 6', 'INVENTÁRIO', '#19c35a');
stage('stage-7.svg', 'BONUS', 'LORE E FONTES', '#4d7cff');
scores();
console.log('arte gerada em', OUT);
