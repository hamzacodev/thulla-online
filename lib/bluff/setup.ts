"use client";

import { readLocal } from "../localKeys";
import { MAX_DECKS, MIN_DECKS } from "./cards";
import { MAX_PLAYERS, MIN_PLAYERS } from "./rules";
import type { BluffDifficulty } from "./types";

export interface BluffTableSetup {
  playerCount: number;
  deckCount: number;
  difficulty: BluffDifficulty;
  names: string[];
}

/**
 * Bluff's own setup bucket — separate from Thulla's, so choosing three
 * decks here can't reach across and change anything about a Thulla table.
 */
const KEY = "thulla.bluff.setup.v1";

export function saveBluffSetup(setup: BluffTableSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    /* the game still starts, it just won't be remembered */
  }
}

export function loadBluffSetup(): BluffTableSetup | null {
  try {
    const raw = readLocal(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BluffTableSetup;
    if (
      !parsed ||
      !Number.isInteger(parsed.playerCount) ||
      parsed.playerCount < MIN_PLAYERS ||
      parsed.playerCount > MAX_PLAYERS ||
      !Number.isInteger(parsed.deckCount) ||
      parsed.deckCount < MIN_DECKS ||
      parsed.deckCount > MAX_DECKS ||
      !Array.isArray(parsed.names) ||
      parsed.names.length < parsed.playerCount
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
