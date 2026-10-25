// Efeitos sonoros 8-bit via WebAudio (mudo por padrão).

let ctx: AudioContext | null = null;
let muted = true;
try { muted = localStorage.getItem('qg-sound') !== 'on'; } catch { /* sem storage */ }

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06): void {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    try { localStorage.setItem('qg-sound', m ? 'off' : 'on'); } catch { /* ignore */ }
    if (!m) this.coin();
  },
  coin() { tone(988, 0, 0.08); tone(1319, 0.08, 0.25); },
  milestone() { tone(660, 0, 0.06); tone(880, 0.06, 0.12); },
  lead() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.12)); },
  call() {
    const seq = [523, 523, 523, 698, 880, 784, 1047];
    seq.forEach((f, i) => tone(f, i * 0.13, i === seq.length - 1 ? 0.6 : 0.11, 'square', 0.07));
    seq.forEach((f, i) => tone(f / 2, i * 0.13, 0.11, 'triangle', 0.05));
  },
  fight() { tone(220, 0, 0.1, 'sawtooth', 0.05); tone(330, 0.1, 0.1, 'sawtooth', 0.05); tone(440, 0.2, 0.3, 'square', 0.06); },
};
