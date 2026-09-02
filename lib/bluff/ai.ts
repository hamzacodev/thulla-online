import { RANKS, countOfRank, type BluffCard, type Rank } from "./cards";
import { challengers, requiredRank } from "./rules";
import type { BluffDifficulty, BluffState } from "./types";

/**
 * The CPU.
 *
 * Bluff is a game of incomplete information, so the interesting decisions
 * are about how much a claim smells rather than what's optimal. Three
 * things drive every difficulty: how many of the claimed rank the CPU can
 * see in its own hand, how many can possibly exist, and how close the
 * claimer is to going out.
 *
 * Nothing here reads another player's hand. It only uses what anyone at the
 * table can see — hand sizes, the claim, the pile, and its own cards.
 */

export interface ClaimDecision {
  cardIds: string[];
  rank: Rank;
}

/** How many of a rank exist in the whole shoe. */
function copiesInShoe(state: BluffState): number {
  return 4 * state.config.deckCount;
}

function pickLowValue(hand: BluffCard[], exclude: Set<string>, n: number): BluffCard[] {
  // Nothing in Bluff ranks cards against each other, so "junk" just means
  // the ranks we hold fewest of — dumping those keeps our useful sets whole.
  const byRank = new Map<Rank, number>();
  for (const c of hand) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1);
  return [...hand]
    .filter((c) => !exclude.has(c.id))
    .sort((a, b) => (byRank.get(a.rank) ?? 0) - (byRank.get(b.rank) ?? 0))
    .slice(0, n);
}

/**
 * What to play. Truthfully if it can; otherwise it has to lie, which is
 * the position the locked-rank rule is there to create.
 */
export function chooseClaim(
  state: BluffState,
  seat: number,
  difficulty: BluffDifficulty = "medium",
  rng: () => number = Math.random
): ClaimDecision | null {
  const player = state.players[seat];
  if (!player || player.hand.length === 0) return null;

  const must = requiredRank(state);
  const hand = player.hand;

  if (must) {
    const truthful = hand.filter((c) => c.rank === must);
    if (truthful.length > 0) {
      // Easy dumps everything it legitimately has; the others hold some back
      // so they aren't left with nothing to claim next time round.
      const keepBack = difficulty === "easy" ? 0 : truthful.length > 2 ? 1 : 0;
      const play = truthful.slice(0, Math.max(1, truthful.length - keepBack));
      return { cardIds: play.map((c) => c.id), rank: must };
    }
    // Forced to lie. How brazenly depends on difficulty.
    const maxLie = difficulty === "hard" ? (player.hand.length > 8 ? 3 : 2) : difficulty === "medium" ? 2 : 1;
    const bluffCount = Math.max(1, Math.min(maxLie, 1 + Math.floor(rng() * maxLie)));
    const junk = pickLowValue(hand, new Set(), bluffCount);
    return { cardIds: junk.map((c) => c.id), rank: must };
  }

  // Free choice: name the rank we hold most of and shed it.
  //
  // Capped, and not because the rules require it. Dumping a dozen at once
  // makes a pile nobody dares challenge, which is exactly how the 8-player
  // three-deck game stopped progressing: enormous truthful claims, everyone
  // challenging, the pile going round and round. Four at a time keeps the
  // pile a size somebody might gamble on.
  const maxDump = 4;
  let best: Rank = hand[0].rank;
  let bestCount = 0;
  for (const rank of RANKS) {
    const n = countOfRank(hand, rank);
    if (n > bestCount) {
      best = rank;
      bestCount = n;
    }
  }

  const truthful = hand.filter((c) => c.rank === best).slice(0, maxDump);

  // Slip extra cards in under the same claim. This is the bluff, and it
  // happens on top of a truthful group as well as instead of one — holding
  // three kings and chucking a seven in with them is the most natural lie
  // in the game. Padding only when the CPU had nothing true to play made
  // bluffs so rare that a thousand challenges caught none.
  const room = maxDump - truthful.length;
  const appetite =
    difficulty === "hard" ? 0.55 : difficulty === "medium" ? 0.35 : 0.12;
  const wantsToPad = room > 0 && hand.length > 3 && rng() < appetite;
  const padding = wantsToPad
    ? pickLowValue(
        hand.filter((c) => c.rank !== best),
        new Set(truthful.map((c) => c.id)),
        Math.min(room, difficulty === "hard" ? 2 : 1)
      )
    : [];

  const play = [...truthful, ...padding];
  return { cardIds: play.map((c) => c.id), rank: best };
}

/**
 * Whether to call the claim on the table.
 *
 * The giveaway is arithmetic: if the CPU holds four kings and somebody
 * claims three more, at one deck that's impossible and the claim is a
 * certain lie. Everything softer than that is a probability, and how much
 * of it the CPU acts on is the difficulty.
 */
export function shouldCallBluff(
  state: BluffState,
  seat: number,
  difficulty: BluffDifficulty = "medium",
  rng: () => number = Math.random
): boolean {
  const claim = state.claim;
  if (!claim || claim.seat === seat) return false;
  if (!challengers(state).includes(seat)) return false;

  const me = state.players[seat];
  const claimer = state.players[claim.seat];
  const held = countOfRank(me.hand, claim.rank);
  const possible = copiesInShoe(state) - held;

  // Certain lie: more claimed than can possibly be left outside our hand.
  if (claim.cards.length > possible) return true;

  // Every other player rolls this independently, so a fixed probability
  // means a table of eight challenges nearly everything — 97% of claims in
  // the first run, of which 0.4% were actually lies. Spreading it across the
  // eligible seats keeps the *table's* appetite for calling roughly constant
  // however many people are sitting at it.
  const eligible = Math.max(1, challengers(state).length);
  const share = (p: number) => 1 - Math.pow(1 - Math.min(0.95, p), 1 / eligible);

  if (difficulty === "easy") return rng() < share(0.12);

  // How much of the rank we can see accounted for, plus how greedy the claim
  // was, plus how close they are to winning.
  let suspicion = 0;
  suspicion += (held / copiesInShoe(state)) * 0.55;
  // Gently: a big claim is bold, not proof. Charging 0.16 a card made a
  // four-card claim look like a certainty.
  suspicion += Math.max(0, claim.cards.length - 1) * 0.07;
  if (claimer.hand.length === 0) suspicion += 0.45; // going out on this play
  else if (claimer.hand.length <= 2) suspicion += 0.18;

  if (difficulty === "medium") return rng() < share(Math.min(0.5, suspicion * 0.6));

  // Hard also weighs the cost: a big pile makes a wrong call expensive.
  const pileRisk = Math.min(0.3, state.pile.length / 40);
  const threshold = Math.min(0.8, suspicion - pileRisk * 0.5);
  return rng() < share(Math.max(0.04, threshold));
}

/** A believable pause, so the CPU doesn't fire the instant it's their turn. */
export function bluffThinkingDelay(difficulty: BluffDifficulty): number {
  const base = { easy: 800, medium: 1000, hard: 1200 }[difficulty];
  return base + Math.random() * 800;
}

export const BLUFF_CPU_NAMES = ["Chacha", "Ustad", "Shani", "Munna", "Billu", "Pappu", "Guddu"];

export function bluffCpuName(index: number): string {
  return BLUFF_CPU_NAMES[index % BLUFF_CPU_NAMES.length];
}
