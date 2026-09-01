"use client";

import { useEffect, useRef, useState } from "react";
import { thullaEvent } from "./engine/rules";
import type { GameState } from "./engine/types";

/** Pop, bounce, hold, fade — must match the thulla-pop keyframes. */
export const THULLA_DURATION_MS = 1900;

export interface ThullaNotice {
  /** `gameId:trickNumber` — one thulla per trick, so this is the dedupe key. */
  key: string;
  name: string;
  isYou: boolean;
  count: number;
}

/**
 * Turns the engine's thulla event into a short-lived notice.
 *
 * The engine decides *whether* a thulla happened (`thullaEvent`); this only
 * decides how long to show it. Each event fires exactly once: the key is
 * recorded before the notice is set, so re-renders, repeated realtime
 * payloads carrying the same state, or several effect passes over one
 * `trickEnd` can't produce a second pop-up.
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

    // Reacting to a one-shot engine event; the ref guard above is what
    // makes this fire exactly once per thulla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice({
      key,
      name: collector.name,
      isYou: event.collectorSeat === viewSeat,
      count: event.cards.length,
    });

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), THULLA_DURATION_MS);
  }, [state, viewSeat]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return notice;
}
