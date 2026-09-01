import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { createGame } from "@/lib/engine/rules";
import { isRoomState, type RoomState } from "@/lib/roomTypes";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!isRoomState(data.state)) {
    return NextResponse.json({ error: "That room was created by an older version of the game." }, { status: 409 });
  }

  const state = data.state as RoomState;
  if (state.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can start the game." }, { status: 403 });
  }
  if (state.status === "playing") return NextResponse.json({ ok: true });
  if (state.seats.length !== state.maxPlayers) {
    return NextResponse.json(
      { error: `Waiting for ${state.maxPlayers - state.seats.length} more player(s).` },
      { status: 400 }
    );
  }

  // A rematch reuses the room: same seats, brand new deal and gameId.
  state.game = createGame({
    players: state.seats.map((s) => ({ id: s.id, name: s.name, kind: "remote" as const })),
    config: { mode: "friends", mustLeadAceOfSpades: true },
  });
  state.status = "playing";
  state.trickEndsAt = null;
  state.resultsRecorded = false;
  state.updatedAt = Date.now();

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: "Couldn't start the game. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
