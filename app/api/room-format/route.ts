import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { setRoomFormat } from "@/lib/roomFlow";
import { isRoomState, type RoomState } from "@/lib/roomTypes";

/**
 * The host chooses how long the match is.
 *
 * Host-only, and only while the room is still waiting. Both checks are here
 * rather than in the lobby's markup: the client decides which controls to
 * draw, but the server decides what is allowed. A guest posting straight to
 * this route gets the same answer as a guest who found a hidden button.
 *
 * Once the first game has been dealt the format can only be *shortened* —
 * a best of 7 can become a best of 5, but never the other way round, and
 * never below the number of games already played. Lengthening it mid-series
 * would move a finish line somebody has already been playing towards.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code, bestOf } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!isRoomState(data.state)) {
    return NextResponse.json({ error: "That room was created by an older version of the game." }, { status: 409 });
  }

  const state = data.state as RoomState;
  if (state.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can change the format." }, { status: 403 });
  }

  const problem = setRoomFormat(state, Number(bestOf));
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) {
    return NextResponse.json({ error: "Couldn't save the format. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, bestOf: state.bestOf });
}
