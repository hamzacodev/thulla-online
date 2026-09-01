import { Card, Suit, SUITS, rankValue, suitOf } from "./cards";
import { legalMoves } from "./rules";
import type { Difficulty, GameState } from "./types";

const byRankAsc = (a: Card, b: Card) => rankValue(a) - rankValue(b);
const lowest = (cards: Card[]) => [...cards].sort(byRankAsc)[0];
const highest = (cards: Card[]) => [...cards].sort(byRankAsc)[cards.length - 1];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Highest card of the led suit currently on the table — i.e. the player who
 * would eat the pile if somebody turns out to be void.
 */
function currentHigh(state: GameState): number {
  if (!state.ledSuit) return -1;
  const led = state.ledSuit;
  return state.pile
    .filter((e) => suitOf(e.card) === led)
    .reduce((best, e) => Math.max(best, rankValue(e.card)), -1);
}

function isLastToPlay(state: GameState): boolean {
  return state.pile.length === state.trickOrder.length - 1;
}

/**
 * Suits we have watched each seat fail to follow.
 *
 * This used to be derived from `state.trickOutcome`, which only ever holds
 * the trick that just ended — so the CPU forgot every void the moment the
 * next trick began, and would cheerfully lead the same suit into the same
 * void player again and again. The engine keeps the running record now.
 * The old one-trick derivation survives as a fallback for games saved
 * before `state.voids` existed.
 */
function knownVoids(state: GameState): Map<number, Set<Suit>> {
  const voids = new Map<number, Set<Suit>>();

  if (state.voids) {
    state.voids.forEach((suits, seat) => {
      if (suits && suits.length) voids.set(seat, new Set(suits));
    });
    return voids;
  }

  const outcome = state.trickOutcome;
  if (outcome?.kind === "pickup") {
    voids.set(outcome.brokeBySeat, new Set([suitOf(outcome.highCard)]));
  }
  return voids;
}

/** Leading: get out of a suit cheaply without handing anyone a free thulla. */
function chooseLead(state: GameState, hand: Card[], difficulty: Difficulty, rng: () => number): Card {
  if (difficulty === "easy") return pick(hand, rng);

  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const s = suitOf(c);
    bySuit.set(s, [...(bySuit.get(s) ?? []), c]);
  }

  // Even "medium" refuses the outright blunder below; only "hard" prices the
  // risk in properly.
  const opponentsVoid = knownVoids(state);
  const othersActive = state.trickOrder.filter(
    (s) => s !== state.turnSeat && state.players[s]?.hand.length > 0
  );

  let best: { card: Card; score: number } | null = null;
  for (const [suit, cards] of bySuit) {
    const low = lowest(cards);
    // Leading a low card is safe: someone else is likely to end up holding
    // the high card and therefore the risk.
    let score = 100 - rankValue(low) * 4;
    // A long suit is worth leading — more chances to shed it later.
    score += cards.length * 3;

    const voidHere = othersActive.filter((s) => opponentsVoid.get(s)?.has(suit));

    // Everyone still in the game is void here. Whatever we lead is then the
    // only card of the suit on the table, so we are top of it by definition
    // and the whole pile comes straight back to us. Leading into that is
    // never right, at any difficulty — it is the loop that made the CPU look
    // like it wasn't paying attention.
    if (othersActive.length > 0 && voidHere.length === othersActive.length) {
      score -= 250;
    } else if (difficulty === "hard") {
      // Otherwise price it: a void player ends the trick the moment they
      // play, and the highest card of the led suit eats the pile. Leading
      // our 3 into a void is cheap; leading our King is asking for it.
      score -= voidHere.length * (6 + rankValue(low) * 2);
      // Holding only high cards in a suit is a trap: we'd be forced to sit
      // on top of our own lead.
      if (rankValue(low) >= 9) score -= 15;
    }

    if (!best || score > best.score) best = { card: low, score };
  }
  return best?.card ?? lowest(hand);
}

/** Following suit: duck under the current high whenever we can. */
function chooseFollow(state: GameState, suitCards: Card[], difficulty: Difficulty, rng: () => number): Card {
  if (difficulty === "easy") return pick(suitCards, rng);

  const high = currentHigh(state);
  const last = isLastToPlay(state);

  // Last to play and everybody followed suit? The pile is guaranteed to be
  // discarded, so taking it is free: shed the biggest card and win the lead.
  if (last && difficulty === "hard") return highest(suitCards);

  const duckable = suitCards.filter((c) => rankValue(c) < high);
  if (duckable.length > 0) {
    // Stay under the top card while dumping the largest card we safely can.
    return highest(duckable);
  }
  // Forced above: play the smallest one so a later player can still overtake
  // us and inherit the risk.
  return lowest(suitCards);
}

/** Void in the led suit: this ends the trick, so throw away the worst card. */
function chooseDiscard(state: GameState, hand: Card[], difficulty: Difficulty, rng: () => number): Card {
  if (difficulty === "easy") return pick(hand, rng);
  if (difficulty === "medium") return highest(hand);

  // Hard: prefer dumping a high card from a suit we're nearly out of, which
  // both sheds danger and moves us closer to being void again.
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const s = suitOf(c);
    bySuit.set(s, [...(bySuit.get(s) ?? []), c]);
  }
  let best: { card: Card; score: number } | null = null;
  for (const [, cards] of bySuit) {
    const top = highest(cards);
    const score = rankValue(top) * 4 - cards.length * 2;
    if (!best || score > best.score) best = { card: top, score };
  }
  return best?.card ?? highest(hand);
}

/**
 * Decides a CPU's card. Always returns something legal — it filters the
 * engine's own `legalMoves`, so the AI cannot cheat even if the heuristics
 * below are wrong.
 */
export function chooseCard(state: GameState, seat: number, difficulty: Difficulty = "medium"): Card | null {
  const legal = legalMoves(state, seat);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const rng = Math.random;
  const hand = state.players[seat].hand;

  let candidate: Card;
  if (state.ledSuit === null) {
    candidate = chooseLead(state, legal, difficulty, rng);
  } else if (suitOf(legal[0]) === state.ledSuit && legal.every((c) => suitOf(c) === state.ledSuit)) {
    candidate = chooseFollow(state, legal, difficulty, rng);
  } else {
    candidate = chooseDiscard(state, hand, difficulty, rng);
  }

  return legal.includes(candidate) ? candidate : legal[0];
}

/** A believable pause, so CPUs don't fire the instant it's their turn. */
export function thinkingDelay(difficulty: Difficulty): number {
  const base = { easy: 700, medium: 900, hard: 1000 }[difficulty];
  return base + Math.random() * 800;
}

export const CPU_NAMES = ["Chacha", "Ustad", "Shani", "Munna", "Billu", "Pappu", "Guddu"];

export function cpuName(index: number): string {
  return CPU_NAMES[index % CPU_NAMES.length];
}

export { SUITS };
