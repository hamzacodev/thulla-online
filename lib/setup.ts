"use client";

import { cpuName } from "./engine/ai";
import type { Difficulty } from "./engine/types";
import { MAX_PLAYERS, MIN_PLAYERS } from "./engine/rules";
import { readLocal } from "./localKeys";

export interface TableSetup {
  playerCount: number;
  difficulty: Difficulty;
  names: string[]; // index 0 is the human
  /**
   * Match length. 1 is a single game. Belongs to the match rather than the
   * player, so it lives here and not in the account's settings.
   */
  bestOf?: number;
}

const KEY = "thulla.setup.v1";

export const PLAYER_COUNTS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i
);

export function defaultNames(count: number, humanName: string): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? humanName : cpuName(i - 1)));
}

export function defaultSetup(humanName = "You"): TableSetup {
  return { playerCount: 4, difficulty: "medium", names: defaultNames(4, humanName) };
}

export function saveSetup(setup: TableSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    /* the game still starts, it just won't be remembered next time */
  }
}

export function loadSetup(): TableSetup | null {
  try {
    const raw = readLocal(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TableSetup;
    if (
      !parsed ||
      typeof parsed.playerCount !== "number" ||
      parsed.playerCount < MIN_PLAYERS ||
      parsed.playerCount > MAX_PLAYERS ||
      !Array.isArray(parsed.names) ||
      parsed.names.length !== parsed.playerCount
    ) {
      return null;
    }
    return { ...parsed, bestOf: parsed.bestOf ?? 1 };
  } catch {
    return null;
  }
}
