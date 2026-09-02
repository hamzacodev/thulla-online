/**
 * Card sounds. The table noises — shuffle, deal, tap — are synthesised: they
 * fire dozens of times a game, a sampled click gets grating fast, and a few
 * oscillators cover them with no assets to download and nothing to 404.
 *
 * The thulla is the exception. It happens a handful of times a game and it is
 * the moment everyone looks up for, so it plays real recordings, with the
 * oscillator versions kept as the stand-in for a browser that won't decode
 * them or a clip that hasn't finished downloading.
 *
 * The context is created lazily on the first real user gesture, which is what
 * browser autoplay policies require; before that every call is a no-op.
 */

import { holdFor, pickThullaClip, THULLA_CLIPS } from "./thullaClips";

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
const THULLA_JOKES: Array<() => number> = [
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
    return 1020;
  },
  // Slide whistle, all the way down.
  () => {
    glide(1500, 240, 0.65, 0.055);
    return 650;
  },
  // Boing.
  () => {
    wobble(210, 0.55, 0.075, 130, 13);
    return 550;
  },
  // Party horn, deflating on the second toot.
  () => {
    glide(450, 415, 0.17, 0.07, "square");
    setTimeout(() => glide(415, 280, 0.34, 0.07, "square"), 200);
    return 540;
  },
  // Splat — a low raspberry with a bit of noise on top.
  () => {
    wobble(95, 0.42, 0.09, 45, 24, "sawtooth");
    noiseBurst(0.22, 420, 0.09, "lowpass");
    return 420;
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


/** Decoded and reusable. A miss here is not an error — the synth covers. */
const clips = new Map<string, AudioBuffer>();
let clipsRequested = false;

function loadClips() {
  const c = ensureContext();
  if (!c || clipsRequested) return;
  clipsRequested = true;

  for (const { url } of THULLA_CLIPS) {
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

/**
 * Plays a decoded clip and reports how long it runs, in milliseconds.
 * 0 means it didn't play — not ready, not decodable, sound off — so the
 * caller can fall back rather than sit in silence waiting for nothing.
 */
function playClip(url: string, gain = 0.5): number {
  const c = ensureContext();
  const buffer = clips.get(url);
  if (!c || !enabled || !buffer) return 0;
  try {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const vol = c.createGain();
    vol.gain.value = gain;
    src.connect(vol).connect(c.destination);
    src.start();
    return Math.round(buffer.duration * 1000);
  } catch {
    return 0;
  }
}

/**
 * When the current announcement finishes.
 *
 * The clips run from 1.2 to 5.1 seconds, so nothing downstream can assume a
 * length: the banner has to stay up exactly as long as the sound, and the
 * table has to wait for both before moving on. Everything reads it from
 * here rather than each guessing its own timeout.
 */
let busyUntil = 0;

export function soundBusyMs(): number {
  return Math.max(0, busyUntil - Date.now());
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
  /**
   * The thulla gag. Returns how long it runs for, in milliseconds.
   *
   * With a `seed` — `gameId:trickNumber` — the clip is chosen from the trick
   * rather than at random, so everyone at an online table hears the same one
   * and the server can hold the pile for exactly that long without knowing
   * anything about audio. Without a seed it just avoids repeating itself.
   *
   * The reported length is always the chosen clip's, even when the
   * synthesised stand-in plays: the banner and the table are timed off the
   * same number across every device, and a browser that couldn't decode the
   * file shouldn't get a shorter turn than everyone else.
   */
  thulla(seed?: string): number {
    let i: number;
    if (seed) {
      i = THULLA_CLIPS.indexOf(pickThullaClip(seed));
    } else {
      i = Math.floor(Math.random() * THULLA_CLIPS.length);
      if (i === lastJoke) i = (i + 1) % THULLA_CLIPS.length;
    }
    lastJoke = i;

    if (enabled) {
      loadClips();
      if (!playClip(THULLA_CLIPS[i].url)) THULLA_JOKES[i % THULLA_JOKES.length]();
    }

    // The hold, not the clip: the shortest gag gets a floor so the banner
    // isn't gone the moment it lands, and the table waits out whichever of
    // the two runs longer.
    //
    // Timed the same with the sound off. Muting shouldn't change the pace of
    // the game — and online it can't, because the server holds the pile for
    // this long whatever any one player has their volume set to.
    const ms = holdFor(THULLA_CLIPS[i].ms);
    busyUntil = Date.now() + ms;
    return ms;
  },
};
