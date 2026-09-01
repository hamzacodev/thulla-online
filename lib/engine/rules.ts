import {
  ACE_OF_SPADES,
  Card,
  Suit,
  freshDeck,
  makeRng,
  rankValue,
  shuffle,
  sortHand,
  suitName,
  suitOf,
} from "./cards";
import type { EnginePlayer, GameConfig, GameState, PlayResult, PileEntry, TrickOutcome } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export function isValidPlayerCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}

const clone = <T,>(v: T): T => structuredClone(v);

/** Seats that still hold cards, in seat order. */
export function activeSeats(state: GameState): number[] {
  return state.players.filter((p) => p.hand.length > 0).map((p) => p.seat);
}

/** Walks clockwise from `from` to the next seat that still holds cards. */
function nextActiveSeat(state: GameState, from: number): number | null {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const seat = (from + step) % total;
    if (state.players[seat].hand.length > 0) return seat;
  }
  return state.players[from]?.hand.length ? from : null;
}

/** Clockwise turn order for a trick, starting at the leader. */
function orderFrom(state: GameState, leader: number): number[] {
  const total = state.players.length;
  const order: number[] = [];
  for (let step = 0; step < total; step++) {
    const seat = (leader + step) % total;
    if (state.players[seat].hand.length > 0) order.push(seat);
  }
  return order;
}

/** Highest card of the led suit currently on the table. */
function highestOfLedSuit(pile: PileEntry[], led: Suit): PileEntry {
  return pile
    .filter((e) => suitOf(e.card) === led)
    .reduce((best, e) => (rankValue(e.card) > rankValue(best.card) ? e : best));
}

/**
 * A per-deal identifier. `randomUUID` where it exists (all current browsers
 * on a secure origin, and Node); the fallback keeps plain-HTTP dev working.
 */
export function newGameId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateGameOptions {
  players: Array<Pick<EnginePlayer, "id" | "name" | "kind">>;
  config?: Partial<Omit<GameConfig, "playerCount">>;
}

/**
 * Builds a dealt, ready-to-play game.
 *
 * The deck is dealt round-robin one card at a time, so with counts that don't
 * divide 52 evenly (everything except 2 and 4) the earlier seats simply get
 * one extra card — exactly what happens dealing by hand.
 */
