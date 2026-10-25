// PRNG determinístico (mulberry32) + normal padrão (Box–Muller com cache).
export class Rng {
  private s: number;
  private spare: number | null = null;
  constructor(seed = 1234567) { this.s = seed >>> 0; }
  uniform(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = this.uniform();
    v = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
}

export const logit = (p: number) => { const q = Math.min(1 - 1e-9, Math.max(1e-9, p)); return Math.log(q / (1 - q)); };
export const invLogit = (x: number) => 1 / (1 + Math.exp(-x));

export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
