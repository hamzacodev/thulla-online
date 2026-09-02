/**
 * The thulla banner, its sound and the table all have to agree on one length.
 *
 * They used to disagree three ways: a banner fixed at 3.9s, clips running
 * 1.3s to 5.2s, and a pile that cleared after 1.5s — in single player the
 * sound didn't even start until the pile cleared. Everything now derives from
 * `thullaHoldMs(gameId:trickNumber)`, so what's worth testing is that the
 * client and the server, which compute it independently and never talk about
 * audio, land on the same number for the same trick.
 */
import "./_env";

import { applyPlay, createGame, legalMoves, resolveTrick, thullaEvent } from "../lib/engine/rules";
import type { GameState } from "../lib/engine/types";
import { markTrickEnd } from "../lib/roomFlow";
import type { RoomState } from "../lib/roomTypes";
import { holdFor, pickThullaClip, THULLA_CLIPS, THULLA_MIN_MS, thullaHoldMs } from "../lib/thullaClips";

let pass = 0;
let fail = 0;
function check(ok: boolean, what: string) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${what}`);
  }
}

// ---- the table itself -------------------------------------------------

check(THULLA_CLIPS.length === 5, "all five gags are wired up");
check(
  THULLA_CLIPS.every((c) => c.url.startsWith("/sounds/") && c.ms > 0),
  "every clip has a path and a measured length"
);
check(
  new Set(THULLA_CLIPS.map((c) => c.url)).size === THULLA_CLIPS.length,
  "no clip is listed twice"
);

// Same trick, same gag — every time, on every device.
for (const seed of ["g1:0", "g1:7", "abc-def:12"]) {
  check(pickThullaClip(seed).url === pickThullaClip(seed).url, `seed ${seed} is stable`);
  check(thullaHoldMs(seed) === thullaHoldMs(seed), `hold for ${seed} is stable`);
}

// Different tricks spread across the gags rather than favouring one.
const counts = new Map<string, number>();
for (let i = 0; i < 20_000; i++) {
  const url = pickThullaClip(`game-${i}:${i % 13}`).url;
  counts.set(url, (counts.get(url) ?? 0) + 1);
}
check(counts.size === THULLA_CLIPS.length, "every gag comes up");
check(
  [...counts.values()].every((n) => n > 20_000 / THULLA_CLIPS.length / 2),
  "no gag is starved"
);

// The hold covers the sound, with a floor so the shortest isn't cut off.
for (const c of THULLA_CLIPS) {
  check(holdFor(c.ms) >= c.ms, `${c.url} is not cut off by its own hold`);
  check(holdFor(c.ms) >= THULLA_MIN_MS, `${c.url} is on screen long enough to read`);
}

// ---- client and server, agreeing without talking ----------------------

function deal(seed: number): GameState {
  return createGame({
    players: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "cpu" as const })),
    config: { seed },
  });
}

/** Plays legal cards until a trick ends in a pickup. */
function playToThulla(seed: number): GameState | null {
  let s = deal(seed);
  for (let guard = 0; guard < 5_000; guard++) {
    if (s.phase === "finished") return null;
    if (s.phase === "trickEnd") {
      if (s.trickOutcome?.kind === "pickup") return s;
      s = resolveTrick(s);
      continue;
    }
    const card = legalMoves(s, s.turnSeat)[0];
    if (!card) return null;
    const res = applyPlay(s, s.turnSeat, card);
    if (res.error) return null;
    s = res.state;
  }
  return null;
}

let checked = 0;
for (let seed = 1; seed <= 400 && checked < 120; seed++) {
  const state = playToThulla(seed);
  if (!state) continue;
  checked++;

  // What the browser does: seeds off the engine's thulla event.
  const event = thullaEvent(state);
  if (!event) {
    check(false, `seed ${seed} reached a pickup but produced no thulla event`);
    continue;
  }
  const clientSeed = `${state.gameId}:${event.trickNumber}`;
  const bannerMs = thullaHoldMs(clientSeed);

  // What the server does: seeds off the room's game, never touching audio.
  const room = { game: state, trickEndsAt: null } as unknown as RoomState;
  const now = 1_000_000;
  markTrickEnd(room, now);
  const tableMs = (room.trickEndsAt ?? 0) - now;

  check(tableMs === bannerMs, `seed ${seed}: table holds ${tableMs}ms, banner ${bannerMs}ms`);
  check(
    tableMs >= pickThullaClip(clientSeed).ms,
    `seed ${seed}: the pile outlasts the sound playing over it`
  );
}
check(checked >= 50, `found enough thullas to test (${checked})`);

// A trick nobody picked up keeps the short linger — only thullas hold long.
for (let seed = 1; seed <= 60; seed++) {
  let s = deal(seed);
  let found = false;
  for (let guard = 0; guard < 400 && !found; guard++) {
    if (s.phase === "finished") break;
    if (s.phase === "trickEnd") {
      if (s.trickOutcome?.kind === "discard") {
        const room = { game: s, trickEndsAt: null } as unknown as RoomState;
        markTrickEnd(room, 0);
        check((room.trickEndsAt ?? 0) === 1800, `seed ${seed}: an ordinary trick still clears in 1.8s`);
        found = true;
        break;
      }
      s = resolveTrick(s);
      continue;
    }
    const card = legalMoves(s, s.turnSeat)[0];
    if (!card) break;
    const res = applyPlay(s, s.turnSeat, card);
    if (res.error) break;
    s = res.state;
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
