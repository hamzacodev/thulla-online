/**
 * A best-of series: a parent record that owns several individual games.
 *
 * Deliberately game-agnostic. It knows nothing about tricks, claims, decks
 * or suits — only that games finish and somebody wins them. That is what
 * lets Thulla and Bluff share it while their engines stay completely
 * separate, and what will let a third game use it without changes.
 */

export type SeriesGameId = "thulla" | "bluff";
export type SeriesStatus = "active" | "completed";

export interface SeriesPlayer {
  /** Stable within the series: a seat id offline, a user id online. */
  id: string;
  name: string;
  wins: number;
}

/** One finished game inside the series. Never overwritten. */
export interface SeriesGame {
  gameNumber: number;
  /** The individual game's own id — the link back to its full record. */
  gameId: string;
  winnerId: string | null;
  winnerName: string | null;
  completedAt: number;
}

export interface SeriesState {
  version: 1;
  id: string;
  /** Which game this is a series of. */
  game: SeriesGameId;
  /** Odd, and 1 means a single game rather than a series. */
  bestOf: number;
  /** floor(bestOf / 2) + 1. Stored so a reader never has to recompute it. */
  winsRequired: number;
  status: SeriesStatus;
  /** The game being played, or about to be. 1-based. */
  currentGameNumber: number;
  gamesPlayed: number;
  players: SeriesPlayer[];
  games: SeriesGame[];
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SeriesResult {
  series: SeriesState;
  error?: string;
}
