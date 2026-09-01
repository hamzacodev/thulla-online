import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authHelpers";
import { loadRoom, maybeResolveTrick, recordRoomResults, saveRoom } from "@/lib/roomFlow";

/**
 * Clears a finished trick after everyone has had a moment to see it.
 *
 * Every client in the room calls this once the display window elapses; the
 * first one does the work and the rest are harmless no-ops. `play-card`
 * also resolves a stale trick, so an empty room recovers on its own.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const state = await loadRoom(roomCode);
  if (!state) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!state.seats.some((s) => s.id === user.id)) {
    return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  }

  if (!maybeResolveTrick(state)) return NextResponse.json({ ok: true, changed: false });

  if (state.game?.phase === "finished") {
    state.status = "finished";
    await recordRoomResults(state);
  }
  await saveRoom(roomCode, state);
  return NextResponse.json({ ok: true, changed: true });
}
