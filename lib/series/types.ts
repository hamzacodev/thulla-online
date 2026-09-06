/**
 * A best-of series: a parent record that owns several individual games.
 *
 * Deliberately game-agnostic. It knows nothing about tricks, claims, decks
 * or suits — only that games finish and somebody wins them. That is what
 * lets Thulla, Bluff and Trump-Patta share it while their engines stay
 * completely separate: adding the third game needed one word here and
 * nothing at all in `rules.ts`.
 */

export type SeriesGameId = "thulla" | "bluff" | "trump_patta";
export type SeriesStatus = "active" | "completed";

export interface SeriesPlayer {
  /**
   * Stable for the whole series, and deliberately not the seat number —
   * seats are reshuffled between games, so a seat identifies a chair rather
   * than a person.
   */
  id: string;
  name: string;
  wins: number;
  /**
   * The game number they joined for. 1 for everyone who started the series;
   * higher for anyone who sat down later.
   *
   * Optional so a series stored before latecomers existed still loads — a
   * missing value means "was here from the start", which it was. Without
   * this, a player who joined for game 4 looks like someone who played the
   * first three and was never placed in them, and the audit rightly
   * complains about it.
   */
  joinedAtGame?: number;
  /**
   * How often they finished in each place: index 0 is firsts, 1 is seconds,
   * and so on. `wins` is placings[0], kept separately because it decides
   * the series and everything else is colour.
   */
  placings: number[];
}

/** One finished game inside the series. Never overwritten. */
export interface SeriesGame {
  gameNumber: number;
  /** The individual game's own id — the link back to its full record. */
  gameId: string;
  /** Everyone, best first. The winner is simply the head of it. */
  order: string[];
  winnerId: string | null;
  winnerName: string | null;
  completedAt: number;
}

export interface SeriesState {
  /** 2 added per-place tallies and the full finishing order per game. */
  version: 2;
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
