// Interpolação suave de números exibidos (contadores de arcade).
import { easeOutCubic, reducedMotion } from './format';

interface Tw { from: number; to: number; start: number; dur: number; fmt: (x: number) => string; raf: number }
const tweens = new WeakMap<Element, Tw>();
const values = new WeakMap<Element, number>();

/** Anima o textContent de `node` até `to`, formatado por `fmt`. */
export function tweenText(node: Element, to: number, fmt: (x: number) => string, dur = 900): void {
  if (!Number.isFinite(to)) { node.textContent = fmt(to); values.delete(node); return; }
  const prev = tweens.get(node);
  if (prev) cancelAnimationFrame(prev.raf);
  const cur = values.get(node);
  if (cur == null || reducedMotion() || dur <= 0 || cur === to) {
    values.set(node, to);
    node.textContent = fmt(to);
    return;
  }
  const tw: Tw = { from: cur, to, start: performance.now(), dur, fmt, raf: 0 };
  const step = () => {
    const t = Math.max(0, Math.min(1, (performance.now() - tw.start) / tw.dur));
    const v = tw.from + (tw.to - tw.from) * easeOutCubic(t);
    values.set(node, v);
    node.textContent = tw.fmt(t >= 1 ? tw.to : v);
    if (t < 1) tw.raf = requestAnimationFrame(step);
    else tweens.delete(node);
  };
  tw.raf = requestAnimationFrame(step);
  tweens.set(node, tw);
}

/** Tween genérico de um valor numérico com callback por frame. */
export class Tween {
  private from = 0;
  private to = 0;
  private start = 0;
  private dur: number;
  private raf = 0;
  value: number;
  constructor(initial: number, dur = 900, private onFrame?: (v: number) => void) {
    this.value = initial;
    this.to = initial;
    this.dur = dur;
  }
  set(to: number, immediate = false): void {
    if (!Number.isFinite(to)) return;
    cancelAnimationFrame(this.raf);
    if (immediate || reducedMotion()) {
      this.value = this.to = to;
      this.onFrame?.(to);
      return;
    }
    this.from = this.value;
    this.to = to;
    this.start = performance.now();
    const step = () => {
      const t = Math.max(0, Math.min(1, (performance.now() - this.start) / this.dur));
      this.value = this.from + (this.to - this.from) * easeOutCubic(t);
      this.onFrame?.(this.value);
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
