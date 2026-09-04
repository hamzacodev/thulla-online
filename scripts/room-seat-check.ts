import {
  createGame,
  applyPlay,
  legalMoves,
  activeSeats,
  awaitingAutoplay,
  canConcede,
  concede,
  concedeRejection,
  handOverToCpu,
  resolveTrick,
} from "../lib/engine/rules";
import { chooseCard } from "../lib/engine/ai";
import type { GameState } from "../lib/engine/types";
import { tableSeatOf, type RoomSeat, type RoomState } from "../lib/roomTypes";
import { shuffle, makeRng, ACE_OF_SPADES } from "../lib/engine/cards";

/**
 * The lobby chair is not the table seat.
 *
 * `seats` are handed out in join order and never move; the table order is
 * reshuffled on every deal so the same person doesn't lead every game of a
 * series. Handing a lobby chair to the engine looks correct and is wrong
 * whenever the shuffle isn't the identity — which at a three-player table is
 * five times out of six.
 *
 * This walks every permutation of a table and checks that the server, using
 * only a user id, always reaches the same seat the player's own screen does.
 */

let failures = 0;
const check = (ok: boolean, why: string) => {
  if (!ok) {
    failures++;
    if (failures <= 10) console.log(`   ! ${why}`);
  }
};

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

function roomWith(order: RoomSeat[], seats: RoomSeat[]): RoomState {
  return {
    version: 3,
    code: "TEST1",
    status: "playing",
    maxPlayers: seats.length,
    hostId: seats[0].id,
    seats,
    game: createGame({
      players: order.map((s) => ({ id: s.id, name: s.name, kind: "remote" as const })),
      config: { mode: "friends", mustLeadAceOfSpades: true, seed: 12345 },
    }),
    trickEndsAt: null,
    resultsRecorded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as RoomState;
}

/* ---------- every table order, every player ---------- */
console.log("Lobby chair vs table seat");
let mismatchedOrders = 0;

for (const count of [2, 3, 4, 5, 6]) {
  const seats: RoomSeat[] = Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    name: `P${i}`,
    seat: i,
    connected: true,
  }));

  for (const order of permutations(seats)) {
    const room = roomWith(order, seats);
    const game = room.game!;
    const identity = order.every((s, i) => s.seat === i);
    if (!identity) mismatchedOrders++;

    for (const seat of seats) {
      const tableSeat = tableSeatOf(room, seat.id);
      // What the player's own screen computes.
      const screenSeat = game.players.findIndex((p) => p.id === seat.id);
      check(tableSeat === screenSeat, `${count}p: server saw seat ${tableSeat}, screen saw ${screenSeat}`);
      check(game.players[tableSeat].id === seat.id, `${count}p: seat ${tableSeat} is somebody else`);
    }

    /* The opening lead: whoever holds the ace must be able to play it. */
    const aceSeat = game.players.findIndex((p) => p.hand.includes(ACE_OF_SPADES));
    const aceUser = game.players[aceSeat].id;

    const viaTable = applyPlay(game, tableSeatOf(room, aceUser), ACE_OF_SPADES);
    check(!viaTable.error, `${count}p: ace holder was refused the opening lead — ${viaTable.error}`);

    // And the old behaviour: prove the bug was real, on the orders where the
    // two numbers differ.
    const lobbyChair = seats.find((s) => s.id === aceUser)!.seat;
    if (lobbyChair !== aceSeat) {
      const viaChair = applyPlay(game, lobbyChair, ACE_OF_SPADES);
      check(
        !!viaChair.error,
        `${count}p: expected the lobby chair to be rejected, but it worked — the test is wrong`
      );
    }

    /* Nobody else may move. */
    for (const seat of seats) {
      if (seat.id === aceUser) continue;
      const s = tableSeatOf(room, seat.id);
      check(legalMoves(game, s).length === 0, `${count}p: seat ${s} had legal moves out of turn`);
    }
  }
}
console.log(`  ${mismatchedOrders} shuffled table orders exercised`);

