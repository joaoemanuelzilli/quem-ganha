// LEVEL MAP: cartograma em grade das 27 UFs + exterior.
import type { ForecastState, StateRow } from '../../engine/types';
import { UFS, UF_BY_CODE } from './ufs';
import { fmtNum, fmtPct, fmtProb } from './format';
import { iconSvg } from './sprites';

// passos divergentes (margem projetada em pp): neutro no meio, mais saturado = vantagem maior
const LULA_STEPS = ['#6b3a4e', '#a3283a', '#d1202f', '#ff3b47'];
const FLAV_STEPS = ['#2f5a49', '#1d7f47', '#18a650', '#2ee072'];
const NEUTRAL = '#4a4c78';
const CUTS = [2, 5, 10]; // |margem/2| em pp: <2, 2–5, 5–10, ≥10

function colorFor(proj: number): { c: string; dark: boolean } {
  const d = proj - 50;
  const a = Math.abs(d);
  if (a < 0.5) return { c: NEUTRAL, dark: false };
  const i = a < CUTS[0] ? 0 : a < CUTS[1] ? 1 : a < CUTS[2] ? 2 : 3;
  return { c: d > 0 ? LULA_STEPS[i] : FLAV_STEPS[i], dark: d < 0 && i === 3 };
}

export class LevelMap {
  private tiles = new Map<string, { b: HTMLButtonElement; prog: HTMLElement; ic: HTMLElement }>();
  private detail: HTMLElement;
  private rows = new Map<string, StateRow>();
  private sel: string | null = null;
  private hover: string | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="panel-head"><h2 id="map-title" class="panel-title">LEVEL MAP<small>Quem lidera a projeção em cada UF · barra amarela = % apurado</small></h2></div>
      <div class="map-wrap">
        <div><div class="tiles" role="group" aria-label="Mapa das UFs"></div>
        <div class="map-legend" aria-hidden="true">
          <span class="grp"><span>◆ Flávio +10</span>
          <span class="sw">${[...FLAV_STEPS].reverse().map((c) => `<i style="background:${c}"></i>`).join('')}<i style="background:${NEUTRAL}"></i>${LULA_STEPS.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span>+10 Lula ★</span></span>
          <span class="grp"><span class="nd"></span><span>sem votos ainda (só projeção)</span></span>
        </div></div>
        <div class="uf-detail"></div>
      </div>`;
    const grid = root.querySelector('.tiles') as HTMLElement;
    this.detail = root.querySelector('.uf-detail')!;
    for (const u of UFS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile nodata';
      b.style.gridRow = String(u.row + 1);
      b.style.gridColumn = String(u.col + 1);
      b.innerHTML = `<span class="s"></span><span class="ic"></span><span class="prog"><i></i></span>`;
      b.querySelector('.s')!.textContent = u.sigla;
      b.setAttribute('aria-label', u.name);
      b.addEventListener('pointerenter', () => { this.hover = u.uf; this.renderDetail(); });
      b.addEventListener('pointerleave', () => { this.hover = null; this.renderDetail(); });
      b.addEventListener('focus', () => { this.hover = u.uf; this.renderDetail(); });
      b.addEventListener('blur', () => { this.hover = null; this.renderDetail(); });
      b.addEventListener('click', () => {
        this.sel = this.sel === u.uf ? null : u.uf;
        this.tiles.forEach((t, k) => t.b.classList.toggle('sel', k === this.sel));
        this.renderDetail();
      });
      grid.appendChild(b);
      this.tiles.set(u.uf, { b, prog: b.querySelector('.prog i')!, ic: b.querySelector('.ic')! });
    }
    this.renderDetail();
  }

  update(s: ForecastState): void {
    this.rows.clear();
    for (const r of s.states ?? []) this.rows.set(r.uf.toLowerCase(), r);
    for (const [uf, t] of this.tiles) {
      const r = this.rows.get(uf);
      if (!r) { t.b.style.setProperty('--c', NEUTRAL); continue; }
      const { c, dark } = colorFor(r.projLulaPct);
      t.b.style.setProperty('--c', c);
      t.b.classList.toggle('dark-ink', dark);
      t.b.classList.toggle('nodata', !(r.pct > 0));
      t.prog.style.width = `${Math.max(0, Math.min(100, r.pct))}%`;
      const lead = r.projLulaPct >= 50 ? 'lula' : 'flavio';
      const key = Math.abs(r.projLulaPct - 50) < 0.5 ? 'tie' : lead;
      if (t.ic.dataset.k !== key) {
        t.ic.dataset.k = key;
        t.ic.innerHTML = key === 'tie' ? '' : iconSvg(key === 'lula' ? 'star' : 'diamond', dark ? '#05061a' : '#ffffff', 10);
      }
      const meta = UF_BY_CODE[uf];
      t.b.setAttribute('aria-label', `${meta?.name ?? r.name}: projeção Lula ${fmtPct(r.projLulaPct, 1)}, ${fmtPct(r.pct, 0)} apurado`);
    }
    this.renderDetail();
  }

  private renderDetail(): void {
    const k = this.hover ?? this.sel;
    const d = this.detail;
    if (!k) {
      d.innerHTML = `<h3>ESCOLHA UMA FASE</h3><div class="hint">Passe o mouse ou toque numa UF para ver a apuração e a projeção dela.</div>`;
      this.appendBig(d);
      return;
    }
    const r = this.rows.get(k);
    const meta = UF_BY_CODE[k];
    d.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = meta?.name ?? r?.name ?? k.toUpperCase();
    d.appendChild(h);
    if (!r) { const p = document.createElement('div'); p.className = 'hint'; p.textContent = 'Sem dados ainda.'; d.appendChild(p); return; }
    const sub = document.createElement('div');
    sub.className = 'ufd-sub';
    sub.textContent = `${fmtPct(r.pct, 1)} das seções apuradas · ${fmtNum(r.aptos / 1e6, 1)} mi de eleitores`;
    d.appendChild(sub);
    const block = (title: string, lula: number | null) => {
      const t = document.createElement('div');
      t.className = 'ufd-k';
      t.textContent = title;
      d.appendChild(t);
      if (lula == null) { const p = document.createElement('div'); p.className = 'hint'; p.textContent = 'Nenhum voto apurado ainda.'; d.appendChild(p); return; }
      const bar = document.createElement('div');
      bar.className = 'ufd-bar';
      bar.innerHTML = `<i class="l" style="width:${Math.max(0, Math.min(100, lula))}%"></i><i class="f" style="flex:1"></i>`;
      const row = document.createElement('div');
      row.className = 'ufd-row';
      const a = document.createElement('span'); a.innerHTML = '★ Lula <b></b>'; a.querySelector('b')!.textContent = fmtPct(lula, 1);
      const b = document.createElement('span'); b.innerHTML = '<b></b> Flávio ◆'; b.querySelector('b')!.textContent = fmtPct(100 - lula, 1);
      row.append(a, b);
      d.append(bar, row);
    };
    block('APURADO ATÉ AGORA', r.lulaPct);
    block('PROJEÇÃO FINAL', r.projLulaPct);
    const w = document.createElement('div');
    w.className = 'ufd-k';
    w.textContent = 'CHANCE DE VENCER NA UF';
    const wr = document.createElement('div');
    wr.className = 'ufd-row';
    wr.innerHTML = '<span>★ Lula <b></b></span><span><b></b> Flávio ◆</span>';
    const bs = wr.querySelectorAll('b');
    const done = r.pct >= 99.995;
    const fp = (x: number) => (!done && x >= 0.995 ? '>99%' : !done && x <= 0.005 ? '<1%' : fmtProb(x));
    bs[0].textContent = fp(r.winProbLula);
    bs[1].textContent = fp(1 - r.winProbLula);
    d.append(w, wr);
  }

  /** Sem seleção: mostra os maiores colégios eleitorais como "chefões". */
  private appendBig(d: HTMLElement): void {
    const big = [...this.rows.values()].sort((a, b) => b.aptos - a.aptos).slice(0, 6);
    if (!big.length) return;
    const t = document.createElement('div');
    t.className = 'ufd-k';
    t.textContent = 'CHEFÕES (MAIORES ELEITORADOS)';
    d.appendChild(t);
    for (const r of big) {
      const row = document.createElement('div');
      row.className = 'ufd-row';
      const a = document.createElement('span');
      a.textContent = `${UF_BY_CODE[r.uf]?.sigla ?? r.uf.toUpperCase()} · ${fmtPct(r.pct, 0)}`;
      const b = document.createElement('b');
      const lead = r.projLulaPct >= 50;
      b.textContent = `${lead ? '★ Lula' : '◆ Flávio'} ${fmtPct(lead ? r.projLulaPct : 100 - r.projLulaPct, 1)}`;
      b.style.color = lead ? 'var(--lula-l)' : 'var(--flav-l)';
      row.append(a, b);
      d.appendChild(row);
    }
  }
}
