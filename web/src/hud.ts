// HUD superior: retratos, barras de "vida" (% dos válidos apurados) e o "timer" (% seções).
import type { CandKey, ForecastState } from '../../engine/types';
import type { FeedMeta } from './feed';
import { drawPortrait, iconSvg, moveIconSvg, CROWN_INDEX, type Face } from './sprites';
import { fmtNum, fmtPct, timeHMS, reducedMotion } from './format';
import { tweenText } from './tween';

interface FighterEls {
  pic: HTMLElement;
  canvas: HTMLCanvasElement;
  info: HTMLElement;
  fill: HTMLElement;
  chip: HTMLElement;
  pct: HTMLElement;
  votes: HTMLElement;
}

const SIDES: { key: CandKey; p: 'p1' | 'p2'; label: string; sym: 'star' | 'diamond'; color: string }[] = [
  { key: 'lula', p: 'p1', label: 'P1', sym: 'star', color: '#ff6b72' },
  { key: 'flavio', p: 'p2', label: 'P2', sym: 'diamond', color: '#7cf2a4' },
];

export class Hud {
  private f = {} as Record<CandKey, FighterEls>;
  private timerN!: HTMLElement;
  private clock!: HTMLElement;
  private face: Record<CandKey, Face> = { lula: 'idle', flavio: 'idle' };
  private winner: CandKey | null = null;
  private demoClock: string | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = '';
    for (const s of SIDES) {
      const pic = document.createElement('div');
      pic.className = `f-pic ${s.p}`;
      const cv = document.createElement('canvas');
      cv.width = 96;
      cv.height = 96;
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', s.key === 'lula' ? 'Retrato em pixel art do Lula' : 'Retrato em pixel art do Flávio Bolsonaro');
      pic.appendChild(cv);
      pic.insertAdjacentHTML('beforeend', `<span class="crown">${moveIconSvg(CROWN_INDEX, '#ffd400', '#ff6b72', 30)}</span><span class="tag">${s.label}</span>`);

      const info = document.createElement('div');
      info.className = `f-info ${s.p}`;
      const isL = s.key === 'lula';
      info.innerHTML = `
        <div class="f-name">
          <b>${isL ? 'LULA' : 'FLÁVIO'}</b>
          <span class="sym">${iconSvg(s.sym, s.color, 16)}</span>
          <em>${isL ? '13 · PT' : '22 · PL'}</em>
          <span class="lead-tag">NA FRENTE</span>
        </div>
        <div class="hbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-label="% dos votos válidos apurados — ${isL ? 'Lula' : 'Flávio'}">
          <div class="hbar-chip"></div><div class="hbar-fill"></div><div class="notch" title="50%"></div>
        </div>
        <div class="f-stats"><span class="f-pct">—</span><span class="f-votes">— votos</span></div>`;
      this.f[s.key] = {
        pic, canvas: cv, info,
        fill: info.querySelector('.hbar-fill')!, chip: info.querySelector('.hbar-chip')!,
        pct: info.querySelector('.f-pct')!, votes: info.querySelector('.f-votes')!,
      };
      root.append(pic, info);
      drawPortrait(cv, s.key, 'idle', s.key === 'flavio');
    }
    const timer = document.createElement('div');
    timer.className = 'timer';
    timer.innerHTML = `<div class="timer-n"><span class="tn">0,0</span><small>%</small></div>
      <div class="timer-l">SEÇÕES<br>APURADAS</div>
      <div class="timer-clock" aria-label="Horário de Brasília">${iconSvg('clock', '#bcbbe6', 14)}<span class="clk">--:--:--</span></div>`;
    root.appendChild(timer);
    this.timerN = timer.querySelector('.tn')!;
    this.clock = timer.querySelector('.clk')!;

    // relógio e piscadas
    setInterval(() => this.tickClock(), 1000);
    this.tickClock();
    this.scheduleBlink();
  }

  private tickClock(): void {
    const s = this.demoClock ?? timeHMS(Date.now());
    const [h, m, sec] = s.split(':');
    this.clock.innerHTML = `${h}<span class="colon">:</span>${m}<span class="colon">:</span>${sec ?? '00'}`;
  }

  private scheduleBlink(): void {
    if (reducedMotion()) return;
    const go = () => {
      const k: CandKey = Math.random() < 0.5 ? 'lula' : 'flavio';
      if (this.face[k] === 'idle') {
        this.paint(k, 'blink');
        setTimeout(() => this.paint(k, this.winner === k ? 'win' : 'idle'), 160);
      }
      setTimeout(go, 1800 + Math.random() * 2600);
    };
    setTimeout(go, 1500);
  }

  private paint(k: CandKey, face: Face): void {
    drawPortrait(this.f[k].canvas, k, face, k === 'flavio');
  }

  update(s: ForecastState, meta: FeedMeta): void {
    const c = s.current;
    this.demoClock = meta.mode === 'demo' ? timeHMS(s.generatedAt) : null;
    this.tickClock();
    tweenText(this.timerN, s.progress.pct, (x) => (x >= 99.95 ? '100' : fmtNum(x, 1)));
    const rows: [CandKey, number, number][] = [
      ['lula', c.lulaPct, c.lula],
      ['flavio', c.flavioPct, c.flavio],
    ];
    for (const [k, pct, votes] of rows) {
      const e = this.f[k];
      const has = c.validos > 0;
      const w = has ? `${Math.max(0, Math.min(100, pct))}%` : '0%';
      e.fill.style.width = w;
      e.chip.style.width = w;
      e.fill.parentElement!.setAttribute('aria-valuenow', has ? pct.toFixed(2) : '0');
      tweenText(e.pct, has ? pct : NaN, (x) => (Number.isFinite(x) ? fmtPct(x, 2) : '—'));
      tweenText(e.votes, has ? votes : NaN, (x) => (Number.isFinite(x) ? `${fmtNum(x)} votos` : '— votos'));
      e.info.classList.toggle('is-leading', c.leader === k && c.validos > 0);
    }
    // vencedor (call projetado/matemático)
    const call = s.forecast.call;
    const w = s.status === 'final' || (!s.forecast.warmingUp && (call === 'projected' || call === 'mathematical')) ? s.forecast.leader : null;
    if (w !== this.winner) {
      this.winner = w;
      for (const k of ['lula', 'flavio'] as CandKey[]) {
        this.face[k] = 'idle';
        this.paint(k, w === k ? 'win' : 'idle');
        this.f[k].pic.classList.toggle('is-winner', w === k);
      }
    }
  }
}
