import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { isValidPlayerCount, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/engine/rules";
import type { RoomState } from "@/lib/roomTypes";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous glyphs
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { maxPlayers } = await req.json();
  const count = Number(maxPlayers);
  if (!isValidPlayerCount(count)) {
    return NextResponse.json(
      { error: `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.` },
      { status: 400 }
    );
  }

  const code = randomCode();
  const state: RoomState = {
    version: 3,
    code,
    status: "waiting",
    maxPlayers: count,
    hostId: user.id,
    seats: [{ id: user.id, name: user.username, seat: 0, connected: true }],
    game: null,
    trickEndsAt: null,
    resultsRecorded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const { error } = await supabaseAdmin
    .from("rooms")
    .insert({ code, state, host_id: user.id, max_players: count });
  if (error) {
    return NextResponse.json(
      { error: "Couldn't create that room. Try again in a moment." },
      { status: 500 }
    );
  }
  return NextResponse.json({ code });
}
