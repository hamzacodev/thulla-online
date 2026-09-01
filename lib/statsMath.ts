import type { Difficulty } from "./engine/types";

/* ============================================================
   Types
   ============================================================ */

export type GameMode = "cpu" | "friends";
export type PlayerResult = "win" | "bhabhi" | "placed";
export type HistoryFilter = "all" | "wins" | "losses" | "bhabhi" | "cpu" | "friends";
export type HistorySort = "newest" | "oldest";

export interface HistoryPlayer {
  /** Auth user id for real players; null for CPUs. */
  playerId: string | null;
  name: string;
  type: "human" | "cpu" | "remote";
  /** 0-based finishing place. 0 won; the highest is the Bhabhi. */
  position: number;
  result: PlayerResult;
}

export interface GameRecord {
  id: string;
  gameId: string;
  mode: GameMode;
  playerCount: number;
  cpuDifficulty: Difficulty | null;
  players: HistoryPlayer[];
  winnerName: string | null;
  bhabhiName: string | null;
  myPosition: number;
  isWin: boolean;
  isBhabhi: boolean;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string;
}

export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  bhabhi: number;
  cpuGames: number;
  friendGames: number;
  currentWinStreak: number;
  currentLossStreak: number;
  bestWinStreak: number;
  bestLossStreak: number;
}

export const EMPTY_STATS: PlayerStats = {
  games: 0, wins: 0, losses: 0, bhabhi: 0, cpuGames: 0, friendGames: 0,
  currentWinStreak: 0, currentLossStreak: 0, bestWinStreak: 0, bestLossStreak: 0,
};

/**
 * Win percentage, or null when there's nothing to divide by. Callers render
 * null as "—" — never NaN, Infinity, or a misleading 0%.
 */
export function winRate(stats: PlayerStats): number | null {
  if (stats.games === 0) return null;
  return Math.round((stats.wins / stats.games) * 1000) / 10;
}

export function formatWinRate(stats: PlayerStats): string {
  const r = winRate(stats);
  return r === null ? "—" : `${r.toFixed(1)}%`;
}

/* ============================================================
   Pure stats — the same rules the SQL function implements, used for
   signed-out players whose record lives only in this browser.
   ============================================================ */

export function computeStats(records: GameRecord[]): PlayerStats {
  // Newest first, so the leading run is the current streak.
  const ordered = [...records].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const s: PlayerStats = { ...EMPTY_STATS };

  let runWin = 0;
  let runLoss = 0;
  let currentRun = 0;
  let currentIsWin: boolean | null = null;
  let currentClosed = false;

  for (const r of ordered) {
    s.games += 1;
    if (r.isWin) s.wins += 1;
    if (r.isBhabhi) s.bhabhi += 1;
    if (r.mode === "cpu") s.cpuGames += 1;
    else s.friendGames += 1;

    if (currentIsWin === null) currentIsWin = r.isWin;
    if (!currentClosed) {
      if (r.isWin === currentIsWin) currentRun += 1;
      else currentClosed = true;
    }

    if (r.isWin) {
      runWin += 1;
      runLoss = 0;
      if (runWin > s.bestWinStreak) s.bestWinStreak = runWin;
    } else {
      runLoss += 1;
      runWin = 0;
      if (runLoss > s.bestLossStreak) s.bestLossStreak = runLoss;
    }
  }

  s.losses = s.games - s.wins;
  s.currentWinStreak = currentIsWin === true ? currentRun : 0;
  s.currentLossStreak = currentIsWin === false ? currentRun : 0;
  return s;
}

export function applyFilter(records: GameRecord[], filter: HistoryFilter): GameRecord[] {
  switch (filter) {
    case "wins": return records.filter((r) => r.isWin);
    case "losses": return records.filter((r) => !r.isWin);
    case "bhabhi": return records.filter((r) => r.isBhabhi);
    case "cpu": return records.filter((r) => r.mode === "cpu");
    case "friends": return records.filter((r) => r.mode === "friends");
    default: return records;
  }
}

/** The parts of a finished game the local store needs to keep one. */
export type LocalRecordInput = Omit<GameRecord, "id" | "completedAt">;

/* ============================================================
   Local store — signed-out players. Capped so a long-running browser
   can't fill its storage quota with history.
   ============================================================ */

const LOCAL_KEY = "bhabhi.history.v1";
const LOCAL_CAP = 300;

export function readLocalHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GameRecord[]) : [];
  } catch {
    return [];
  }
}

/** Idempotent on `gameId`, so a re-render or refresh can't double-count. */
export function saveLocalRecord(payload: LocalRecordInput): GameRecord[] {
  const existing = readLocalHistory();
  if (existing.some((r) => r.gameId === payload.gameId)) return existing;

  const record: GameRecord = {
    ...payload,
    id: payload.gameId,
    completedAt: new Date().toISOString(),
  };
  const next = [record, ...existing].slice(0, LOCAL_CAP);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    /* quota — the game still finished, we just can't keep the record */
  }
  return next;
}
