/**
 * Trump-Patta — the rules, and nothing else.
 *
 * Pure: no React, no network, no clock beyond what it is handed. Every
 * decision about who may do what lives here, so the CPU, the local table
 * and any future server all obey the same referee rather than three
 * near-identical copies of it.
 *
 * The shape of the game: pull one card out of the deck and hide it, deal
 * the other 51, everybody throws away the pairs they were dealt, and then
 * players take turns picking a card out of the previous player's hand. Pairs
 * keep leaving until a single card is left — the partner of the one that was
 * pulled out at the start — and whoever holds it is the Thief.
 */
import {
  freshDeck,
  makeRng,
  rankOf,
  shuffle,
  type Card,
} from "../engine/cards";
import type {
  PickOutcome,
  PublicPickOutcome,
  PublicPlayer,
  RedactedState,
  TrumpPattaConfig,
  TrumpPattaPlayer,
  TrumpPattaResult,
  TrumpPattaState,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** 52 minus the one pulled out before the deal. */
export const DEALT_CARDS = 51;

export function isValidPlayerCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}

export function newGameId(): string {
  return `tp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Strips a hand down to its unpaired cards.
 *
 * A pair is two cards of the same rank; suits are irrelevant to pairing even
 * though they're still part of the card. Order is what makes this fiddlier
 * than it looks: the cards that survive have to come back in the same
 * relative order they went in, because that order belongs to the player and
 * re-sorting it here would quietly undo their arrangement every time a pair
 * came out.
 */
export function extractPairs(hand: readonly Card[]): {
  hand: Card[];
  pairs: Array<[Card, Card]>;
} {
  const byRank = new Map<string, Card[]>();
  for (const card of hand) {
    const rank = rankOf(card);
    const bucket = byRank.get(rank);
    if (bucket) bucket.push(card);
    else byRank.set(rank, [card]);
  }

  const pairs: Array<[Card, Card]> = [];
  const discarded = new Set<Card>();
  for (const cards of byRank.values()) {
    // Two at a time, in the order they sit in the hand.
    for (let i = 0; i + 1 < cards.length; i += 2) {
      pairs.push([cards[i], cards[i + 1]]);
      discarded.add(cards[i]);
      discarded.add(cards[i + 1]);
    }
  }

  return { hand: hand.filter((c) => !discarded.has(c)), pairs };
}

/** Seats still holding cards, in seat order. */
export function activeSeats(state: TrumpPattaState): number[] {
  return state.players.filter((p) => p.hand.length > 0).map((p) => p.seat);
}

/**
 * The next seat clockwise from `from` that still holds cards.
 *
 * Players who have emptied their hands are out — they neither give nor
 * receive, which is what stops a finished player being dealt back into the
 * game by someone picking from them.
 */
export function nextActiveSeat(state: TrumpPattaState, from: number): number | null {
  const n = state.players.length;
  // Stops before coming back round to `from`. Returning the seat you asked
  // from would mean a player showing their hand to themselves, and the one
  // caller that could produce it — the last player holding cards — wants a
  // null so it can end the game instead.
  for (let step = 1; step < n; step++) {
    const seat = (from + step) % n;
    if (state.players[seat].hand.length > 0) return seat;
  }
  return null;
}

/** Cards still held by anybody. Always odd, and 1 means the game is over. */
export function cardsInPlay(state: TrumpPattaState): number {
  return state.players.reduce((n, p) => n + p.hand.length, 0);
}

export interface CreateOptions {
  players: Array<{ id: string; name: string; kind: "human" | "cpu" | "remote" }>;
  config?: Partial<TrumpPattaConfig>;
}

/**
 * Deals a game.
 *
 * 52 cards, one taken out at random and kept back, the other 51 dealt round
 * the table one at a time — so with counts that don't divide 51 evenly the
 * earlier seats simply get one more, exactly as they would by hand. Then
 * everybody throws away the pairs they were dealt before anyone plays.
 */
export function createGame({ players, config }: CreateOptions): TrumpPattaState {
  if (!isValidPlayerCount(players.length)) {
    throw new Error(`Trump-Patta is for ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
  }

  const seed = config?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const deck = shuffle(freshDeck(), rng);

  // One card out, before anything is dealt. Nobody ever holds its partner's
  // match, which is the whole game.
  const removedCard = deck[0];
  const dealt = deck.slice(1);

  // 51 never divides evenly, so somebody always gets an extra card — and a
  // bigger hand is likelier to end up holding the odd one. Dealing from a
  // random seat rather than always from seat 0 stops that landing on the
  // same chairs every game: over 2,000 four-player games it was worth about
  // 45% more Thiefs for the low seats.
  const dealStart = Math.floor(rng() * players.length);
  const hands: Card[][] = players.map(() => []);
  dealt.forEach((card, i) => hands[(dealStart + i) % players.length].push(card));

  const now = Date.now();
  const discards: Array<[Card, Card]> = [];
  const built: TrumpPattaPlayer[] = players.map((p, seat) => {
    const { hand, pairs } = extractPairs(hands[seat]);
    // The opening clear-out is public, the same as any other discard.
    pairs.forEach((pair) => discards.push(pair));
    return {
      seat,
      id: p.id,
      name: p.name,
      kind: p.kind,
      hand,
      safeRank: null,
      picks: 0,
      pairsFormed: pairs.length,
    };
  });

  const state: TrumpPattaState = {
    version: 1,
    gameId: newGameId(),
    config: {
      playerCount: players.length,
      mode: config?.mode ?? "cpu",
      difficulty: config?.difficulty ?? "medium",
      seed,
    },
    players: built,
    phase: "picking",
    donorSeat: 0,
    pickerSeat: 0,
    removedCard,
    discards,
    outcome: null,
    turnNumber: 1,
    safeOrder: [],
    thiefSeat: null,
    remainingCard: null,
    startedAt: now,
    updatedAt: now,
  };

  // A player can be dealt a hand that is nothing but pairs, so being out
  // before the first turn is a real (if rare) opening.
  built.forEach((p) => {
    if (p.hand.length === 0) {
      p.safeRank = state.safeOrder.length;
      state.safeOrder.push(p.seat);
    }
  });

  // A random opener among those still holding cards, then clockwise.
  const active = activeSeats(state);
  const opener = active[Math.floor(rng() * active.length)] ?? 0;
  state.donorSeat = opener;
  const picker = nextActiveSeat(state, opener);

  if (picker === null || cardsInPlay(state) <= 1) return finish(state);
  state.pickerSeat = picker;
  return state;
}

