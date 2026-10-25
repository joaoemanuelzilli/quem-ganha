// "SELECT YOUR ALGORITHM": métodos de previsão como cartas de seleção de personagem.
// O card com official === true é a previsão oficial do site (coroa dourada).
import type { ForecastState, MethodResult } from '../../engine/types';
import { clamp, fmtNum, fmtProb } from './format';
import { CROWN_INDEX, moveIconSvg, moveIndexFor } from './sprites';

interface CardEls {
  root: HTMLElement; name: HTMLElement; desc: HTMLElement; l: HTMLElement;
  vl: HTMLElement; vf: HTMLElement; wpLine: HTMLElement | null;
  e1: HTMLElement; e5: HTMLElement; b1: HTMLElement; b5: HTMLElement; none: HTMLElement;
  wt: HTMLElement; wv: HTMLElement; pips: HTMLElement;
}

const ERR_TIP = 'Erro médio absoluto (em pontos percentuais) do método no nosso backtest — presidenciais de 2022 (1º e 2º turno) e 1º turno de 2026 — quando 1% e 5% das seções estavam apuradas. Barra maior = erro menor.';
/** Erro (pp) → comprimento da barra de precisão (0–100%). 0 pp = cheia, ≥ 3 pp = quase vazia. */
const errLen = (mae: number) => `${clamp(1 - mae / 3, 0.05, 1) * 100}%`;
const PX_ARROW = '<svg width="7" height="7" viewBox="0 0 4 7" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor"><rect x="0" y="0" width="1" height="7"/><rect x="1" y="1" width="1" height="5"/><rect x="2" y="2" width="1" height="3"/><rect x="3" y="3" width="1" height="1"/></svg>';

export class Methods {
  private cards = new Map<string, CardEls>();
  private grid: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `<div class="panel-head"><h2 id="methods-title" class="panel-title">SELECT YOUR ALGORITHM<small>Cada método projeta o resultado do seu jeito; a carta dourada é a previsão oficial do site</small></h2></div><div class="cards"></div>`;
    this.grid = root.querySelector('.cards')!;
  }

  private card(m: MethodResult, idx: number): CardEls {
    const official = !!m.official;
    const key = `${m.id}|${official ? 1 : 0}`;
    const hit = this.cards.get(key);
    if (hit) return hit;
    const r = document.createElement('article');
    r.className = `card${official ? ' ens' : ''}`;
    r.innerHTML = `${official ? `<span class="cur">P1 ${PX_ARROW}</span>` : ''}
      <div class="ico">${moveIconSvg(official ? CROWN_INDEX : moveIndexFor(m.id, idx), official ? '#ffd400' : '#bcbbe6', official ? '#e8222e' : '#ffd400', 30)}</div>
      ${official ? '<span class="off-tag">PREVISÃO OFICIAL</span>' : ''}
      <h3></h3><p></p>
      ${official ? '<div class="ens-wp"><span class="k">CHANCE DE VITÓRIA</span><b></b></div>' : ''}
      <div class="mb"><i class="l"></i><i class="f"></i></div>
      <div class="mv"><span class="l">—</span><span class="f">—</span></div>
      <div class="err" title="${ERR_TIP}">
        <span class="k">ERRO HISTÓRICO</span>
        <div class="sr" data-e="1"><span>c/ 1%</span><span class="sb"><i></i></span><b>—</b></div>
        <div class="sr" data-e="5"><span>c/ 5%</span><span class="sb"><i></i></span><b>—</b></div>
        <div class="sr-none">sem histórico</div>
      </div>
      <div class="wt"><span class="wl">PESO</span><span class="pips">${'<i></i>'.repeat(10)}</span><span class="wv">—</span></div>`;
    const c: CardEls = {
      root: r, name: r.querySelector('h3')!, desc: r.querySelector('p')!,
      l: r.querySelector('.mb .l')!, vl: r.querySelector('.mv .l')!, vf: r.querySelector('.mv .f')!,
      wpLine: r.querySelector<HTMLElement>('.ens-wp b'),
      e1: r.querySelector('[data-e="1"] b')!, e5: r.querySelector('[data-e="5"] b')!,
      b1: r.querySelector('[data-e="1"] .sb i')!, b5: r.querySelector('[data-e="5"] .sb i')!,
      none: r.querySelector('.sr-none')!,
      wt: r.querySelector('.wt')!, wv: r.querySelector('.wv')!, pips: r.querySelector('.pips')!,
    };
    this.cards.set(key, c);
    return c;
  }

  update(s: ForecastState): void {
    const list = [...(s.forecast.methods ?? [])];
    // a previsão oficial vai sempre primeiro (ordem estável para o resto)
    list.sort((a, b) => Number(!!b.official) - Number(!!a.official));
    const seen = new Set<string>();
    list.forEach((m, i) => {
      const c = this.card(m, i);
      seen.add(`${m.id}|${m.official ? 1 : 0}`);
      if (this.grid.children[i] !== c.root) this.grid.insertBefore(c.root, this.grid.children[i] ?? null);
      c.name.textContent = m.name;
      c.desc.textContent = m.desc;
      const lp = clamp(m.lulaPct, 0, 100);
      c.l.style.width = `${lp}%`;
      c.vl.textContent = `★ ${fmtNum(lp, 1)}%`;
      c.vf.textContent = `${fmtNum(100 - lp, 1)}% ◆`;
      const wp = m.winProbLula ?? (m.official ? s.forecast.winProbLula : undefined);
      if (c.wpLine) c.wpLine.textContent = wp != null ? `★ ${fmtProb(wp)} · ${fmtProb(1 - wp)} ◆` : '—';
      c.root.title = wp != null && !m.official ? `Chance do Lula neste método: ${fmtProb(wp)}` : '';
      // erro histórico (backtest)
      const has1 = m.mae1 != null && Number.isFinite(m.mae1);
      const has5 = m.mae5 != null && Number.isFinite(m.mae5);
      (c.e1.parentElement as HTMLElement).hidden = !has1;
      (c.e5.parentElement as HTMLElement).hidden = !has5;
      c.none.hidden = has1 || has5;
      if (has1) { c.e1.textContent = `${fmtNum(m.mae1!, 2)} pp`; c.b1.style.width = errLen(m.mae1!); }
      if (has5) { c.e5.textContent = `${fmtNum(m.mae5!, 2)} pp`; c.b5.style.width = errLen(m.mae5!); }
      // peso: só quando o método compõe a previsão oficial
      const w = m.weight;
      const showW = w != null && Number.isFinite(w) && w > 0;
      c.wt.hidden = !showW;
      if (showW) {
        c.wv.textContent = `${fmtNum(w! * 100, 0)}%`;
        const on = Math.max(1, Math.round(w! * 10));
        Array.from(c.pips.children).forEach((p, k) => p.classList.toggle('on', k < on));
      }
    });
    for (const [k, c] of this.cards) if (!seen.has(k)) { c.root.remove(); this.cards.delete(k); }
    // a carta oficial ocupa a altura de todas as linhas de métodos (desktop)
    const off = list.find((m) => m.official);
    if (off) {
      const c = this.cards.get(`${off.id}|1`);
      c?.root.style.setProperty('--rows', String(Math.max(1, Math.ceil((list.length - 1) / 4))));
    }
  }
}