export function createGame({ players, config }: CreateGameOptions): GameState {
  if (!isValidPlayerCount(players.length)) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.`);
  }

  const seed = config?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const deck = shuffle(freshDeck(), rng);

  const hands: Card[][] = players.map(() => []);
  deck.forEach((card, i) => hands[i % players.length].push(card));

  const enginePlayers: EnginePlayer[] = players.map((p, seat) => ({
    seat,
    id: p.id,
    name: p.name,
    kind: p.kind,
    hand: sortHand(hands[seat]),
    finishedRank: null,
    connected: true,
  }));

  const mustLeadAceOfSpades = config?.mustLeadAceOfSpades ?? true;
  const firstTrickImmune = config?.firstTrickImmune ?? true;

  // The Ace rule is load-bearing, not decoration: the starting seat is
  // derived from who was actually dealt the A♠.
  const aceSeat = enginePlayers.findIndex((p) => p.hand.includes(ACE_OF_SPADES));
  const leaderSeat = aceSeat >= 0 ? aceSeat : 0;

  const state: GameState = {
    version: 3,
    gameId: newGameId(),
    config: {
      playerCount: players.length,
      mode: config?.mode ?? "cpu",
      mustLeadAceOfSpades,
      firstTrickImmune,
      difficulty: config?.difficulty ?? "medium",
      seed,
    },
    players: enginePlayers,
    phase: "playing",
    turnSeat: leaderSeat,
    leaderSeat,
    ledSuit: null,
    pile: [],
    trickOrder: [],
    trickNumber: 1,
    trickOutcome: null,
    mustPlay: mustLeadAceOfSpades && aceSeat >= 0 ? ACE_OF_SPADES : null,
    finishOrder: [],
    thullaSeat: null,
    voids: players.map(() => []),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.trickOrder = orderFrom(state, leaderSeat);
  return state;
}

/**
 * Which cards `seat` may legally play right now. The UI dims everything else
 * and refuses the tap, but this is also the server's authority — the same
 * function decides both, so a hand-rolled request can't get around it.
 */
export function legalMoves(state: GameState, seat: number): Card[] {
  if (state.phase !== "playing" || state.turnSeat !== seat) return [];
  const player = state.players[seat];
  if (!player || player.hand.length === 0) return [];

  if (state.mustPlay && player.hand.includes(state.mustPlay)) return [state.mustPlay];

  const led = state.ledSuit;
  if (led === null) return [...player.hand];

  const followers = player.hand.filter((c) => suitOf(c) === led);
  return followers.length > 0 ? followers : [...player.hand];
}

export function isLegalMove(state: GameState, seat: number, card: Card): boolean {
  return legalMoves(state, seat).includes(card);
}

/** Why a specific card was rejected, phrased for a player rather than a log. */
export function rejectionReason(state: GameState, seat: number, card: Card): string | null {
  if (isLegalMove(state, seat, card)) return null;
  const player = state.players[seat];
  if (state.phase !== "playing") return "Hold on — this trick isn't finished yet.";
  if (state.turnSeat !== seat) return "Not your turn yet — thoda sabar!";
  if (!player?.hand.includes(card)) return "That card isn't in your hand.";
  if (state.mustPlay && player.hand.includes(state.mustPlay)) {
    return "Ace of Spades starts the game — you have to lead it.";
  }
  if (state.ledSuit) {
    return `Oye! ${suitName(state.ledSuit)} chal raha hai — you have to follow the suit.`;
  }
  return "You can't play that card right now.";
}

/**
 * Plays one card. Ends the trick when it should, but does NOT clear the
 * table — that's `resolveTrick`, so the UI gets a beat to show the result.
 */
export function applyPlay(stateIn: GameState, seat: number, card: Card): PlayResult {
  if (stateIn.phase === "trickEnd") {
    return { state: stateIn, error: "Hold on — this trick isn't finished yet." };
  }
  if (stateIn.phase !== "playing") {
    return { state: stateIn, error: "The game isn't in progress." };
  }
  if (stateIn.turnSeat !== seat) {
    return { state: stateIn, error: "It's not your turn." };
  }
  const check = rejectionReason(stateIn, seat, card);
  if (check) return { state: stateIn, error: check };

  const state = clone(stateIn);
  const player = state.players[seat];

  player.hand = player.hand.filter((c) => c !== card);
  state.pile.push({ card, seat });
  if (state.ledSuit === null) state.ledSuit = suitOf(card);
  if (state.mustPlay === card) state.mustPlay = null;

  const led = state.ledSuit;
  const brokeSuit = suitOf(card) !== led;

  // Throwing off-suit proves this seat holds none of the led suit. Recorded
  // even on the immune first trick — the pile isn't at stake there, but the
  // information is just as true, and everyone at the table saw it.
  if (brokeSuit && led !== null) {
    if (!state.voids) state.voids = state.players.map(() => []);
    const seen = state.voids[seat] ?? [];
    if (!seen.includes(led)) state.voids[seat] = [...seen, led];
  }

  // The opening trick is a free round: being void there costs nobody the
  // pile. Play continues and the trick is settled the ordinary way.
  // `?? true` so games saved before the rule existed still get it.
  const immune = (state.config.firstTrickImmune ?? true) && state.trickNumber === 1;

  if (brokeSuit && !immune) {
    // The thulla. Trick stops dead here and the player sitting on the
    // highest card of the led suit eats everything on the table — including
    // the off-suit card that was just thrown at them.
    const high = highestOfLedSuit(state.pile, led);
    state.trickOutcome = {
      kind: "pickup",
      collectorSeat: high.seat,
      highCard: high.card,
      brokeBySeat: seat,
      brokeWith: card,
      cards: state.pile.map((e) => e.card),
    };
    state.phase = "trickEnd";
  } else if (state.pile.length >= state.trickOrder.length) {
    // Everyone still in the game followed suit. Highest takes it and the
    // whole pile leaves play for good.
    const high = highestOfLedSuit(state.pile, led);
    state.trickOutcome = {
      kind: "discard",
      winnerSeat: high.seat,
      highCard: high.card,
      cards: state.pile.map((e) => e.card),
    };
    state.phase = "trickEnd";
  } else {
    const idx = state.trickOrder.indexOf(seat);
    state.turnSeat = state.trickOrder[(idx + 1) % state.trickOrder.length];
  }

  state.updatedAt = Date.now();
  return { state };
}

/**
 * Applies the finished trick: discards or hands over the pile, records who
 * got out, and opens the next trick (or ends the game).
 */
export function resolveTrick(stateIn: GameState): GameState {
  if (stateIn.phase !== "trickEnd" || !stateIn.trickOutcome) return stateIn;

  const state = clone(stateIn);
  const outcome = state.trickOutcome as TrickOutcome;
  let nextLeader: number;

  if (outcome.kind === "pickup") {
    const collector = state.players[outcome.collectorSeat];
    collector.hand = sortHand([...collector.hand, ...outcome.cards]);
    nextLeader = outcome.collectorSeat;

    // A void is only true until someone hands the suit back. Eating the pile
    // does exactly that, so forget the voids this collector no longer has.
    if (state.voids?.[outcome.collectorSeat]?.length) {
      const gained = new Set(outcome.cards.map(suitOf));
      state.voids[outcome.collectorSeat] = state.voids[outcome.collectorSeat].filter(
        (suit) => !gained.has(suit)
      );
    }
  } else {
    nextLeader = outcome.winnerSeat;
  }

  // Anyone who shed their last card this trick is out. Order them by when
  // they played, so going out earlier gives the better placing. The trick
  // winner is credited first — winning the final trick shouldn't punish you.
  const wentOut = state.pile
    .map((e) => e.seat)
    .filter((s) => state.players[s].hand.length === 0 && state.players[s].finishedRank === null);

  if (outcome.kind === "discard" && wentOut.includes(outcome.winnerSeat)) {
    wentOut.splice(wentOut.indexOf(outcome.winnerSeat), 1);
    wentOut.unshift(outcome.winnerSeat);
  }
  for (const s of wentOut) {
    state.players[s].finishedRank = state.finishOrder.length;
    state.finishOrder.push(s);
  }

  state.pile = [];
  state.ledSuit = null;
  state.trickNumber += 1;

  const remaining = activeSeats(state);

  if (remaining.length <= 1) {
    state.phase = "finished";
    if (remaining.length === 1) {
      state.thullaSeat = remaining[0];
      state.players[remaining[0]].finishedRank = state.finishOrder.length;
      state.finishOrder.push(remaining[0]);
    } else {
      // Everyone emptied out on the same trick. The last one to shed is
      // the Thulla, so there is always exactly one.
      state.thullaSeat = state.finishOrder.length ? state.finishOrder[state.finishOrder.length - 1] : null;
    }
    state.turnSeat = -1;
    state.updatedAt = Date.now();
    return state;
  }

  const leader = state.players[nextLeader].hand.length > 0 ? nextLeader : nextActiveSeat(state, nextLeader)!;
  state.leaderSeat = leader;
  state.turnSeat = leader;
  state.trickOrder = orderFrom(state, leader);
  state.phase = "playing";
  state.updatedAt = Date.now();
  return state;
}

/**
 * A thulla *move*: somebody couldn't follow suit, so the player sitting on
 * the highest card of the led suit has the whole pile dumped on them. Not
 * to be confused with `thullaSeat` on the state, which is the player left
 * holding cards at the very end — the Thulla of the whole game.
 *
 * This is a selector over state the engine already decided — the rules
 * determine *when* a thulla happens, and the UI only asks. Returns null in
 * every other situation, including a trick that everyone followed.
 */
export interface ThullaEvent {
  /** Unique per thulla within a game: a trick can only end once. */
  trickNumber: number;
  /** The player who picks up the pile — the one who "gets the thulla". */
  collectorSeat: number;
  /** The player who was void and ended the trick. */
  brokeBySeat: number;
  brokeWith: Card;
  cards: Card[];
}

export function thullaEvent(state: GameState): ThullaEvent | null {
  if (state.phase !== "trickEnd") return null;
  const outcome = state.trickOutcome;
  if (!outcome || outcome.kind !== "pickup") return null;
  return {
    trickNumber: state.trickNumber,
    collectorSeat: outcome.collectorSeat,
    brokeBySeat: outcome.brokeBySeat,
    brokeWith: outcome.brokeWith,
    cards: outcome.cards,
  };
}

/** Final placings, best first. Index 0 won; the last entry is the Thulla. */
export function standings(state: GameState): EnginePlayer[] {
  const ranked = state.finishOrder.map((seat) => state.players[seat]);
  const rest = state.players.filter((p) => p.finishedRank === null);
  return [...ranked, ...rest];
}

/**
 * A player gives up.
 *
 * Conceding makes you the Thulla and ends the game there. That is a
 * deliberate choice on both counts. Ranking a quitter anywhere but last
 * would make walking out the cheapest way to dodge a losing hand; and
 * carrying on with their cards pulled out of the deck would leave two
 * players who both deserve to be the Thulla, which the engine, the results
 * table and every stat built on it all assume can't happen.
 *
 * Everyone who hadn't finished yet is placed by how close they were —
 * fewest cards first — so a concession still settles the table honestly
 * rather than voiding the game for the people who were winning it.
 */
export function concede(stateIn: GameState, seat: number): GameState {
  if (stateIn.phase === "finished") return stateIn;
  const player = stateIn.players[seat];
  if (!player) return stateIn;

  const state = clone(stateIn);
  // Their cards leave play. auditState allows discards, so this is fine —
  // it only ever asserts that no card is duplicated or invented.
  state.players[seat].hand = [];
  state.pile = [];
  state.ledSuit = null;
  state.trickOutcome = null;

  const stillPlaying = state.players
    .filter((p) => p.finishedRank === null && p.seat !== seat)
    .sort((a, b) => a.hand.length - b.hand.length);

  for (const p of stillPlaying) {
    p.finishedRank = state.finishOrder.length;
    state.finishOrder.push(p.seat);
  }
  state.players[seat].finishedRank = state.finishOrder.length;
  state.finishOrder.push(seat);

  state.conceded = [...(state.conceded ?? []), seat];
  state.thullaSeat = seat;
  state.phase = "finished";
  state.turnSeat = -1;
  state.updatedAt = Date.now();
  return state;
}

/** Guard against a state that has drifted — used by tests and the API. */
export function auditState(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<Card, number>();
  const count = (c: Card) => seen.set(c, (seen.get(c) ?? 0) + 1);

  for (const p of state.players) p.hand.forEach(count);
  state.pile.forEach((e) => count(e.card));

  // Discarded cards legitimately leave play, so we only assert that nothing
  // is duplicated or invented — not that all 52 are still accounted for.
  for (const [card, n] of seen) {
    if (n > 1) problems.push(`Card ${card} appears ${n} times`);
    if (!freshDeck().includes(card)) problems.push(`Card ${card} is not a real card`);
  }
  if (state.phase === "playing") {
    if (!state.trickOrder.includes(state.turnSeat)) {
      problems.push(`turnSeat ${state.turnSeat} is not in the trick order`);
    }
    if (state.players[state.turnSeat]?.hand.length === 0) {
      problems.push(`turnSeat ${state.turnSeat} has no cards`);
    }
  }
  return problems;
}