/** Closes the game out: whoever still holds a card is the Thief. */
function finish(state: TrumpPattaState): TrumpPattaState {
  const holder = state.players.find((p) => p.hand.length > 0) ?? null;
  state.phase = "finished";
  state.thiefSeat = holder?.seat ?? null;
  state.remainingCard = holder?.hand[0] ?? null;
  state.updatedAt = Date.now();

  // Everyone who emptied their hand is safe, in the order they managed it.
  state.players
    .filter((p) => p.hand.length === 0 && p.safeRank === null)
    .forEach((p) => {
      p.safeRank = state.safeOrder.length;
      state.safeOrder.push(p.seat);
    });

  return state;
}

function clone(state: TrumpPattaState): TrumpPattaState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    discards: state.discards.map((d) => [...d] as [Card, Card]),
    safeOrder: [...state.safeOrder],
  };
}

/**
 * Takes one card out of the donor's hand and gives it to the picker.
 *
 * `position` is 1-based, and it is what the picker actually chose — the card
 * they saw in that slot. Naming the position rather than the card is
 * deliberate: it is the only identifier the picker is guaranteed to be
 * looking at, and checking the card matches the slot catches a client whose
 * view of the hand has gone stale.
 */
export function pickCard(
  state: TrumpPattaState,
  pickerSeat: number,
  position: number,
  expectCard?: Card
): TrumpPattaResult {
  if (state.phase !== "picking") return { state, error: "There is no pick to make right now." };
  if (pickerSeat !== state.pickerSeat) return { state, error: "It isn't your turn to pick." };

  const donor = state.players[state.donorSeat];
  const picker = state.players[pickerSeat];
  if (!donor || !picker) return { state, error: "That seat isn't at this table." };
  if (donor.hand.length === 0) return { state, error: "That player has no cards left." };

  if (!Number.isInteger(position) || position < 1 || position > donor.hand.length) {
    return { state, error: `Pick a card between 1 and ${donor.hand.length}.` };
  }

  const card = donor.hand[position - 1];
  // A stale hand: the picker chose slot 3 of a hand that has since changed.
  if (expectCard && expectCard !== card) {
    return { state, error: "That hand has changed — look again." };
  }

  const next = clone(state);
  const nextDonor = next.players[next.donorSeat];
  const nextPicker = next.players[pickerSeat];

  nextDonor.hand.splice(position - 1, 1);
  // Received cards go to the end of the hand: somewhere predictable, and
  // never a re-sort of an order the player chose.
  nextPicker.hand.push(card);
  nextPicker.picks += 1;

  const { hand, pairs } = extractPairs(nextPicker.hand);
  nextPicker.hand = hand;
  pairs.forEach((pair) => next.discards.push(pair));
  nextPicker.pairsFormed += pairs.length;

  const donorWentOut = nextDonor.hand.length === 0;
  if (donorWentOut && nextDonor.safeRank === null) {
    nextDonor.safeRank = next.safeOrder.length;
    next.safeOrder.push(nextDonor.seat);
  }
  if (nextPicker.hand.length === 0 && nextPicker.safeRank === null) {
    nextPicker.safeRank = next.safeOrder.length;
    next.safeOrder.push(nextPicker.seat);
  }

  const outcome: PickOutcome = {
    donorSeat: next.donorSeat,
    pickerSeat,
    card,
    fromPosition: position,
    paired: pairs[0] ?? null,
    donorWentOut,
  };
  next.outcome = outcome;
  next.phase = "reveal";
  next.updatedAt = Date.now();
  return { state: next };
}

