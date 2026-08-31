import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GameState, Player } from "@/lib/types";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const code = randomCode();
  const hostId = randomId();

  const player: Player = { id: hostId, name: name.trim().slice(0, 20), seat: 0, team: 0, hand: [], connected: true };

  const state: GameState = {
    code,
    status: "waiting",
    players: [player],
    turnSeat: 0,
    leaderSeat: 0,
    ledSuit: null,
    pile: [],
    winningTeam: null,
    log: [`${player.name} created the room.`],
    updatedAt: Date.now(),
  };

  const { error } = await supabaseAdmin.from("rooms").insert({ code, state });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ code, playerId: hostId });
}
