// Medidor de chance de vitória (cabo de guerra) + faixa de "call".
import type { ForecastState } from '../../engine/types';
import { fmtProb } from './format';
import { iconSvg } from './sprites';
import { tweenText } from './tween';

const NAME = { lula: 'LULA', flavio: 'FLÁVIO' } as const;

export class Power {
  private l: HTMLElement; private f: HTMLElement; private knot: HTMLElement;
  private pl: HTMLElement; private pf: HTMLElement; private banner: HTMLElement;
  private meter: HTMLElement;
  private lastBanner = '';
  private root: HTMLElement;
  private warm: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="panel-head"><h2 id="power-title" class="panel-title">CHANCE DE VITÓRIA<small>Segundo o modelo, quem leva o 2º turno</small></h2></div>
      <div class="warm" hidden>${iconSvg('warn', '#ffd400', 14)}<span><b>AQUECENDO</b> — previsão instável até cerca de 1% apurado</span></div>
      <div class="pm-names">
        <div class="pm-side l"><span class="nm">${iconSvg('star', '#ff6b72', 12)}LULA</span><span class="pc" data-k="l">—</span></div>
        <div class="pm-side f"><span class="nm">FLÁVIO${iconSvg('diamond', '#7cf2a4', 12)}</span><span class="pc" data-k="f">—</span></div>
      </div>
      <div class="tug" role="meter" aria-valuemin="0" aria-valuemax="100" aria-label="Chance de vitória do Lula">
        <div class="tug-l"></div><div class="tug-f"></div><div class="tug-mid"></div><div class="tug-knot"></div>
      </div>
      <div class="pm-scale"><span>100% Lula</span><span>50/50</span><span>100% Flávio</span></div>
      <div class="banner" data-call="none" aria-live="polite"></div>`;
    this.l = root.querySelector('.tug-l')!;
    this.f = root.querySelector('.tug-f')!;
    this.knot = root.querySelector('.tug-knot')!;
    this.pl = root.querySelector('[data-k="l"]')!;
    this.pf = root.querySelector('[data-k="f"]')!;
    this.banner = root.querySelector('.banner')!;
    this.meter = root.querySelector('.tug')!;
    this.root = root;
    this.warm = root.querySelector('.warm')!;
  }

  update(s: ForecastState): void {
    const p = Math.max(0, Math.min(1, s.forecast.winProbLula));
    this.l.style.width = `calc(${p * 100}% - 1px)`;
    this.f.style.width = `calc(${(1 - p) * 100}% - 1px)`;
    this.knot.style.left = `${Math.max(1.5, Math.min(98.5, p * 100))}%`;
    this.meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    // 100%/0% só quando a vitória é matemática; antes disso, no máximo ">99%"
    const certain = s.status === 'final' || s.forecast.call === 'mathematical';
    const fp = (x: number) => (!certain && x >= 0.995 ? '>99%' : !certain && x <= 0.005 ? '<1%' : fmtProb(x));
    // os dois lados sempre somam 100 (Flávio = 100 − Lula arredondado)
    const fpF = (y: number) => (!certain && y >= 0.995 ? '>99%' : !certain && y <= 0.005 ? '<1%' : Number.isFinite(y) ? `${100 - Math.round((1 - y) * 100)}%` : '—');
    tweenText(this.pl, p, fp);
    tweenText(this.pf, 1 - p, fpF);

    const warming = !!s.forecast.warmingUp && s.status === 'counting';
    this.warm.hidden = !warming;
    this.root.classList.toggle('is-warm', warming);
    const call = s.status === 'final' && s.forecast.call !== 'none' ? 'mathematical' : warming ? 'none' : s.forecast.call;
    const who = s.forecast.leader;
    const nm = NAME[who];
    let html: string;
    if (s.status === 'pre') html = '<span>AGUARDANDO A APURAÇÃO<span class="dots"></span></span><small>Por enquanto, só as pesquisas</small>';
    else if (warming) html = '<span>AQUECENDO<span class="dots"></span></span><small>Poucas urnas apuradas: a previsão ainda oscila muito</small>';
    else if (call === 'none') html = '<span>AINDA CEDO<span class="dots"></span></span><small>A disputa segue aberta</small>';
    else if (call === 'lean') html = `VANTAGEM ${nm}<small>Ainda dá para virar</small>`;
    else if (call === 'projected') html = `<span class="big">VITÓRIA PROJETADA: ${nm}!</span><small>O modelo vê chance de virada abaixo de 1%</small>`;
    else html = `<span class="big">${nm} VENCEU!</span><small>(matematicamente — os votos restantes não alcançam)</small>`;
    const key = `${call}|${who}|${s.status}|${warming}`;
    if (key !== this.lastBanner) {
      this.lastBanner = key;
      this.banner.innerHTML = html;
      this.banner.dataset.call = call;
      this.banner.dataset.who = who;
    }
  }
}