/**
 * Moves the game on from a completed pick.
 *
 * Kept separate from `pickCard` so the table can hold the reveal on screen
 * for as long as it likes without the engine having advanced underneath it.
 */
export function resolvePick(state: TrumpPattaState): TrumpPattaState {
  if (state.phase !== "reveal") return state;
  const next = clone(state);

  // One card left in the whole game: that's the odd one, and the game's over.
  if (cardsInPlay(next) <= 1) return finish(next);

  // The player who just picked becomes the one being picked from — unless
  // they went out doing it, in which case the show moves on round the table.
  const lastPicker = next.outcome?.pickerSeat ?? next.pickerSeat;
  const donor =
    next.players[lastPicker].hand.length > 0 ? lastPicker : nextActiveSeat(next, lastPicker);
  if (donor === null) return finish(next);

  const picker = nextActiveSeat(next, donor);
  // Nobody left to pick from them: everyone else is out, so the game is done.
  if (picker === null || picker === donor) return finish(next);

  next.donorSeat = donor;
  next.pickerSeat = picker;
  next.phase = "picking";
  next.outcome = null;
  next.turnNumber += 1;
  next.updatedAt = Date.now();
  return next;
}

/**
 * Rearranges a player's own hand.
 *
 * `order` is the new arrangement, given as the cards themselves. It has to
 * be a permutation of exactly what they already hold — that check is what
 * stops a client "reordering" a card into its hand that it never had.
 */
export function reorderHand(
  state: TrumpPattaState,
  seat: number,
  order: readonly Card[]
): TrumpPattaResult {
  const player = state.players[seat];
  if (!player) return { state, error: "That seat isn't at this table." };

  if (order.length !== player.hand.length) {
    return { state, error: "That isn't your hand." };
  }
  const have = [...player.hand].sort().join(",");
  const want = [...order].sort().join(",");
  if (have !== want) return { state, error: "That isn't your hand." };

  const next = clone(state);
  next.players[seat].hand = [...order];
  next.updatedAt = Date.now();
  return { state: next };
}

/**
 * Everything one viewer is entitled to see.
 *
 * The single most important function here, and the rule is as simple as it
 * can be: **you see your own hand and nobody else's.** The `hand` field is
 * *absent* — not empty, absent — for every other player, and the hidden card
 * stays out entirely until the game has finished.
 *
 * The donor is no exception. You pick a card out of their hand face-down,
 * by position, the way you would from a fan held out across a table: you can
 * see how many cards there are and where they sit, and nothing else. An
 * earlier version showed the picker the faces, which quietly removed the
 * game — if you can see the cards you simply take the one that pairs, every
 * time, and nothing is left to decide. The skill is in how you arrange your
 * *own* hand before it is held out.
 *
 * `viewerSeat` of -1 is a spectator: public information only.
 */
export function redactFor(state: TrumpPattaState, viewerSeat: number): RedactedState {
  const over = state.phase === "finished";

  const players: PublicPlayer[] = state.players.map((p) => {
    const base: PublicPlayer = {
      seat: p.seat,
      id: p.id,
      name: p.name,
      kind: p.kind,
      cardCount: p.hand.length,
      safeRank: p.safeRank,
      picks: p.picks,
      pairsFormed: p.pairsFormed,
    };
    // Once it's over there is nothing left to protect, and the last card
    // has to be visible for the result to make sense.
    if (p.seat === viewerSeat || over) base.hand = [...p.hand];
    return base;
  });

  // What changed hands is between the two of them. Everyone else sees that
  // a card moved, from which position, and — once it hits the public pile —
  // any pair it made. Not the card itself.
  const o = state.outcome;
  const sawIt = o && (viewerSeat === o.pickerSeat || viewerSeat === o.donorSeat);
  const outcome: PublicPickOutcome | null = o
    ? {
        donorSeat: o.donorSeat,
        pickerSeat: o.pickerSeat,
        fromPosition: o.fromPosition,
        paired: o.paired,
        donorWentOut: o.donorWentOut,
        ...(sawIt || over ? { card: o.card } : {}),
      }
    : null;

  return {
    version: 1,
    gameId: state.gameId,
    config: state.config,
    phase: state.phase,
    donorSeat: state.donorSeat,
    pickerSeat: state.pickerSeat,
    players,
    discards: state.discards.map((d) => [...d] as [Card, Card]),
    outcome,
    turnNumber: state.turnNumber,
    safeOrder: [...state.safeOrder],
    thiefSeat: state.thiefSeat,
    remainingCard: over ? state.remainingCard : null,
    removedCard: over ? state.removedCard : null,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  };
}

