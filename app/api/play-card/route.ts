import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GameState } from "@/lib/types";
import { applyPlay } from "@/lib/gameLogic";

export async function POST(req: Request) {
  const { code, playerId, card } = await req.json();
  if (!code || !playerId || !card) {
    return NextResponse.json({ error: "Missing code, playerId, or card." }, { status: 400 });
  }
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const state = data.state as GameState;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return NextResponse.json({ error: "You are not in this room." }, { status: 403 });

  const result = applyPlay(state, player.seat, card);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state: result.state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
