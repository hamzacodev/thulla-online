import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { isRoomState, type RoomState } from "@/lib/roomTypes";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Room code is required." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!isRoomState(data.state)) {
    return NextResponse.json({ error: "That room was created by an older version of the game." }, { status: 409 });
  }

  const state = data.state as RoomState;

  // Rejoining after a refresh is always allowed, even mid-game.
  const existing = state.seats.find((s) => s.id === user.id);
  if (existing) {
    if (!existing.connected) {
      existing.connected = true;
      state.updatedAt = Date.now();
      await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
    }
    return NextResponse.json({ code: roomCode });
  }

  if (state.status !== "waiting") {
    return NextResponse.json({ error: "That game has already started." }, { status: 400 });
  }
  if (state.seats.length >= state.maxPlayers) {
    return NextResponse.json({ error: `Room is full (${state.maxPlayers} players).` }, { status: 400 });
  }

  const taken = new Set(state.seats.map((s) => s.seat));
  const seat = Array.from({ length: state.maxPlayers }, (_, i) => i).find((s) => !taken.has(s));
  if (seat === undefined) return NextResponse.json({ error: "Room is full." }, { status: 400 });

  state.seats.push({ id: user.id, name: user.username, seat, connected: true });
  state.seats.sort((a, b) => a.seat - b.seat);
  state.updatedAt = Date.now();

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) {
    return NextResponse.json({ error: "Couldn't join that room. Try again." }, { status: 500 });
  }
  return NextResponse.json({ code: roomCode });
}
