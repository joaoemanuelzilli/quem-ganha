// TERMÔMETROS: Minas Gerais ("quem ganha em Minas ganha o Brasil") e a meta do Lula no Nordeste.
import type { ForecastState, Thermometers } from '../../engine/types';
import { clamp, fmtNum, fmtPct, fmtProb } from './format';
import { iconSvg } from './sprites';

interface GaugeEls { track: HTMLElement; fill: HTMLElement; line: HTMLElement; lineLbl: HTMLElement; ref: HTMLElement; cnt: HTMLElement; proj: HTMLElement; lo: HTMLElement; hi: HTMLElement }

function gauge(): { root: HTMLElement; g: GaugeEls } {
  const root = document.createElement('div');
  root.className = 'gauge';
  root.innerHTML = `
    <div class="g-track">
      <i class="g-fill"></i><i class="g-ref" title="1º turno"></i><i class="g-line"><b class="g-line-l"></b></i>
      <i class="g-cnt" title="apurado até agora"></i><i class="g-proj" title="projeção final"></i>
    </div>
    <div class="g-scale"><span class="lo"></span><span class="hi"></span></div>`;
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  return {
    root,
    g: {
      track: q('.g-track'), fill: q('.g-fill'), line: q('.g-line'), lineLbl: q('.g-line-l'), ref: q('.g-ref'),
      cnt: q('.g-cnt'), proj: q('.g-proj'), lo: q('.lo'), hi: q('.hi'),
    },
  };
}

