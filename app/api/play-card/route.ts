import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authHelpers";
import { applyPlay } from "@/lib/engine/rules";
import { loadRoom, markTrickEnd, maybeResolveTrick, recordRoomResults, saveRoom } from "@/lib/roomFlow";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code, card } = await req.json();
  if (!code || !card) return NextResponse.json({ error: "Missing room code or card." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const state = await loadRoom(roomCode);
  if (!state) return NextResponse.json({ error: "No room with that code." }, { status: 404 });

  const seat = state.seats.find((s) => s.id === user.id);
  if (!seat) return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  if (!state.game) return NextResponse.json({ error: "The game hasn't started yet." }, { status: 400 });

  // If the previous trick's display window has passed, clear it first — that
  // way a room can never wedge on an unresolved trick, whatever the clients
  // did or didn't do.
  maybeResolveTrick(state);

  const result = applyPlay(state.game, seat.seat, String(card));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  state.game = result.state;
  markTrickEnd(state);
  state.updatedAt = Date.now();

  if (state.game.phase === "finished") {
    state.status = "finished";
    await recordRoomResults(state);
  }

  if (!(await saveRoom(roomCode, state))) {
    return NextResponse.json({ error: "Couldn't save that move. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
