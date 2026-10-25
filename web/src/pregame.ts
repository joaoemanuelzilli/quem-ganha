// Tela pré-jogo (status === 'pre'): título de arcade, contagem regressiva, VS e o prior das pesquisas.
import type { ForecastState } from '../../engine/types';
import { drawPortrait, iconSvg } from './sprites';
import { fmtCountdown, fmtNum, fmtProb } from './format';
import { mountPoly } from './polymarket';

/** 25/10/2026 17:00:00 em Brasília (UTC−3). */
export const START_UTC = Date.UTC(2026, 9, 25, 20, 0, 0);

export class Pregame {
  private cd: HTMLElement;
  private priorEls: { l: HTMLElement; f: HTMLElement; bl: HTMLElement; sd: HTMLElement; src: HTMLElement; wp: HTMLElement };
  private timer = 0;
  private stopPoly: (() => void) | null = null;
  private polyRoot: HTMLElement;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <h2 class="pg-title"><span class="q">QUEM GANHA?</span><span class="y">2026</span></h2>
      <p class="pg-sub">O 2º turno presidencial vira uma luta de arcade: a apuração do TSE é o round, e o modelo diz quem deve levar.</p>
      <div class="coin" aria-hidden="true">INSERT COIN</div>
      <div class="vs-stage">
        <div class="vs-f l"><div class="pic"><canvas width="192" height="192" role="img" aria-label="Lula em pixel art"></canvas></div><div class="nm">LULA</div><div class="pt">13 · PT</div></div>
        <div class="vs-x" aria-hidden="true">VS</div>
        <div class="vs-f f"><div class="pic"><canvas width="192" height="192" role="img" aria-label="Flávio Bolsonaro em pixel art"></canvas></div><div class="nm">FLÁVIO</div><div class="pt">22 · PL</div></div>
      </div>
      <div class="pg-grid">
        <section class="panel pg-box">
          <h2 class="panel-title">A LUTA COMEÇA EM<small>Início da apuração: 25/10, 17:00 (Brasília)</small></h2>
          <div class="countdown" role="timer" aria-live="off">--:--:--</div>
          <div class="pg-note">Esta página se atualiza sozinha quando o TSE começar a divulgar os votos.</div>
        </section>
        <section class="panel pg-box">
          <h2 class="panel-title">PONTO DE PARTIDA<small>Média das pesquisas (votos válidos)</small></h2>
          <div class="prior-v"><span class="l">${iconSvg('star', '#ff6b72', 12)}<span data-p="l">—</span></span><span class="f"><span data-p="f">—</span>${iconSvg('diamond', '#7cf2a4', 12)}</span></div>
          <div class="prior-bar"><i class="l" data-p="bl" style="width:50%"></i><i class="f"></i><span class="sd" data-p="sd"></span><span class="mid"></span></div>
          <div class="pg-note"><span data-p="wp"></span> <span data-p="src"></span></div>
        </section>
        <section class="panel pg-box poly" aria-label="Polymarket"></section>
      </div>
      <a class="btn-play" href="?demo=1"><svg width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor"><rect x="1" y="0" width="1" height="7"/><rect x="2" y="1" width="1" height="5"/><rect x="3" y="2" width="1" height="3"/><rect x="4" y="3" width="1" height="1"/></svg>JOGAR DEMO</a>
      <p class="pg-note" style="margin-top:14px">A demo reproduz uma apuração simulada inteira em 90 segundos.</p>`;
    const [cl, cf] = root.querySelectorAll('canvas');
    drawPortrait(cl, 'lula', 'idle');
    drawPortrait(cf, 'flavio', 'idle', true);
    this.cd = root.querySelector('.countdown')!;
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-p="${k}"]`)!;
    this.priorEls = { l: q('l'), f: q('f'), bl: q('bl'), sd: q('sd'), src: q('src'), wp: q('wp') };
    this.polyRoot = root.querySelector('.poly')!;
  }

  show(s: ForecastState): void {
    this.root.hidden = false;
    if (!this.stopPoly) this.stopPoly = mountPoly(this.polyRoot);
    if (!this.timer) {
      const tick = () => {
        const ms = START_UTC - Date.now();
        this.cd.textContent = ms > 0 ? fmtCountdown(ms) : 'JÁ VAI COMEÇAR';
      };
      tick();
      this.timer = window.setInterval(tick, 1000);
    }
    const p = s.prior;
    const e = this.priorEls;
    e.l.textContent = `LULA ${fmtNum(p.lulaPct, 1)}%`;
    e.f.textContent = `${fmtNum(100 - p.lulaPct, 1)}% FLÁVIO`;
    e.bl.style.width = `calc(${p.lulaPct}% - 1px)`;
    e.sd.style.left = `${Math.max(0, p.lulaPct - p.sd)}%`;
    e.sd.style.width = `${Math.min(100, 2 * p.sd)}%`;
    e.wp.textContent = `Margem de ±${fmtNum(p.sd, 1)} pp. Chance inicial do Lula: ${fmtProb(s.forecast.winProbLula)}.`;
    e.src.textContent = p.source ? `Fonte: ${p.source}.` : '';
  }

  hide(): void {
    this.root.hidden = true;
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.stopPoly) { this.stopPoly(); this.stopPoly = null; }
  }
}
