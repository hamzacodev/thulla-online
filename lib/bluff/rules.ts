import {
  buildShoe,
  cardsForDecks,
  countOfRank,
  MAX_DECKS,
  MIN_DECKS,
  sortBluffHand,
  type BluffCard,
  type Rank,
} from "./cards";
import { makeRng, shuffle } from "../engine/cards";
import type {
  BluffClaim,
  BluffConfig,
  BluffPlayer,
  BluffResult,
  BluffState,
  ChallengeOutcome,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export function isValidPlayerCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}

export function isValidDeckCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_DECKS && n <= MAX_DECKS;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function newGameId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Seats that still hold cards, in seat order. */
export function activeSeats(state: BluffState): number[] {
  return state.players.filter((p) => p.hand.length > 0).map((p) => p.seat);
}

/** Next seat clockwise that still has cards. */
function nextActive(state: BluffState, from: number): number | null {
  const total = state.players.length;
  for (let i = 1; i <= total; i++) {
    const seat = (from + i) % total;
    if (state.players[seat].hand.length > 0) return seat;
  }
  return state.players[from]?.hand.length ? from : null;
}

/** Everyone who could challenge the claim on the table. */
export function challengers(state: BluffState): number[] {
  if (!state.claim) return [];
  return state.players
    .filter((p) => p.seat !== state.claim!.seat && p.hand.length > 0)
    .map((p) => p.seat);
}

/**
 * Whose turn it is to accept or call the claim.
 *
 * The window is worked through one seat at a time rather than everybody at
 * once, so a human is never racing three CPUs for the button and the order
 * of events is the same every time.
 */
export function nextChallenger(state: BluffState): number | null {
  if (state.phase !== "challenge" || !state.claim) return null;
  const total = state.players.length;
  for (let i = 1; i <= total; i++) {
    const seat = (state.claim.seat + i) % total;
    if (seat === state.claim.seat) continue;
    if (state.players[seat].hand.length === 0) continue;
    if (state.claim.passed.includes(seat)) continue;
    return seat;
  }
  return null;
}

export interface CreateBluffOptions {
  players: Array<Pick<BluffPlayer, "id" | "name" | "kind">>;
  config?: Partial<Omit<BluffConfig, "playerCount">>;
}

/**
 * Builds a dealt game. The whole shoe is dealt out round-robin, so with
 * counts that don't divide evenly the earlier seats get one extra — the
 * same thing that happens dealing by hand.
 */
