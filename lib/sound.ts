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
  // A real tap: allowed to make noise, and a good moment to fetch the clips.
  loadClips();
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

/**
 * A tone that slides from one pitch to another. Most comedy sounds are a
 * pitch bend and not much else — a trombone, a slide whistle and a honk are
 * all the same trick at different speeds.
 */
function glide(
  from: number,
  to: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "sine"
) {
  const c = ensureContext();
  if (!c || !enabled) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, c.currentTime);
  // Exponential ramps can't reach zero, hence the floor.
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + duration);
  gain.gain.setValueAtTime(gainValue, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

/** A tone with a second oscillator wobbling its pitch — boings and splats. */
function wobble(
  freq: number,
  duration: number,
  gainValue: number,
  depth: number,
  rate: number,
  type: OscillatorType = "triangle"
) {
  const c = ensureContext();
  if (!c || !enabled) return;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const gain = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(rate, c.currentTime);
  lfoGain.gain.setValueAtTime(depth, c.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.setValueAtTime(gainValue, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);

  osc.start();
  lfo.start();
  osc.stop(c.currentTime + duration);
  lfo.stop(c.currentTime + duration);
}

/**
 * Five ways to laugh at somebody. Picked at random so the joke doesn't wear
 * out — a thulla happens several times a game, and the same noise every time
 * stops being funny by the third trick.
 */
const THULLA_JOKES: Array<() => void> = [
  // Sad trombone: three notes down, the last one sagging.
  () => {
    const steps: Array<[number, number]> = [
      [330, 294],
      [294, 262],
      [262, 185],
    ];
    steps.forEach(([from, to], i) =>
      setTimeout(() => glide(from, to, i === 2 ? 0.6 : 0.24, 0.08, "sawtooth"), i * 210)
    );
  },
  // Slide whistle, all the way down.
  () => glide(1500, 240, 0.65, 0.055),
  // Boing.
  () => wobble(210, 0.55, 0.075, 130, 13),
  // Party horn, deflating on the second toot.
  () => {
    glide(450, 415, 0.17, 0.07, "square");
    setTimeout(() => glide(415, 280, 0.34, 0.07, "square"), 200);
  },
  // Splat — a low raspberry with a bit of noise on top.
  () => {
    wobble(95, 0.42, 0.09, 45, 24, "sawtooth");
    noiseBurst(0.22, 420, 0.09, "lowpass");
  },
];

/**
 * The real recordings, for the one moment that earns them.
 *
 * Only the thulla. Shuffles, deals and card taps stay synthesised because
 * they fire dozens of times a game and a sampled click gets grating fast —
 * and because a few oscillators cost nothing to download, which matters on
 * a phone mid-game.
 *
 * Fetched lazily on the first real tap rather than at page load: somebody
 * who never turns the sound on never pays for them.
 */
const THULLA_CLIPS = [
  "/sounds/dun-dun-dun.mp3",
  "/sounds/sad-violin.m4a",
  "/sounds/cat-laugh.m4a",
  "/sounds/faaah.m4a",
  "/sounds/thud.m4a",
];

/** Decoded and reusable. A miss here is not an error — the synth covers. */
const clips = new Map<string, AudioBuffer>();
let clipsRequested = false;

function loadClips() {
  const c = ensureContext();
  if (!c || clipsRequested) return;
  clipsRequested = true;

  for (const url of THULLA_CLIPS) {
    fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((buf) => c.decodeAudioData(buf))
      .then((decoded) => clips.set(url, decoded))
      .catch(() => {
        // Blocked, offline, or a format this browser won't decode. The
        // oscillator version of the same gag plays instead.
      });
  }
}

/** Plays a decoded clip. Returns false when it isn't ready, so a caller can
 *  fall back rather than play nothing. */
function playClip(url: string, gain = 0.5): boolean {
  const c = ensureContext();
  const buffer = clips.get(url);
  if (!c || !enabled || !buffer) return false;
  try {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const vol = c.createGain();
    vol.gain.value = gain;
    src.connect(vol).connect(c.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

/** Avoids repeating the same gag twice running. */
let lastJoke = -1;

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
  /**
   * Somebody just ate the pile. One of five, never the same twice running.
   *
   * A real recording when it has arrived, the synthesised version of the
   * same gag when it hasn't — so the first thulla of a session is never
   * silent just because a file was still downloading.
   */
  thulla() {
    if (!enabled) return;
    loadClips();

    let i = Math.floor(Math.random() * THULLA_JOKES.length);
    if (i === lastJoke) i = (i + 1) % THULLA_JOKES.length;
    lastJoke = i;

    if (playClip(THULLA_CLIPS[i])) return;
    THULLA_JOKES[i]();
  },
};
