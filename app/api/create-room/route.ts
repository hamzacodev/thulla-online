import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { isValidPlayerCount, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/engine/rules";
import type { RoomState } from "@/lib/roomTypes";
import { isValidBestOf } from "@/lib/series/rules";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@/lib/roomCode";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { maxPlayers, bestOf } = await req.json();
  const count = Number(maxPlayers);
  if (!isValidPlayerCount(count)) {
    return NextResponse.json(
      { error: `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.` },
      { status: 400 }
    );
  }

  // The match format, chosen up front and still editable in the lobby until
  // the first deal. Validated here as well as there, because a room created
  // with a nonsense format would be locked into it.
  const format = bestOf === undefined ? 1 : Number(bestOf);
  if (!isValidBestOf(format)) {
    return NextResponse.json(
      { error: "A series has to be an odd number of games — an even one can finish level." },
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
    bestOf: format,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const { error } = await supabaseAdmin
    .from("rooms")
    .insert({ code, state, host_id: user.id, max_players: count });

  if (error) {
    // 23514 is a check-constraint violation. The only one that can fire
    // here is the old 4-8 player limit on a database that hasn't had
    // supabase-schema.sql re-run — worth saying plainly rather than
    // blaming the network.
    if (error.code === "23514") {
      return NextResponse.json(
        {
          error:
            `${count}-player rooms need the latest database schema. ` +
            "Run supabase-schema.sql in the Supabase SQL editor, or pick 4-8 players for now.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't create that room. Try again in a moment." },
      { status: 500 }
    );
  }
  return NextResponse.json({ code });
}
