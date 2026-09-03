"use client";

import { readLocal } from "../localKeys";
import { MAX_PLAYERS, MIN_PLAYERS } from "./rules";
import type { TrumpPattaDifficulty } from "./types";

export interface TrumpPattaTableSetup {
  playerCount: number;
  difficulty: TrumpPattaDifficulty;
  names: string[];
  /**
   * How long the match is. 1 is a single game. The format belongs to the
   * match rather than to the player, so it is chosen here per table and
   * never remembered as an account preference.
   */
  bestOf?: number;
}

/** Trump-Patta's own bucket, separate from Thulla's and Bluff's. */
const KEY = "thulla.trump_patta.setup.v1";

export function saveTrumpPattaSetup(setup: TrumpPattaTableSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    /* the game still starts, it just won't be remembered */
  }
}

export function loadTrumpPattaSetup(): TrumpPattaTableSetup | null {
  try {
    const raw = readLocal(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrumpPattaTableSetup;
    if (
      !parsed ||
      !Number.isInteger(parsed.playerCount) ||
      parsed.playerCount < MIN_PLAYERS ||
      parsed.playerCount > MAX_PLAYERS ||
      !Array.isArray(parsed.names) ||
      parsed.names.length < parsed.playerCount
    ) {
      return null;
    }
    return { ...parsed, bestOf: parsed.bestOf ?? 1 };
  } catch {
    return null;
  }
}
