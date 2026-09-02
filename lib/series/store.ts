"use client";

import { readLocal } from "../localKeys";
import type { SeriesGameId, SeriesState } from "./types";

/**
 * Where a single-player series lives between games.
 *
 * One bucket per game, so a Bluff series and a Thulla series can be running
 * at the same time without touching each other. Online series don't come
 * through here — those live in the room's own state, which the server owns.
 */
function keyFor(game: SeriesGameId): string {
  return `thulla.series.${game}.v1`;
}

export function loadSeries(game: SeriesGameId): SeriesState | null {
  try {
    const raw = readLocal(keyFor(game));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeriesState;
    if (parsed?.version !== 1 || parsed.game !== game) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSeries(series: SeriesState) {
  try {
    localStorage.setItem(keyFor(series.game), JSON.stringify(series));
  } catch {
    /* the game still plays; the series just won't survive a refresh */
  }
}

export function clearSeries(game: SeriesGameId) {
  try {
    localStorage.removeItem(keyFor(game));
  } catch {
    /* nothing to clear */
  }
}
