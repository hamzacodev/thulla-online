import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { GameState, Player } from "@/lib/types";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Room code is required." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const state = data.state as GameState;

  if (state.status !== "waiting") {
    return NextResponse.json({ error: "That game has already started." }, { status: 400 });
  }
  if (state.players.some((p) => p.id === user.id)) {
    // already in this room (e.g. refreshed the page) — just let them back in
    return NextResponse.json({ code: roomCode });
  }
  if (state.players.length >= state.maxPlayers) {
    return NextResponse.json({ error: `Room is full (${state.maxPlayers} players max).` }, { status: 400 });
  }

  const takenSeats = state.players.map((p) => p.seat);
  const seat = Array.from({ length: state.maxPlayers }, (_, i) => i).find((s) => !takenSeats.includes(s))!;
  const team = (seat % 2) as 0 | 1;

  const player: Player = { id: user.id, name: user.username, seat, team, hand: [], connected: true };
  state.players.push(player);
  state.log = [...state.log, `${player.name} joined.`].slice(-8);
  state.updatedAt = Date.now();

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ code: roomCode });
}
