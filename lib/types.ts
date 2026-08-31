export type Suit = "S" | "H" | "D" | "C";
export type Card = string; // e.g. "AS", "TH", "2C" — rank + suit

export interface Player {
  id: string; // the Supabase auth user id
  name: string; // the player's chosen username
  seat: number; // 0..maxPlayers-1
  team: 0 | 1; // even seats = team 0, odd seats = team 1
  hand: Card[];
  connected: boolean;
}

export type GameStatus = "waiting" | "playing" | "finished";

export interface PileEntry {
  card: Card;
  seat: number;
}

// Player counts we support. Must stay even (so seats split into two equal
// teams) and within the DB check constraint on rooms.max_players (4-8).
export const PLAYER_COUNT_OPTIONS = [4, 6, 8] as const;
export type PlayerCount = (typeof PLAYER_COUNT_OPTIONS)[number];

export interface GameState {
  code: string;
  status: GameStatus;
  maxPlayers: PlayerCount;
  players: Player[]; // up to maxPlayers, ordered by seat
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
