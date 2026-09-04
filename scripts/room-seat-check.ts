import { createGame, applyPlay, legalMoves } from "../lib/engine/rules";
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

console.log(failures === 0 ? "\nROOM SEAT CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
