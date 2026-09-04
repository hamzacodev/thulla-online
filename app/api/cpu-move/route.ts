import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authHelpers";
import { applyPlay, awaitingAutoplay, legalMoves } from "@/lib/engine/rules";
import { chooseCard } from "@/lib/engine/ai";
import { loadRoom, markTrickEnd, maybeResolveTrick, recordRoomResults, saveRoom } from "@/lib/roomFlow";

/**
 * Plays a turn for a seat whose owner walked away.
 *
 * Online turns are driven by whoever's turn it is sending a request, which
 * works right up until nobody is sitting there. So the clients that *are*
 * present poke this instead — the same shape as `resolve-trick`, where every
 * client asks and the server makes all but the first a no-op.
 *
 * `since` is what stops two clients playing two cards for the same seat.
 * Each sends the `updatedAt` it was looking at; the first request moves the
 * game on and the rest no longer match, so they're refused rather than
 * stacking up moves. The card itself is always the server's choice — a
 * client asks for a turn to be taken, never for a particular card.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code, since } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const state = await loadRoom(roomCode);
  if (!state) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!state.seats.some((s) => s.id === user.id)) {
    return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  }
  if (!state.game) return NextResponse.json({ ok: true, played: false });

  // Clear a finished trick first, exactly as a real move would.
  maybeResolveTrick(state);

  if (!awaitingAutoplay(state.game)) return NextResponse.json({ ok: true, played: false });

  // Somebody else already moved the game on since this client looked.
  if (typeof since === "number" && state.game.updatedAt !== since) {
    return NextResponse.json({ ok: true, played: false, stale: true });
  }

  const seat = state.game.turnSeat;
  const card = chooseCard(state.game, seat, state.game.config.difficulty) ?? legalMoves(state.game, seat)[0];
  if (!card) return NextResponse.json({ ok: true, played: false });

  const result = applyPlay(state.game, seat, card);
  if (result.error) return NextResponse.json({ ok: true, played: false });

  state.game = result.state;
  markTrickEnd(state);
  state.updatedAt = Date.now();

  if (state.game.phase === "finished") {
    state.status = "finished";
    await recordRoomResults(state);
  }

  if (!(await saveRoom(roomCode, state))) {
    return NextResponse.json({ error: "Couldn't save that move." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, played: true, card });
}
