// Painel de projeção ("STATUS" do round).
import type { ForecastState } from '../../engine/types';
import { fmtNum, fmtPct, fmtSigned, fmtVotesShort, timeHM } from './format';
import { iconSvg } from './sprites';
import { tweenText } from './tween';

export class Projection {
  private q: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="panel-head"><h2 id="proj-title" class="panel-title">PROJEÇÃO FINAL<small>Como a apuração deve terminar (faixa de 90%)</small></h2></div>
      <div class="proj-final">
        <div class="pf l"><div class="nm">${iconSvg('star', '#ff6b72', 10)}LULA</div><div class="v" data-q="pl">—</div><div class="r" data-q="rl">—</div></div>
        <div class="pf f"><div class="nm">FLÁVIO${iconSvg('diamond', '#7cf2a4', 10)}</div><div class="v" data-q="pf">—</div><div class="r" data-q="rf">—</div></div>
      </div>
      <dl class="stats">
        <dt>Votos projetados</dt><dd data-q="votes">—</dd>
        <dt>Margem projetada</dt><dd data-q="margin">—</dd>
        <dt>Comparecimento</dt><dd data-q="turnout">—</dd>
        <dt>Swing vs 1º turno</dt><dd data-q="swing">—</dd>
        <div class="sep"></div>
        <dt>Fim previsto</dt><dd data-q="eta">—</dd>
        <dt>Unidades com votos</dt><dd data-q="units">—</dd>
        <dt>Pesquisas (prior)</dt><dd data-q="prior">—</dd>
      </dl>`;
    root.querySelectorAll<HTMLElement>('[data-q]').forEach((e) => { this.q[e.dataset.q!] = e; });
  }

  update(s: ForecastState): void {
    const f = s.forecast;
    const q = f.lulaPct;
    tweenText(this.q.pl, q.p50, (x) => fmtPct(x, 1));
    tweenText(this.q.pf, 100 - q.p50, (x) => fmtPct(x, 1));
    this.q.rl.textContent = `${fmtNum(q.p05, 1)}–${fmtNum(q.p95, 1)}%`;
    this.q.rf.textContent = `${fmtNum(100 - q.p95, 1)}–${fmtNum(100 - q.p05, 1)}%`;
    const v = f.projVotes;
    this.q.votes.textContent = `${fmtVotesShort(v.lula)} × ${fmtVotesShort(v.flavio)}`;
    const mg = v.lula - v.flavio;
    this.q.margin.innerHTML = '';
    this.q.margin.append(`${fmtVotesShort(Math.abs(mg))} `);
    const who = document.createElement('span');
    who.className = 'sub';
    who.textContent = mg >= 0 ? 'p/ Lula' : 'p/ Flávio';
    this.q.margin.appendChild(who);
    this.q.turnout.textContent = fmtPct(f.turnoutPct, 1);
    const sw = f.swingVsT1;
    this.q.swing.textContent = Number.isFinite(sw) ? `${fmtSigned(sw, 1)} pp ${sw >= 0 ? 'p/ Lula' : 'p/ Flávio'}` : '—';
    this.q.eta.textContent = s.status === 'final' ? 'encerrada' : f.etaFinish ? `${timeHM(f.etaFinish)} (Brasília)` : s.status === 'pre' ? 'a partir das 17:00' : '—';
    this.q.units.textContent = `${fmtNum(f.unitsReporting)}/${fmtNum(f.unitsTotal)} ${f.units === 'uf' ? 'UFs' : 'municípios'}`;
    this.q.prior.textContent = `Lula ${fmtNum(s.prior.lulaPct, 1)}% ± ${fmtNum(s.prior.sd, 1)}`;
    this.q.prior.title = s.prior.source;
  }
}