/** Escala [lo, hi] em passos de 2 pp que cobre os valores com folga. */
function scaleFor(vals: (number | null | undefined)[], pad: number, minSpan: number): [number, number] {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  let lo = Math.min(...v) - pad, hi = Math.max(...v) + pad;
  if (hi - lo < minSpan) { const c = (lo + hi) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
  return [clamp(Math.floor(lo / 2) * 2, 0, 98), clamp(Math.ceil(hi / 2) * 2, 2, 100)];
}

const at = (v: number, lo: number, hi: number) => `${clamp(((v - lo) / (hi - lo)) * 100, 0, 100)}%`;

export class Thermo {
  private mg: { g: GaugeEls; badge: HTMLElement; prog: HTMLElement; progT: HTMLElement; counted: HTMLElement; proj: HTMLElement; implied: HTMLElement; record: HTMLElement };
  private ne: { g: GaugeEls; badge: HTMLElement; prog: HTMLElement; progT: HTMLElement; line: HTMLElement; ref: HTMLElement; implied: HTMLElement };

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="panel-head"><h2 id="thermo-title" class="panel-title">TERMÔMETROS<small>Dois sinais clássicos da noite de apuração</small></h2></div>
      <div class="thermo-grid">
        <article class="th-card th-mg">
          <header class="th-h"><h3>QUEM GANHA EM MINAS<br>GANHA O BRASIL</h3><span class="th-badge" data-k="mgb"></span></header>
          <div class="th-prog"><span>MG apurado</span><span class="bar"><i data-k="mgp"></i></span><b data-k="mgpt">—</b></div>
          <div data-k="mgg"></div>
          <dl class="th-rows">
            <dt>Apurado em MG</dt><dd data-k="mgc">—</dd>
            <dt>Projeção em MG</dt><dd data-k="mgj">—</dd>
            <dt>Se o Brasil votar como MG</dt><dd data-k="mgi">—</dd>
          </dl>
          <p class="th-cap" data-k="mgr"></p>
        </article>
        <article class="th-card th-ne">
          <header class="th-h"><h3>META NO<br>NORDESTE</h3><span class="th-badge" data-k="neb"></span></header>
          <div class="th-prog"><span>NE apurado</span><span class="bar"><i data-k="nep"></i></span><b data-k="nept">—</b></div>
          <div data-k="neg"></div>
          <p class="th-line" data-k="nel">—</p>
          <dl class="th-rows">
            <dt>1º turno no NE</dt><dd data-k="ner">—</dd>
            <dt>Se o Brasil votar como o NE</dt><dd data-k="nei">—</dd>
          </dl>
          <p class="th-cap">O Nordeste chega por último e é mais de esquerda — se Lula ficar abaixo da meta lá, Flávio vence.</p>
        </article>
      </div>
      <div class="th-legend" aria-hidden="true">
        <span><i class="lg-cnt"></i>apurado até agora</span>
        <span><i class="lg-proj"></i>projeção final</span>
        <span><i class="lg-line"></i>50% (MG) · meta (NE)</span>
        <span><i class="lg-ref"></i>1º turno</span>
      </div>`;
    const k = (n: string) => root.querySelector<HTMLElement>(`[data-k="${n}"]`)!;
    const gm = gauge();
    k('mgg').replaceWith(gm.root);
    const gn = gauge();
    k('neg').replaceWith(gn.root);
    this.mg = { g: gm.g, badge: k('mgb'), prog: k('mgp'), progT: k('mgpt'), counted: k('mgc'), proj: k('mgj'), implied: k('mgi'), record: k('mgr') };
    this.ne = { g: gn.g, badge: k('neb'), prog: k('nep'), progT: k('nept'), line: k('nel'), ref: k('ner'), implied: k('nei') };
  }

  update(s: ForecastState): void {
    const t = s.thermometers;
    this.root.hidden = !t;
    if (!t) return;
    if (t.minas) this.updateMinas(t.minas);
    if (t.nordeste) this.updateNordeste(t.nordeste);
  }

  private updateMinas(m: Thermometers['minas']): void {
    const e = this.mg;
    const lead = m.leader ?? (m.projLulaPct >= 50 ? 'lula' : 'flavio');
    e.badge.dataset.who = lead;
    e.badge.innerHTML = `${iconSvg(lead === 'lula' ? 'star' : 'diamond', lead === 'lula' ? '#ffffff' : '#05061a', 10)}${lead === 'lula' ? 'LULA' : 'FLÁVIO'} LIDERA EM MG`;
    e.prog.style.width = `${clamp(m.pct, 0, 100)}%`;
    e.progT.textContent = fmtPct(m.pct, 0);
    e.counted.textContent = m.lulaPct == null ? 'nenhum voto ainda' : `Lula ${fmtNum(m.lulaPct, 1)}% × ${fmtNum(100 - m.lulaPct, 1)}% Flávio`;
    e.proj.textContent = `Lula ${fmtNum(m.projLulaPct, 1)}% · chance ${fmtProb(m.winProbLula)}`;
    e.implied.textContent = m.impliedNationalLula == null ? '—' : `Lula ${fmtNum(m.impliedNationalLula, 1)}%`;
    e.record.textContent = m.record ?? '';
    // escala divergente em torno de 50
    const dev = Math.max(4, ...[m.lulaPct, m.projLulaPct].filter((x): x is number => x != null).map((x) => Math.abs(x - 50) + 1.5));
    const span = Math.ceil(dev / 2) * 2;
    const lo = 50 - span, hi = 50 + span;
    const g = e.g;
    g.lo.textContent = `${lo}% ◆ Flávio`;
    g.hi.textContent = `Lula ★ ${hi}%`;
    const p = m.projLulaPct;
    const a = Math.min(50, p), b = Math.max(50, p);
    g.fill.style.left = at(a, lo, hi);
    g.fill.style.width = `calc(${at(b, lo, hi)} - ${at(a, lo, hi)})`;
    g.fill.dataset.who = p >= 50 ? 'lula' : 'flavio';
    g.line.style.left = at(50, lo, hi);
    g.lineLbl.textContent = '50%';
    g.ref.hidden = true;
    g.cnt.hidden = m.lulaPct == null;
    if (m.lulaPct != null) g.cnt.style.left = at(m.lulaPct, lo, hi);
    g.proj.style.left = at(p, lo, hi);
    g.proj.dataset.who = p >= 50 ? 'lula' : 'flavio';
    g.track.setAttribute('aria-label', `Minas: projeção Lula ${fmtNum(p, 1)}%`);
  }

  private updateNordeste(n: Thermometers['nordeste']): void {
    const e = this.ne;
    const ref = n.projLulaPct;
    const ok = ref >= n.neededLulaPct;
    e.badge.dataset.who = ok ? 'lula' : 'flavio';
    e.badge.innerHTML = `${iconSvg(ok ? 'star' : 'diamond', ok ? '#ffffff' : '#05061a', 10)}${ok ? 'LULA ACIMA DA META' : 'LULA ABAIXO DA META'}`;
    e.prog.style.width = `${clamp(n.pct, 0, 100)}%`;
    e.progT.textContent = fmtPct(n.pct, 0);
    const parts = [`Lula precisa de ${fmtNum(n.neededLulaPct, 1)}% no NE`];
    if (n.lulaPct != null) parts.push(`está fazendo ${fmtNum(n.lulaPct, 1)}%`);
    parts.push(`projeção ${fmtNum(n.projLulaPct, 1)}%`);
    e.line.textContent = parts.join(' · ');
    e.line.dataset.who = ok ? 'lula' : 'flavio';
    e.ref.textContent = `Lula ${fmtNum(n.t1LulaPct, 1)}%`;
    e.implied.textContent = n.impliedNationalLula == null ? '—' : `Lula ${fmtNum(n.impliedNationalLula, 1)}%`;
    const [lo, hi] = scaleFor([n.neededLulaPct, n.lulaPct, n.projLulaPct, n.t1LulaPct], 2.5, 8);
    const g = e.g;
    g.lo.textContent = `${lo}%`;
    g.hi.textContent = `${hi}% Lula`;
    g.fill.style.left = '0%';
    g.fill.style.width = at(n.projLulaPct, lo, hi);
    g.fill.dataset.who = ok ? 'lula' : 'flavio';
    g.line.style.left = at(n.neededLulaPct, lo, hi);
    g.lineLbl.textContent = `META ${fmtNum(n.neededLulaPct, 1)}%`;
    g.ref.hidden = false;
    g.ref.style.left = at(n.t1LulaPct, lo, hi);
    g.cnt.hidden = n.lulaPct == null;
    if (n.lulaPct != null) g.cnt.style.left = at(n.lulaPct, lo, hi);
    g.proj.style.left = at(n.projLulaPct, lo, hi);
    g.proj.dataset.who = ok ? 'lula' : 'flavio';
    g.track.setAttribute('aria-label', `Nordeste: meta ${fmtNum(n.neededLulaPct, 1)}%, projeção ${fmtNum(n.projLulaPct, 1)}%`);
  }
}
