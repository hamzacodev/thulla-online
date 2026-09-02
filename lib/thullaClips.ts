/**
 * The thulla soundtrack, as data.
 *
 * Deliberately free of browser APIs: the table needs these lengths too, and
 * some of that code runs on the server. Everything about *when* a thulla is
 * announced derives from this one table, because the alternative — a banner
 * on one timer, a sound of its own length, and a pile clearing on a third —
 * is what made the three drift apart.
 *
 * `ms` is the real decoded length of each file (`afinfo`), rounded up a
 * little. Re-measure it if you replace a file.
 */
export interface ThullaClip {
  url: string;
  ms: number;
}

export const THULLA_CLIPS: ThullaClip[] = [
  { url: "/sounds/dun-dun-dun.mp3", ms: 5150 },
  { url: "/sounds/sad-violin.m4a", ms: 4560 },
  { url: "/sounds/cat-laugh.m4a", ms: 3640 },
  { url: "/sounds/faaah.m4a", ms: 1930 },
  { url: "/sounds/thud.m4a", ms: 1260 },
];

/** Breathing room after the sound stops, before the table moves on. */
export const THULLA_TAIL_MS = 350;

/**
 * A floor, so the shortest gag still gets a moment.
 *
 * The thud is 1.3 seconds. Timed strictly to it the banner would be gone
 * almost as soon as it landed, which reads as the pop-up being cut off
 * rather than the sound being short. The sound is over well inside this;
 * the banner is what's still up.
 */
export const THULLA_MIN_MS = 2400;

/** djb2. Small, stable, and identical on the server and the client. */
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (h * 33) ^ seed.charCodeAt(i);
  return h >>> 0;
}

/**
 * Which gag this thulla gets.
 *
 * Chosen from the trick rather than at random so that everyone at an online
 * table hears the same one, and — more importantly — so the server can work
 * out how long to hold the pile without knowing anything about audio. Same
 * seed, same clip, same length, on every device.
 */
export function pickThullaClip(seed: string): ThullaClip {
  return THULLA_CLIPS[hash(seed) % THULLA_CLIPS.length];
}

/**
 * How long the banner stays up, and the table sits still, for this thulla.
 *
 * The one number the whole feature is timed off: the banner's fade is
 * scheduled from it, the single-player table waits it out before clearing
 * the pile, and the server hands the same value to every client in a room.
 */
export function thullaHoldMs(seed: string): number {
  return holdFor(pickThullaClip(seed).ms);
}

export function holdFor(clipMs: number): number {
  return Math.max(clipMs, THULLA_MIN_MS) + THULLA_TAIL_MS;
}
