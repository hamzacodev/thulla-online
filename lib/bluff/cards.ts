/**
 * Bluff's card primitives.
 *
 * Thulla's cards are two-character strings — "AS" is *the* ace of spades,
 * and that works because there is exactly one of each. Bluff deals from a
 * shoe of up to three decks, where three aces of spades is a legal and
 * ordinary thing to be holding, so a card needs an identity of its own
 * beyond its face. Hence a record with an `id`, and a separate `face` for
 * the two-character string the existing card components already draw.
 */

export type Suit = "S" | "H" | "D" | "C";

/** Ace low-to-high doesn't matter here — nothing in Bluff compares ranks. */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS: Suit[] = ["S", "H", "D", "C"];

export interface BluffCard {
  /** Unique in the shoe: "AS#2" is the ace of spades from the second deck. */
  id: string;
  /** 1-based, so a card can say which deck it came out of. */
  deck: number;
  rank: Rank;
  suit: Suit;
}

export const MIN_DECKS = 1;
export const MAX_DECKS = 3;
export const CARDS_PER_DECK = 52;

export function cardsForDecks(deckCount: number): number {
  return deckCount * CARDS_PER_DECK;
}

/** The two-character face, for the shared PlayingCard component. */
export function faceOf(card: BluffCard): string {
  return `${card.rank}${card.suit}`;
}

export function rankLabel(rank: Rank): string {
  return rank === "T" ? "10" : rank;
}

/** "Kings", "Aces" — what a claim is read out as. */
export function rankPlural(rank: Rank, count: number): string {
  const names: Record<Rank, string> = {
    A: "Ace", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six",
    "7": "Seven", "8": "Eight", "9": "Nine", T: "Ten", J: "Jack", Q: "Queen", K: "King",
  };
  const name = names[rank];
  return count === 1 ? name : `${name}s`;
}

/** "3 Kings" — a whole claim, as everybody hears it. */
export function claimLabel(rank: Rank, count: number): string {
  return `${count} ${rankPlural(rank, count)}`;
}

/**
 * Every card in `deckCount` decks, in order. Shuffling is the caller's job,
 * so a test can assert on the unshuffled shoe.
 */
export function buildShoe(deckCount: number): BluffCard[] {
  const shoe: BluffCard[] = [];
  for (let deck = 1; deck <= deckCount; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ id: `${rank}${suit}#${deck}`, deck, rank, suit });
      }
    }
  }
  return shoe;
}

/** Sorted the way you'd fan a hand: by rank, so duplicates sit together. */
export function sortBluffHand(hand: readonly BluffCard[]): BluffCard[] {
  return [...hand].sort((a, b) => {
    const r = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
    if (r !== 0) return r;
    const s = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return s !== 0 ? s : a.deck - b.deck;
  });
}

export function countOfRank(hand: readonly BluffCard[], rank: Rank): number {
  return hand.reduce((n, c) => n + (c.rank === rank ? 1 : 0), 0);
}
