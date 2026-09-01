/**
 * Card primitives. A card is a 2-character string: rank + suit, e.g. "AS",
 * "TH", "2C". This is the same representation the original game used, so
 * existing persisted room state and the card components stay compatible.
 */

export type Suit = "S" | "H" | "D" | "C";
export type Card = string;

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;

export const ACE_OF_SPADES: Card = "AS";

export function suitOf(card: Card): Suit {
  return card[card.length - 1] as Suit;
}

export function rankOf(card: Card): string {
  return card.slice(0, card.length - 1);
}

/** 0 for a deuce, 12 for an ace. Higher beats lower. */
export function rankValue(card: Card): number {
  return (RANKS as readonly string[]).indexOf(rankOf(card));
}

export function suitName(s: Suit): string {
  return { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" }[s];
}

export function suitSymbol(s: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[s];
}

export function isRedSuit(s: Suit): boolean {
  return s === "H" || s === "D";
}

/** Human-readable rank, e.g. "10" rather than "T". */
export function rankLabel(card: Card): string {
  const r = rankOf(card);
  return r === "T" ? "10" : r;
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card)}${suitSymbol(suitOf(card))}`;
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  return deck;
}

/**
 * mulberry32 — a small, fast, seedable PRNG. Seeding matters here: it makes
 * a deal reproducible, which is what lets the test harness replay a failing
 * game exactly instead of guessing at it.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort by suit then rank, so a hand reads left-to-right the way you'd fan it. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const s = SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b));
    return s !== 0 ? s : rankValue(a) - rankValue(b);
  });
}
