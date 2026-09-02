"use client";

import { useEffect, useRef, useState } from "react";
import { thullaEvent } from "./engine/rules";
import type { GameState } from "./engine/types";
import { sfx } from "./sound";
import { thullaHoldMs } from "./thullaClips";

export interface ThullaNotice {
  /** `gameId:trickNumber` — one thulla per trick, so this is the dedupe key. */
  key: string;
  name: string;
  isYou: boolean;
  count: number;
  /** How long the banner stays up: exactly as long as the sound runs. */
  ms: number;
}

/**
 * Turns the engine's thulla event into a notice, and plays the gag.
 *
 * The sound lives here rather than at the call sites because they are one
 * event, and splitting them is what let them drift: the banner ran on a fixed
 * 3.9s timer while the clips run anywhere from 1.3s to 5.2s, and in single
 * player the sound didn't even start until the pile cleared a second and a
 * half later. One call, one length, no drift — the banner is up for exactly
 * as long as you can hear it.
 *
 * The engine decides *whether* a thulla happened (`thullaEvent`); this
 * decides how it lands. Each event fires exactly once: the key is recorded
 * before the notice is set, so re-renders, repeated realtime payloads
 * carrying the same state, or several effect passes over one `trickEnd`
 * can't produce a second pop-up — or a second sound over the first.
 */
export function useThulla(state: GameState | null, viewSeat: number): ThullaNotice | null {
  const [notice, setNotice] = useState<ThullaNotice | null>(null);
  const seen = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state) return;
    const event = thullaEvent(state);
    if (!event) return;

    const key = `${state.gameId}:${event.trickNumber}`;
    if (seen.current === key) return;
    seen.current = key;

    const collector = state.players[event.collectorSeat];
    if (!collector) return;

    // Seeded from the trick, so everyone at an online table gets the same
    // gag and the server can hold the pile for exactly its length.
    // `|| thullaHoldMs` covers sound being off: the banner is the same
    // length either way, it just plays to an empty room.
    const ms = sfx.thulla(key) || thullaHoldMs(key);

    // Reacting to a one-shot engine event; the ref guard above is what
    // makes this fire exactly once per thulla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice({
      key,
      name: collector.name,
      isYou: event.collectorSeat === viewSeat,
      count: event.cards.length,
      ms,
    });

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), ms);
  }, [state, viewSeat]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return notice;
}
