/**
 * Trump-Patta — the state of one game.
 *
 * The shape is built around a single hard requirement: a player's hand is
 * private, and the only outsider ever entitled to see it is whoever is
 * picking from it right now. So the full state below is the *engine's*
 * state, never a payload — anything crossing to a client goes through
 * `redactFor()` in `rules.ts` first, and the tests treat a leak as a
 * failure rather than a nicety.
 *
 * Cards are the platform's ordinary two-character strings ("AS", "TH").
 * A single deck means every card is already unique, so unlike Bluff there
 * are no synthetic per-copy ids to carry around.
 */
import type { Card } from "../engine/cards";

export type TrumpPattaDifficulty = "easy" | "medium" | "hard";
export type TrumpPattaMode = "cpu" | "friends";

/**
 * `picking`  — the donor's hand is on show and the picker owes a choice.
 * `reveal`   — a card has just moved; any pair it made is being shown.
 * `finished` — one unmatched card is left and its holder is the Thief.
 */
export type TrumpPattaPhase = "picking" | "reveal" | "finished";

export interface TrumpPattaPlayer {
  seat: number;
  id: string;
  name: string;
  kind: "human" | "cpu" | "remote";
  /**
   * Ordered, and the order is the player's own business. Nothing in the
   * engine sorts it: not the deal, not receiving a card, not pair removal.
   * The position numbers the UI draws are indexes into this array, and the
   * picker sees it in exactly this order.
   */
  hand: Card[];
  /** The order they got rid of everything. 0 went out first. Null = still in. */
  safeRank: number | null;
  /** Cards taken from other people, for the end-of-game summary. */
  picks: number;
  /** Pairs this player has discarded, including the opening clear-out. */
  pairsFormed: number;
}

/** What just happened on a pick. Kept on the state so the UI can narrate it. */
export interface PickOutcome {
  donorSeat: number;
  pickerSeat: number;
  card: Card;
  /** 1-based, as the picker saw it. */
  fromPosition: number;
  /** The two cards discarded, when the pick completed a pair. */
  paired: [Card, Card] | null;
  /** Set when the donor handed over their last card. */
  donorWentOut: boolean;
}

export interface TrumpPattaConfig {
  playerCount: number;
  mode: TrumpPattaMode;
  difficulty: TrumpPattaDifficulty;
  seed: number;
}

export interface TrumpPattaState {
  version: 1;
  gameId: string;
  config: TrumpPattaConfig;
  players: TrumpPattaPlayer[];
  phase: TrumpPattaPhase;
  /** Whose hand is on show. Always a player who still holds cards. */
  donorSeat: number;
  /** Who owes a choice. Never the donor. */
  pickerSeat: number;
  /**
   * The card pulled out before the deal. Its partner is what somebody is
   * left holding at the end.
   *
   * Secret. `redactFor()` strips it for every viewer until the game is over,
   * and nothing else in the engine may consult it — a CPU that reads this
   * is cheating, which the tests check for explicitly.
   */
  removedCard: Card;
  /**
   * Every pair discarded so far, oldest first. Entirely public: this is the
   * shared record of what has left the game, and it's the honest basis for
   * working out which rank the odd card belongs to.
   */
  discards: Array<[Card, Card]>;
  outcome: PickOutcome | null;
  turnNumber: number;
  /** Seats in the order they emptied their hands. Earlier is better. */
  safeOrder: number[];
  thiefSeat: number | null;
  /** The last card in play, revealed once the game is over. */
  remainingCard: Card | null;
  startedAt: number;
  updatedAt: number;
}

export interface TrumpPattaResult {
  state: TrumpPattaState;
  error?: string;
}

/**
 * What one viewer is allowed to know.
 *
 * Everything here is safe to put on the wire for that viewer. Note what is
 * absent: no `removedCard` while the game runs, and no `hand` for anybody
 * except the viewer themselves and — only while they owe a pick — the donor.
 */
export interface PublicPlayer {
  seat: number;
  id: string;
  name: string;
  kind: "human" | "cpu" | "remote";
  cardCount: number;
  safeRank: number | null;
  picks: number;
  pairsFormed: number;
  /**
   * Present only for the viewer's own seat, and for the donor when the
   * viewer is the picker. Absent — not empty, absent — for everyone else.
   */
  hand?: Card[];
}

/**
 * What a pick looks like to someone who wasn't part of it.
 *
 * Who took from whom, and which position — all of that is visible across any
 * real table. The card itself is not: watching two other people trade a card
 * tells you nothing about what it was. `paired` stays, because a discarded
 * pair goes face-up into the public pile a second later anyway.
 */
export interface PublicPickOutcome {
  donorSeat: number;
  pickerSeat: number;
  /** Only for the two players involved. Absent for everybody else. */
  card?: Card;
  fromPosition: number;
  paired: [Card, Card] | null;
  donorWentOut: boolean;
}

export interface RedactedState {
  version: 1;
  gameId: string;
  config: TrumpPattaConfig;
  phase: TrumpPattaPhase;
  donorSeat: number;
  pickerSeat: number;
  players: PublicPlayer[];
  discards: Array<[Card, Card]>;
  outcome: PublicPickOutcome | null;
  turnNumber: number;
  safeOrder: number[];
  thiefSeat: number | null;
  /** Only ever set once the game is finished. */
  remainingCard: Card | null;
  removedCard: Card | null;
  startedAt: number;
  updatedAt: number;
}
