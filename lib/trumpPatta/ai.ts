/**
 * The Trump-Patta computer players.
 *
 * The important thing about this file is what it is handed: a `RedactedState`
 * — the same view a human in that seat gets — rather than the real game. A
 * CPU therefore *cannot* consult the hidden card or read a hand it isn't
 * entitled to, because those fields simply are not there. Any strategy below
 * is playing the same game you are, with the same information.
 *
 * What a picker legitimately knows is more than it first appears: their own
 * hand, the donor's hand (which they are being shown), and every pair ever
 * discarded, which is public. Late on, that is enough to work out which rank
 * the odd card belongs to.
 */
import { rankOf, type Card } from "../engine/cards";
import type { RedactedState, TrumpPattaDifficulty } from "./types";

const CPU_NAMES = [
  "Bilal",
  "Sana",
  "Kamran",
  "Nadia",
  "Rizwan",
  "Ayesha",
  "Tariq",
];

export function trumpPattaCpuName(index: number): string {
  return CPU_NAMES[index % CPU_NAMES.length];
}

/** How many cards of a rank are sitting in the public discard pile. */
function discardedOf(view: RedactedState, rank: string): number {
  let n = 0;
  for (const pair of view.discards) for (const c of pair) if (rankOf(c) === rank) n++;
  return n;
}

/**
 * Picks a position out of the donor's hand. 1-based, matching what the UI
 * numbers and what `pickCard` expects.
 *
 * Blind, because that is the game: the cards are face-down and the only
 * thing anyone knows is how many there are. Difficulty deliberately makes no
 * difference here — there is nothing to be clever *with*. Where the CPUs
 * differ is `arrangeHand` below, which is the only real decision in
 * Trump-Patta.
 *
 * Returns 0 when there is nothing to pick, which the caller should treat as
 * "not my turn" rather than as a move.
 */
export function chooseCard(
  view: RedactedState,
  _difficulty: TrumpPattaDifficulty,
  rng: () => number = Math.random
): number {
  const donor = view.players[view.donorSeat];
  const count = donor?.cardCount ?? 0;
  if (count < 1) return 0;
  return Math.floor(rng() * count) + 1;
}

/**
 * How likely each card is to be the one nobody can pair with.
 *
 * Worked out from public information only: the more of a rank that has
 * already been discarded, the fewer copies are left to pair the one you are
 * holding. A rank with two already gone is the worrying one — either its
 * last partner is in somebody's hand, or you are holding the odd card and
 * there is no partner at all.
 */
function riskOf(card: Card, view: RedactedState): number {
  return discardedOf(view, rankOf(card));
}

/**
 * How a CPU arranges its own hand.
 *
 * This is where the game actually is. You cannot choose what you take, only
 * where you put what you're stuck with, and the next player picks a position
 * out of a fan they cannot see.
 *
 * `easy` and `medium` just shuffle — which is the honest baseline, and no
 * worse than anything else against a picker choosing at random.
 *
 * `hard` shuffles and then slides its most dangerous card into the middle of
 * the fan. Worth being straight about the size of that: against a genuinely
 * uniform picker it is worth nothing at all, because every position is
 * equally likely. It is a bet on people not being uniform — hands get picked
 * from the middle more than the ends. Against another CPU it is noise.
 *
 * What it must never do is arrange informatively. Sorting by rank would tell
 * the whole table where the interesting card is, which is why even the easy
 * CPUs shuffle rather than leaving the hand in deal order.
 */
export function arrangeHand(
  hand: readonly Card[],
  view?: RedactedState,
  difficulty: TrumpPattaDifficulty = "medium",
  rng: () => number = Math.random
): Card[] {
  const out = [...hand];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  if (difficulty !== "hard" || !view || out.length < 3) return out;

  let worst = 0;
  for (let i = 1; i < out.length; i++) {
    if (riskOf(out[i], view) > riskOf(out[worst], view)) worst = i;
  }
  const [risky] = out.splice(worst, 1);
  out.splice(Math.floor(out.length / 2), 0, risky);
  return out;
}