/* ---------- a player who isn't at the table ---------- */
const seats: RoomSeat[] = [0, 1, 2].map((i) => ({ id: `user-${i}`, name: `P${i}`, seat: i, connected: true }));
const room = roomWith(shuffle(seats, makeRng(7)), seats);
check(tableSeatOf(room, "nobody") === -1, "an unknown user resolved to a real seat");
check(tableSeatOf({ ...room, game: null } as RoomState, "user-0") === -1, "a room with no game resolved to a seat");

/* ============================================================
   Quitting: only at the death, and leaving hands the seat over
   ============================================================ */
console.log("\nQuitting");
let quitFails = 0;
const q = (ok: boolean, why: string) => {
  if (!ok) {
    quitFails++;
    if (quitFails <= 8) console.log(`   ! ${why}`);
  }
};

/** Plays until only `target` players still hold cards. */
function playDownTo(state: GameState, target: number): GameState {
  let guard = 0;
  while (state.phase !== "finished" && activeSeats(state).length > target && guard++ < 4000) {
    if (state.phase === "trickEnd") {
      state = resolveTrick(state);
      continue;
    }
    const card = chooseCard(state, state.turnSeat, "medium") ?? legalMoves(state, state.turnSeat)[0];
    if (!card) break;
    const res = applyPlay(state, state.turnSeat, card);
    if (res.error) break;
    state = res.state;
  }
  return state;
}

for (const count of [3, 4, 5, 6, 8]) {
  for (let seed = 0; seed < 12; seed++) {
    const fresh = createGame({
      players: Array.from({ length: count }, (_, i) => ({ id: `u${i}`, name: `P${i}`, kind: "remote" as const })),
      config: { mode: "friends", mustLeadAceOfSpades: true, seed: seed * 31 + count },
    });

    /* Early on, nobody may quit. */
    const someone = fresh.players.find((p) => p.hand.length > 0)!.seat;
    q(!canConcede(fresh), `${count}p/${seed}: quitting was allowed with ${activeSeats(fresh).length} still in`);
    q(!!concedeRejection(fresh, someone), `${count}p/${seed}: no reason given for refusing an early quit`);
    const refused = concede(fresh, someone);
    q(refused.phase !== "finished", `${count}p/${seed}: an early concede ended the game anyway`);
    q(refused === fresh, `${count}p/${seed}: an early concede changed the state`);

    /* Leaving instead hands the seat over and the game carries on. */
    const handed = handOverToCpu(fresh, someone);
    q(handed.players[someone].autoplay === true, `${count}p/${seed}: handover didn't mark the seat`);
    q(handed.players[someone].id === fresh.players[someone].id, `${count}p/${seed}: handover changed the seat's owner`);
    q(handed.players[someone].kind !== "cpu", `${count}p/${seed}: handover disowned the seat — the result would vanish`);
    q(handed.phase === "playing", `${count}p/${seed}: handover ended the game`);
    q(activeSeats(handed).length === activeSeats(fresh).length, `${count}p/${seed}: handover removed a player`);
    if (handed.turnSeat === someone) {
      q(awaitingAutoplay(handed), `${count}p/${seed}: the table isn't waiting on the handed-over seat`);
    }

    /* Once it's down to two, quitting is on. */
    const endgame = playDownTo(fresh, 2);
    if (endgame.phase === "finished" || activeSeats(endgame).length > 2) continue;
    q(canConcede(endgame), `${count}p/${seed}: quitting still refused with ${activeSeats(endgame).length} left`);
    const last = activeSeats(endgame)[0];
    q(!concedeRejection(endgame, last), `${count}p/${seed}: endgame quit refused — ${concedeRejection(endgame, last)}`);
    const done = concede(endgame, last);
    q(done.phase === "finished", `${count}p/${seed}: endgame concede didn't finish the game`);
    q(done.thullaSeat === last, `${count}p/${seed}: the quitter wasn't the Thulla`);
  }
}
console.log(`  60 tables across 3/4/5/6/8 players — ${quitFails} failures`);
failures += quitFails;

console.log(failures === 0 ? "\nROOM SEAT CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
