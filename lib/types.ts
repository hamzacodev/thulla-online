export type Suit = "S" | "H" | "D" | "C";
export type Card = string; // e.g. "AS", "TH", "2C" — rank + suit

export interface Player {
  id: string; // random id generated on join, stored in browser
  name: string;
  seat: number; // 0-3
  team: 0 | 1; // seats 0&2 = team 0, seats 1&3 = team 1
  hand: Card[];
  connected: boolean;
}

export type GameStatus = "waiting" | "playing" | "finished";

export interface PileEntry {
  card: Card;
  seat: number;
}

export interface GameState {
  code: string;
  status: GameStatus;
  players: Player[]; // up to 4, ordered by seat
  turnSeat: number; // whose turn it is
  leaderSeat: number; // who led the current trick
  ledSuit: Suit | null;
  pile: PileEntry[];
  winningTeam: 0 | 1 | null;
  log: string[]; // last ~8 events, newest last
  updatedAt: number;
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

export function suitOf(card: Card): Suit {
  return card[card.length - 1] as Suit;
}

export function rankOf(card: Card): string {
  return card.slice(0, card.length - 1);
}

export function rankValue(card: Card): number {
  return RANKS.indexOf(rankOf(card));
}

export function suitName(s: Suit): string {
  return { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" }[s];
}

export function suitSymbol(s: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[s];
}
