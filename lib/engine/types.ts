import type { Card, Suit } from "./cards";

export type PlayerKind = "human" | "cpu" | "remote";
export type Difficulty = "easy" | "medium" | "hard";

/**
 * Phases are explicit so the UI has somewhere to hang animations. In
 * particular `trickEnd` holds the completed pile on the table long enough
 * to show who won it or who is about to pick it up — the engine does not
 * silently clear the pile out from under the renderer.
 */
export type Phase = "dealing" | "playing" | "trickEnd" | "finished";

export interface EnginePlayer {
  seat: number;
  id: string;
  name: string;
  kind: PlayerKind;
  hand: Card[];
  /** Non-null once they've emptied their hand; 0 = got out first. */
  finishedRank: number | null;
  connected: boolean;
}

export interface PileEntry {
  card: Card;
  seat: number;
}

export type TrickOutcome =
  /** Everyone followed suit: highest card takes it, pile leaves the game. */
  | { kind: "discard"; winnerSeat: number; highCard: Card; cards: Card[] }
  /** Someone was void: highest card of the led suit eats the whole pile. */
  | {
      kind: "pickup";
      collectorSeat: number;
      highCard: Card;
      brokeBySeat: number;
      brokeWith: Card;
      cards: Card[];
    };

export interface GameConfig {
  playerCount: number;
  /** Where this game is being played — decides how the result is recorded. */
  mode: "cpu" | "friends";
  /** The A♠ holder leads the first trick and must lead the A♠ itself. */
  mustLeadAceOfSpades: boolean;
  /**
   * House rule: the opening trick is a free round. Throwing off-suit there
   * isn't a thulla — nobody picks the pile up, play just carries on round
   * the table and the highest card of the led suit takes it as normal.
   * Optional so games saved before this rule existed still load.
   */
  firstTrickImmune?: boolean;
  difficulty: Difficulty;
  seed: number;
}

export interface GameState {
  version: 3;
  /** Stable identity for this deal. The unit of idempotent result recording. */
  gameId: string;
  config: GameConfig;
  players: EnginePlayer[];
  phase: Phase;
  turnSeat: number;
  leaderSeat: number;
  ledSuit: Suit | null;
  pile: PileEntry[];
  /** Seats due to play this trick, in turn order. Fixed when the trick opens. */
  trickOrder: number[];
  trickNumber: number;
  /** Set while phase === "trickEnd"; also kept afterwards so the UI can narrate. */
  trickOutcome: TrickOutcome | null;
  /** Forces the opening A♠ lead. Cleared once played. */
  mustPlay: Card | null;
  /** Seats in the order they went out. Earlier = better placing. */
  finishOrder: number[];
  bhabhiSeat: number | null;
  startedAt: number;
  updatedAt: number;
}

export interface PlayResult {
  state: GameState;
  error?: string;
}