/**
 * A player gives up.
 *
 * They take the Thief, whatever they were holding — walking out is not a way
 * to avoid losing, which is the same line every game on this platform takes
 * with a concession. Everybody still in is safe, in the order they were
 * sitting, so a quit can never hand somebody else the loss.
 */
export function concede(state: TrumpPattaState, seat: number): TrumpPattaState {
  if (state.phase === "finished") return state;
  const next = clone(state);
  const quitter = next.players[seat];
  if (!quitter) return state;

  // Everyone who hadn't already gone out is safe, quitter last.
  next.players
    .filter((p) => p.seat !== seat && p.safeRank === null)
    .forEach((p) => {
      p.safeRank = next.safeOrder.length;
      next.safeOrder.push(p.seat);
    });

  next.phase = "finished";
  next.thiefSeat = seat;
  next.remainingCard = quitter.hand[0] ?? null;
  if (quitter.safeRank !== null) {
    quitter.safeRank = null;
    next.safeOrder = next.safeOrder.filter((s) => s !== seat);
  }
  next.updatedAt = Date.now();
  return next;
}

/**
 * Final placings, best first: everyone who went out in the order they did
 * it, and the Thief last.
 *
 * This is what the rest of the platform reads. It is the same shape Thulla
 * and Bluff produce — first out wins, last is the loser — which is what
 * lets Trump-Patta use the existing series and results machinery untouched.
 */
export function standings(state: TrumpPattaState): TrumpPattaPlayer[] {
  const safe = state.safeOrder.map((seat) => state.players[seat]);
  const rest = state.players.filter((p) => p.safeRank === null);
  return [...safe, ...rest];
}

/**
 * Invariants that must hold after every single move.
 *
 * The one that matters most is card conservation: 52 cards exist, one is
 * hidden, and every other one is in exactly one hand or exactly one discarded
 * pair. A card that is in two places, or in none, means a bug that would
 * otherwise surface as an unwinnable game much later on.
 */
export function auditState(state: TrumpPattaState): string[] {
  const problems: string[] = [];
  const seen = new Map<Card, string>();

  const claim = (card: Card, where: string) => {
    const prior = seen.get(card);
    if (prior) problems.push(`${card} is in both ${prior} and ${where}`);
    else seen.set(card, where);
  };

  state.players.forEach((p) => p.hand.forEach((c) => claim(c, `${p.name}'s hand`)));
  state.discards.forEach((pair, i) => {
    if (rankOf(pair[0]) !== rankOf(pair[1])) {
      problems.push(`discard ${i} is not a pair: ${pair[0]} + ${pair[1]}`);
    }
    pair.forEach((c) => claim(c, `discard ${i}`));
  });
  claim(state.removedCard, "the hidden card");

  if (seen.size !== 52) problems.push(`${seen.size} cards accounted for, not 52`);

  const total = cardsInPlay(state);
  if (total % 2 === 0) problems.push(`${total} cards in play — should always be odd`);

  state.players.forEach((p) => {
    const { pairs } = extractPairs(p.hand);
    if (pairs.length) problems.push(`${p.name} is holding an unremoved pair`);
  });

  if (state.phase === "picking") {
    // Only while a pick is owed: during a reveal the donor may well hold
    // nothing, having just handed over their last card.
    if (state.players[state.donorSeat]?.hand.length === 0) {
      problems.push("the donor has no cards to show");
    }
    if (state.donorSeat === state.pickerSeat) problems.push("the donor is picking from themselves");
    if (state.players[state.pickerSeat]?.hand.length === 0) {
      problems.push("a player who is out is being asked to pick");
    }
  }

  if (state.phase === "finished") {
    if (total > 1) problems.push(`game finished with ${total} cards still out`);
    if (state.thiefSeat !== null && state.remainingCard) {
      if (rankOf(state.remainingCard) !== rankOf(state.removedCard)) {
        problems.push(
          `the last card ${state.remainingCard} doesn't match the hidden ${state.removedCard}`
        );
      }
    }
  }

  return problems;
}
