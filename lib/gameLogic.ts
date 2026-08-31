import { Card, GameState, PileEntry, RANKS, SUITS, rankValue, suitOf } from "./types";

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pushLog(state: GameState, msg: string) {
  state.log = [...state.log, msg].slice(-8);
}

/**
 * Deals a fresh shuffled deck to the current players and starts the game.
 * Dealt round-robin, one card at a time, so hands are as even as possible —
 * a standard 52-card deck only splits perfectly evenly across 4 players;
 * with 6 or 8 players some hands get one extra card, same as dealing by hand.
 */
export function dealAndStart(state: GameState): GameState {
  const deck = shuffle(freshDeck());
  const hands: Card[][] = state.players.map(() => []);
  deck.forEach((card, i) => {
    hands[i % state.players.length].push(card);
  });
  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i].sort((a, b) => {
      const su = suitOf(a).localeCompare(suitOf(b));
      return su !== 0 ? su : rankValue(a) - rankValue(b);
    }),
  }));
  return {
    ...state,
    players,
    status: "playing",
    turnSeat: 0,
    leaderSeat: 0,
    ledSuit: null,
    pile: [],
    winningTeam: null,
    log: ["Game started. Dealer's left leads first."],
    updatedAt: Date.now(),
  };
}

function activeSeats(state: GameState): number[] {
  // seats still holding cards, in seat order
  return state.players.filter((p) => p.hand.length > 0).map((p) => p.seat);
}

function nextSeat(state: GameState, fromSeat: number): number {
  const active = activeSeats(state);
  if (active.length === 0) return fromSeat;
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const candidate = (fromSeat + step) % total;
    if (active.includes(candidate)) return candidate;
  }
  return fromSeat;
}

function teamHandsEmpty(state: GameState, team: 0 | 1): boolean {
  return state.players.filter((p) => p.team === team).every((p) => p.hand.length === 0);
}

/**
 * Applies a card play from `seat`. Enforces: it must be that seat's turn, the
 * card must be in their hand, and if they hold a card of the led suit they
 * must play the led suit (server-side validation — never trust the client).
 */
export function applyPlay(stateIn: GameState, seat: number, card: Card): { state: GameState; error?: string } {
  const state: GameState = JSON.parse(JSON.stringify(stateIn));

  if (state.status !== "playing") return { state, error: "Game is not in progress." };
  if (state.turnSeat !== seat) return { state, error: "It is not your turn." };

  const player = state.players.find((p) => p.seat === seat);
  if (!player) return { state, error: "Player not found." };
  if (!player.hand.includes(card)) return { state, error: "You do not hold that card." };

  const led = state.ledSuit;
  const playedSuit = suitOf(card);

  if (led !== null) {
    const hasLedSuit = player.hand.some((c) => suitOf(c) === led);
    if (hasLedSuit && playedSuit !== led) {
      return { state, error: `You must follow suit (${led}) if you can.` };
    }
  }

  const isThulla = led !== null && playedSuit !== led;

  // remove card from hand, add to pile
  player.hand = player.hand.filter((c) => c !== card);
  state.pile.push({ card, seat });
  if (state.ledSuit === null) state.ledSuit = playedSuit;

  if (isThulla) {
    // player picks up the whole pile (including the card they just threw)
    const picked: Card[] = state.pile.map((e) => e.card);
    player.hand.push(...picked);
    pushLog(state, `${player.name} couldn't follow suit and picked up ${picked.length} cards.`);
    state.pile = [];
    state.ledSuit = null;
    state.leaderSeat = seat;
    state.turnSeat = player.hand.length > 0 ? seat : nextSeat(state, seat);
  } else {
    const stillToPlay = state.players.filter((p) => p.hand.length > 0).length;
    const playedThisTrick = state.pile.length;
    const activeCount = activeSeats(state).length;

    if (playedThisTrick >= activeCount) {
      // trick complete — highest card of led suit wins, pile is discarded
      const ledSuit = state.ledSuit!;
      const winning = state.pile
        .filter((e: PileEntry) => suitOf(e.card) === ledSuit)
        .sort((a, b) => rankValue(b.card) - rankValue(a.card))[0];
      const winner = state.players.find((p) => p.seat === winning.seat)!;
      pushLog(state, `${winner.name} won the trick with ${winning.card}.`);
      state.pile = [];
      state.ledSuit = null;
      state.leaderSeat = winner.seat;
      state.turnSeat = winner.hand.length > 0 ? winner.seat : nextSeat(state, winner.seat);
    } else {
      state.turnSeat = nextSeat(state, seat);
    }
    void stillToPlay;
  }

  // win check
  if (teamHandsEmpty(state, 0)) {
    state.status = "finished";
    state.winningTeam = 0;
    pushLog(state, "Team A emptied their hands — Team A wins!");
  } else if (teamHandsEmpty(state, 1)) {
    state.status = "finished";
    state.winningTeam = 1;
    pushLog(state, "Team B emptied their hands — Team B wins!");
  }

  state.updatedAt = Date.now();
  return { state };
}
