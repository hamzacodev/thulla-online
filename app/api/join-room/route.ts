import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GameState, Player } from "@/lib/types";

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(req: Request) {
  const { code, name } = await req.json();
  if (!code || !name) {
    return NextResponse.json({ error: "Room code and name are required." }, { status: 400 });
  }
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const state = data.state as GameState;

  if (state.status !== "waiting") {
    return NextResponse.json({ error: "That game has already started." }, { status: 400 });
  }
  if (state.players.length >= 4) {
    return NextResponse.json({ error: "Room is full (4 players max)." }, { status: 400 });
  }

  const playerId = randomId();
  const takenSeats = state.players.map((p) => p.seat);
  const seat = [0, 1, 2, 3].find((s) => !takenSeats.includes(s))!;
  const team = (seat % 2) as 0 | 1;

  const player: Player = { id: playerId, name: String(name).trim().slice(0, 20), seat, team, hand: [], connected: true };
  state.players.push(player);
  state.log = [...state.log, `${player.name} joined.`].slice(-8);
  state.updatedAt = Date.now();

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ code: roomCode, playerId });
}
