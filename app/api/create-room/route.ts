import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { GameState, Player, PLAYER_COUNT_OPTIONS, PlayerCount } from "@/lib/types";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { maxPlayers } = await req.json();
  const requestedCount = Number(maxPlayers);
  if (!PLAYER_COUNT_OPTIONS.includes(requestedCount as PlayerCount)) {
    return NextResponse.json({ error: `Player count must be one of: ${PLAYER_COUNT_OPTIONS.join(", ")}.` }, { status: 400 });
  }
  const count = requestedCount as PlayerCount;

  const code = randomCode();
  const player: Player = { id: user.id, name: user.username, seat: 0, team: 0, hand: [], connected: true };

  const state: GameState = {
    code,
    status: "waiting",
    maxPlayers: count,
    players: [player],
    turnSeat: 0,
    leaderSeat: 0,
    ledSuit: null,
    pile: [],
    winningTeam: null,
    log: [`${player.name} created a ${count}-player room.`],
    updatedAt: Date.now(),
  };

  const { error } = await supabaseAdmin
    .from("rooms")
    .insert({ code, state, host_id: user.id, max_players: count });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ code });
}
