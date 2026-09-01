/**
 * Card sounds, synthesised rather than shipped as audio files — a shuffle is
 * filtered noise and a deal is a short click, so a few oscillators cover the
 * whole game with no assets to download and nothing to 404.
 *
 * The context is created lazily on the first real user gesture, which is what
 * browser autoplay policies require; before that every call is a no-op.
 */

let ctx: AudioContext | null = null;
let enabled = true;

type Ctor = typeof AudioContext;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Impl: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Impl) return null;
  try {
    ctx = new Impl();
  } catch {
    return null;
  }
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Call from a click/tap handler once, to unlock audio on iOS. */
export function primeAudio() {
  const c = ensureContext();
  if (c && c.state === "suspended") void c.resume();
}

function noiseBurst(duration: number, freq: number, gainValue: number, type: BiquadFilterType = "bandpass") {
  const c = ensureContext();
  if (!c || !enabled) return;
  const frames = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying white noise — the envelope is what makes it read as "paper".
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const gain = c.createGain();
  gain.gain.value = gainValue;
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
  src.stop(c.currentTime + duration);
}

function tone(freq: number, duration: number, gainValue: number, type: OscillatorType = "sine") {
  const c = ensureContext();
  if (!c || !enabled) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(gainValue, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const sfx = {
  shuffle() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => noiseBurst(0.13, 1500 + Math.random() * 900, 0.16), i * 95);
    }
  },
  deal() {
    noiseBurst(0.07, 2400, 0.13);
  },
  playCard() {
    noiseBurst(0.09, 1100, 0.2);
  },
  pickup() {
    for (let i = 0; i < 4; i++) setTimeout(() => noiseBurst(0.08, 900 + i * 180, 0.13), i * 55);
  },
  click() {
    tone(660, 0.045, 0.06, "triangle");
  },
  invalid() {
    tone(180, 0.14, 0.09, "sawtooth");
  },
  trickWon() {
    tone(680, 0.1, 0.07, "triangle");
    setTimeout(() => tone(910, 0.14, 0.06, "triangle"), 85);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.07, "triangle"), i * 105));
  },
  bhabhi() {
    [440, 392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.26, 0.07, "sine"), i * 135));
  },
};
