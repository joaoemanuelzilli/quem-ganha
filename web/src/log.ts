// BATTLE LOG: eventos mais novos primeiro, com efeito de máquina de escrever.
import type { ForecastState, GameEvent } from '../../engine/types';
import { reducedMotion, timeHM } from './format';
import { iconSvg } from './sprites';

const KIND_COLOR: Record<GameEvent['kind'], string> = {
  info: '#bcbbe6', lead: '#ffd400', call: '#ffd400', state: '#bcbbe6', milestone: '#ffd400', swing: '#c4c0ff',
};
const WHO_COLOR = { lula: '#ff6b72', flavio: '#7cf2a4' } as const;
const MAX = 50;

const keyOf = (e: GameEvent) => `${e.t}|${e.kind}|${e.text}`;

export class BattleLog {
  private list: HTMLUListElement;
  private seen = new Set<string>();
  private first = true;
  private queue: { li: HTMLElement; text: string }[] = [];
  private typing = false;

  constructor(root: HTMLElement) {
    root.innerHTML = `<div class="panel-head"><h2 id="log-title" class="panel-title">BATTLE LOG<small>O que aconteceu na apuração, do mais novo ao mais antigo</small></h2></div><ul class="log-list" aria-live="polite"></ul>`;
    this.list = root.querySelector('ul')!;
  }

  update(s: ForecastState): void {
    const evs = [...(s.events ?? [])];
    // ordena mais novo primeiro de forma estável (mantém a ordem original em empates)
    const idx = new Map(evs.map((e, i) => [e, i]));
    const newestFirst = evs.length > 1 && Date.parse(evs[0].t) >= Date.parse(evs[evs.length - 1].t);
    evs.sort((a, b) => {
      const d = Date.parse(b.t) - Date.parse(a.t);
      if (d !== 0 && Number.isFinite(d)) return d;
      return newestFirst ? idx.get(a)! - idx.get(b)! : idx.get(b)! - idx.get(a)!;
    });
    const keys = new Set(evs.map(keyOf));
    // reinício da demo: eventos antigos sumiram
    const reset = this.seen.size > 0 && [...this.seen].every((k) => !keys.has(k));
    if (reset || this.first) {
      this.list.replaceChildren();
      this.seen.clear();
      this.queue = [];
    }
    const fresh = evs.filter((e) => !this.seen.has(keyOf(e)));
    const animate = !this.first && !reset && !reducedMotion() && !document.hidden && fresh.length <= 6;
    // insere do mais antigo para o mais novo, no topo
    for (const e of [...fresh].reverse()) {
      this.seen.add(keyOf(e));
      const li = document.createElement('li');
      li.dataset.kind = e.kind;
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = timeHM(e.t);
      const ic = document.createElement('span');
      ic.className = 'ic';
      ic.innerHTML = iconSvg(e.kind, (e.who && WHO_COLOR[e.who]) || KIND_COLOR[e.kind] || '#bcbbe6', 14);
      const tx = document.createElement('span');
      tx.className = 'tx';
      if (e.who && e.kind !== 'call') tx.style.color = WHO_COLOR[e.who];
      li.append(t, ic, tx);
      this.list.insertBefore(li, this.list.firstChild);
      if (animate) { tx.textContent = ''; this.queue.push({ li, text: e.text }); }
      else tx.textContent = e.text;
    }
    while (this.list.children.length > MAX) this.list.lastElementChild!.remove();
    if (!this.list.children.length) {
      const li = document.createElement('li');
      li.className = 'log-empty';
      li.textContent = 'Nenhum evento ainda. A luta começa às 17:00.';
      this.list.appendChild(li);
    } else {
      this.list.querySelector('.log-empty')?.remove();
    }
    this.first = false;
    this.pump();
  }

  private pump(): void {
    if (document.hidden) {
      // aba escondida: o navegador desacelera os timers — escreve tudo de uma vez
      for (const j of this.queue) { j.li.querySelector('.tx')!.textContent = j.text; j.li.classList.remove('typing'); }
      this.queue = [];
      return;
    }
    if (this.typing) return;
    const job = this.queue.shift();
    if (!job) return;
    this.typing = true;
    const tx = job.li.querySelector('.tx')!;
    job.li.classList.add('typing');
    job.li.setAttribute('aria-busy', 'true');
    let i = 0;
    const per = Math.max(8, Math.min(28, 700 / job.text.length));
    const step = () => {
      i += 1;
      tx.textContent = job.text.slice(0, i);
      if (i < job.text.length && job.li.isConnected && !document.hidden) setTimeout(step, per);
      else { tx.textContent = job.text; job.li.classList.remove('typing'); job.li.removeAttribute('aria-busy'); this.typing = false; this.pump(); }
    };
    step();
  }
}
