import type { BluffCard, Rank } from "./cards";

export type BluffDifficulty = "easy" | "medium" | "hard";
export type BluffMode = "cpu" | "friends";

/**
 * `claiming` — someone owes the table a play.
 * `challenge` — a claim is on the table and everyone else may call it.
 * `reveal`    — a challenge landed; the cards are face-up while it's shown.
 * `finished`  — one player left holding cards.
 */
export type BluffPhase = "claiming" | "challenge" | "reveal" | "finished";

export interface BluffPlayerStats {
  bluffsCalled: number;
  successfulCalls: number;
  failedCalls: number;
  /** Lies that survived — a false claim nobody challenged. */
  successfulBluffs: number;
  timesCaught: number;
}

export interface BluffPlayer {
  seat: number;
  id: string;
  name: string;
  kind: "human" | "cpu" | "remote";
  hand: BluffCard[];
  /** Set when they get rid of everything. 0 is the winner. */
  finishedRank: number | null;
  stats: BluffPlayerStats;
}

export interface BluffClaim {
  seat: number;
  rank: Rank;
  /** The cards actually played. Face-down to everyone but the engine. */
  cards: BluffCard[];
  /** Seats that have declined to challenge this claim. */
  passed: number[];
  /** Whether the cards match the claim. Never shown until a reveal. */
  truthful: boolean;
}

export interface ChallengeOutcome {
  challengerSeat: number;
  claimSeat: number;
  rank: Rank;
  /** Revealed, face-up, for the length of the reveal. */
  cards: BluffCard[];
  /** True when the claim was a lie and the challenge was right. */
  caught: boolean;
  /** Whoever ends up holding the pile. */
  collectorSeat: number;
  pileSize: number;
}

export interface BluffConfig {
  playerCount: number;
  deckCount: number;
  mode: BluffMode;
  difficulty: BluffDifficulty;
  /**
   * Locks a round to the rank its first play named, so everybody after has
   * to claim the same thing whether they hold it or not.
   *
   * Off, because the simulation showed it doesn't terminate: at eight
   * players with three decks almost every play is a forced lie, piles come
   * straight back, and hands never shrink — 20,000 turns in, nobody had got
   * near going out. Free choice keeps the bluffing (dumping four cards at
   * once still means lying about most of them) and games actually end.
   * Kept as a flag because it is the classic rule and worth revisiting.
   */
  lockRankPerRound: boolean;
  seed: number;
}

export interface BluffState {
  version: 1;
  gameId: string;
  config: BluffConfig;
  players: BluffPlayer[];
  phase: BluffPhase;
  turnSeat: number;
  /** Face-down, in the middle. Only the engine knows what's in it. */
  pile: BluffCard[];
  /** The rank this round is locked to, once someone has opened it. */
  roundRank: Rank | null;
  /** The claim awaiting a challenge, when phase is `challenge`. */
  claim: BluffClaim | null;
  /** Set during `reveal`, and kept afterwards so the UI can narrate it. */
  outcome: ChallengeOutcome | null;
  /** Seats in the order they got rid of everything. Earlier is better. */
  finishOrder: number[];
  winnerSeat: number | null;
  /** The one left holding cards when everybody else is out. */
  lastSeat: number | null;
  startedAt: number;
  updatedAt: number;
}

export interface BluffResult {
  state: BluffState;
  error?: string;
}
