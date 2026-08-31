import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GameState } from "@/lib/types";
import { dealAndStart } from "@/lib/gameLogic";

export async function POST(req: Request) {
  const { code, playerId } = await req.json();
  if (!code || !playerId) return NextResponse.json({ error: "Missing code or playerId." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  let state = data.state as GameState;

  if (state.players[0]?.id !== playerId) {
    return NextResponse.json({ error: "Only the host can start the game." }, { status: 403 });
  }
  if (state.players.length !== 4) {
    return NextResponse.json({ error: "Need exactly 4 players to start." }, { status: 400 });
  }
  if (state.status !== "waiting") {
    return NextResponse.json({ error: "Game already started." }, { status: 400 });
  }

  state = dealAndStart(state);

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