export function createBluffGame({ players, config }: CreateBluffOptions): BluffState {
  if (!isValidPlayerCount(players.length)) {
    throw new Error(`Bluff needs ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
  }
  const deckCount = config?.deckCount ?? 1;
  if (!isValidDeckCount(deckCount)) {
    throw new Error(`Bluff uses ${MIN_DECKS}–${MAX_DECKS} decks.`);
  }

  const seed = config?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const shoe = shuffle(buildShoe(deckCount), rng);

  const hands: BluffCard[][] = players.map(() => []);
  shoe.forEach((card, i) => hands[i % players.length].push(card));

  const enginePlayers: BluffPlayer[] = players.map((p, seat) => ({
    seat,
    id: p.id,
    name: p.name,
    kind: p.kind,
    hand: sortBluffHand(hands[seat]),
    finishedRank: null,
    stats: {
      bluffsCalled: 0,
      successfulCalls: 0,
      failedCalls: 0,
      successfulBluffs: 0,
      timesCaught: 0,
    },
  }));

  const now = Date.now();
  return {
    version: 1,
    gameId: newGameId(),
    config: {
      playerCount: players.length,
      deckCount,
      mode: config?.mode ?? "cpu",
      difficulty: config?.difficulty ?? "medium",
      lockRankPerRound: config?.lockRankPerRound ?? false,
      seed,
    },
    players: enginePlayers,
    phase: "claiming",
    turnSeat: 0,
    pile: [],
    roundRank: null,
    claim: null,
    outcome: null,
    finishOrder: [],
    winnerSeat: null,
    lastSeat: null,
    startedAt: now,
    updatedAt: now,
  };
}

/** The rank this player must claim, or null when they may pick any. */
export function requiredRank(state: BluffState): Rank | null {
  return state.config.lockRankPerRound ? state.roundRank : null;
}

/** Why a play would be rejected, phrased for a player rather than a log. */
export function claimRejection(
  state: BluffState,
  seat: number,
  cardIds: string[],
  rank: Rank
): string | null {
  if (state.phase !== "claiming") return "Hold on — the table is still settling.";
  if (state.turnSeat !== seat) return "Not your turn yet — thoda sabar!";

  const player = state.players[seat];
  if (!player || player.hand.length === 0) return "You're already out.";
  if (cardIds.length === 0) return "Pick at least one card to play.";
  if (cardIds.length > 4 * state.config.deckCount) return "That's more cards than exist of one rank.";

  const owned = new Set(player.hand.map((c) => c.id));
  const unique = new Set(cardIds);
  if (unique.size !== cardIds.length) return "That card is already selected.";
  for (const id of cardIds) if (!owned.has(id)) return "That card isn't in your hand.";

  const must = requiredRank(state);
  if (must && rank !== must) return `This round is on ${must}s — you have to claim ${must}s.`;
  return null;
}

/**
 * Plays cards face-down with a claim attached. The cards are not checked
 * against the claim — lying is the game. Whether it was true is recorded
 * now and only surfaces if somebody challenges.
 */
export function applyClaim(
  stateIn: BluffState,
  seat: number,
  cardIds: string[],
  rank: Rank
): BluffResult {
  const problem = claimRejection(stateIn, seat, cardIds, rank);
  if (problem) return { state: stateIn, error: problem };

  const state = clone(stateIn);
  const player = state.players[seat];
  const played = cardIds.map((id) => player.hand.find((c) => c.id === id)!);

  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  state.pile.push(...played);
  state.roundRank = rank;

  const claim: BluffClaim = {
    seat,
    rank,
    cards: played,
    passed: [],
    truthful: played.every((c) => c.rank === rank),
  };
  state.claim = claim;
  state.outcome = null;
  state.phase = "challenge";
  state.updatedAt = Date.now();

  // Nobody left who could call it — everyone else is already out. Settling
  // here rather than waiting for a challenge that can never arrive.
  if (challengers(state).length === 0) return { state: settleUnchallenged(state) };
  return { state };
}

/** Declining to challenge. When the last eligible seat passes, it settles. */
export function passChallenge(stateIn: BluffState, seat: number): BluffResult {
  if (stateIn.phase !== "challenge" || !stateIn.claim) {
    return { state: stateIn, error: "There's nothing to call right now." };
  }
  if (seat === stateIn.claim.seat) return { state: stateIn, error: "You can't call your own claim." };
  if (stateIn.claim.passed.includes(seat)) return { state: stateIn };

  const state = clone(stateIn);
  state.claim!.passed.push(seat);
  state.updatedAt = Date.now();

  const waiting = challengers(state).filter((s) => !state.claim!.passed.includes(s));
  if (waiting.length > 0) return { state };
  return { state: settleUnchallenged(state) };
}

/**
 * Nobody called it. The cards stay in the pile, a lie that got away is
 * counted, and the turn moves on — the round stays on the same rank.
 */
function settleUnchallenged(state: BluffState): BluffState {
  const claim = state.claim!;
  const claimer = state.players[claim.seat];
  if (!claim.truthful) claimer.stats.successfulBluffs += 1;

  state.claim = null;
  markOut(state, [claim.seat]);

  if (finishIfDone(state)) return state;

  const next = nextActive(state, claim.seat);
  state.turnSeat = next ?? claim.seat;
  state.phase = "claiming";
  state.updatedAt = Date.now();
  return state;
}

/**
 * Calling it. The cards come face-up and the pile goes to whoever was
 * wrong — the liar if the claim was false, the challenger if it wasn't.
 * Resolution itself is `resolveReveal`, so the UI gets a beat to show it.
 */
export function callBluff(stateIn: BluffState, seat: number): BluffResult {
  if (stateIn.phase !== "challenge" || !stateIn.claim) {
    return { state: stateIn, error: "There's nothing to call right now." };
  }
  if (seat === stateIn.claim.seat) return { state: stateIn, error: "You can't call your own claim." };
  if (stateIn.players[seat]?.hand.length === 0) return { state: stateIn, error: "You're out of the game." };

  const state = clone(stateIn);
  const claim = state.claim!;
  const caught = !claim.truthful;

  const outcome: ChallengeOutcome = {
    challengerSeat: seat,
    claimSeat: claim.seat,
    rank: claim.rank,
    cards: claim.cards,
    caught,
    collectorSeat: caught ? claim.seat : seat,
    pileSize: state.pile.length,
  };

  const challenger = state.players[seat];
  const claimer = state.players[claim.seat];
  challenger.stats.bluffsCalled += 1;
  if (caught) {
    challenger.stats.successfulCalls += 1;
    claimer.stats.timesCaught += 1;
  } else {
    challenger.stats.failedCalls += 1;
  }

  state.outcome = outcome;
  state.phase = "reveal";
  state.updatedAt = Date.now();
  return { state };
}

/**
 * Applies a settled challenge: the pile goes to the loser of it, the round
 * ends, and they lead the next one.
 */
export function resolveReveal(stateIn: BluffState): BluffState {
  if (stateIn.phase !== "reveal" || !stateIn.outcome) return stateIn;

  const state = clone(stateIn);
  const outcome = state.outcome!;
  const collector = state.players[outcome.collectorSeat];

  collector.hand = sortBluffHand([...collector.hand, ...state.pile]);
  state.pile = [];
  state.roundRank = null;
  state.claim = null;

  // Whoever survived the challenge may have emptied their hand doing it.
  markOut(state, [outcome.claimSeat, outcome.challengerSeat]);

  if (finishIfDone(state)) return state;

  // The pile lands with someone, so they still hold cards and can lead.
  state.turnSeat =
    collector.hand.length > 0 ? collector.seat : nextActive(state, outcome.collectorSeat) ?? 0;
  state.phase = "claiming";
  state.updatedAt = Date.now();
  return state;
}

/**
 * Records anyone who has run out. Deliberately called only once a claim has
 * survived its challenge window: emptying your hand isn't being out until
 * nobody can still make you pick the pile back up.
 */
function markOut(state: BluffState, seats: number[]) {
  for (const seat of seats) {
    const p = state.players[seat];
    if (!p || p.finishedRank !== null || p.hand.length > 0) continue;
    p.finishedRank = state.finishOrder.length;
    state.finishOrder.push(seat);
    if (state.winnerSeat === null) state.winnerSeat = seat;
  }
}

/** True when only one player is left holding cards. */
function finishIfDone(state: BluffState): boolean {
  const remaining = activeSeats(state);
  if (remaining.length > 1) return false;

  if (remaining.length === 1) {
    const last = state.players[remaining[0]];
    state.lastSeat = last.seat;
    last.finishedRank = state.finishOrder.length;
    state.finishOrder.push(last.seat);
  } else {
    state.lastSeat = state.finishOrder.length
      ? state.finishOrder[state.finishOrder.length - 1]
      : null;
  }
  state.phase = "finished";
  state.turnSeat = -1;
  state.claim = null;
  state.updatedAt = Date.now();
  return true;
}

/** Final table, best first. */
export function bluffStandings(state: BluffState): BluffPlayer[] {
  const placed = state.finishOrder.map((s) => state.players[s]);
  const rest = state.players.filter((p) => p.finishedRank === null);
  return [...placed, ...rest];
}

/** A player gives up: last place, and the game ends. */
export function concedeBluff(stateIn: BluffState, seat: number): BluffState {
  if (stateIn.phase === "finished" || !stateIn.players[seat]) return stateIn;

  const state = clone(stateIn);
  state.players[seat].hand = [];
  state.pile = [];
  state.claim = null;

  const others = state.players
    .filter((p) => p.finishedRank === null && p.seat !== seat)
    .sort((a, b) => a.hand.length - b.hand.length);
  for (const p of others) {
    p.finishedRank = state.finishOrder.length;
    state.finishOrder.push(p.seat);
  }
  state.players[seat].finishedRank = state.finishOrder.length;
  state.finishOrder.push(seat);

  if (state.winnerSeat === null && others.length) state.winnerSeat = others[0].seat;
  state.lastSeat = seat;
  state.phase = "finished";
  state.turnSeat = -1;
  state.updatedAt = Date.now();
  return state;
}

/** Guards against a state that has drifted — used by the test harness. */
export function auditBluff(state: BluffState): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const count = (c: BluffCard) => seen.set(c.id, (seen.get(c.id) ?? 0) + 1);

  state.players.forEach((p) => p.hand.forEach(count));
  state.pile.forEach(count);

  const expected = cardsForDecks(state.config.deckCount);
  let total = 0;
  for (const [id, n] of seen) {
    total += n;
    if (n > 1) problems.push(`Card ${id} exists ${n} times`);
  }
  if (total !== expected) problems.push(`${total} cards in play, expected ${expected}`);

  if (state.phase === "claiming" && state.turnSeat >= 0) {
    if (state.players[state.turnSeat]?.hand.length === 0) {
      problems.push(`turnSeat ${state.turnSeat} has no cards`);
    }
  }
  if (state.phase === "finished") {
    if (state.finishOrder.length !== state.players.length) {
      problems.push(`finished with ${state.finishOrder.length}/${state.players.length} placed`);
    }
    if (new Set(state.finishOrder).size !== state.finishOrder.length) {
      problems.push("finishOrder has a duplicate");
    }
  }
  return problems;
}

export { countOfRank };
