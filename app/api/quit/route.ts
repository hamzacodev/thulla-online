import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { concede, concedeRejection, handOverToCpu } from "@/lib/engine/rules";
import { recordRoomResults } from "@/lib/roomFlow";
import { isRoomState, tableSeatOf, type RoomState } from "@/lib/roomTypes";

/**
 * Giving up on an online game.
 *
 * The caller becomes the Thulla and the game ends. Anyone who hadn't
 * finished is placed by how close they were, so the people who were winning
 * still get the result they earned — a concession settles the table rather
 * than voiding it.
 *
 * Results are written here exactly as they are for a game played out, which
 * is the point: quitting is a way to stop playing, not a way to avoid the
 * loss going on your record.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code, handOver } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!isRoomState(data.state)) {
    return NextResponse.json({ error: "That room was created by an older version of the game." }, { status: 409 });
  }

  const state = data.state as RoomState;
  const seat = state.seats.find((s) => s.id === user.id);
  if (!seat) return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  if (!state.game || state.game.phase === "finished") {
    return NextResponse.json({ error: "There's no game in progress." }, { status: 400 });
  }

  // The table seat, not the lobby chair — acting on the wrong index would
  // hit whoever happens to be sitting there.
  const tableSeat = tableSeatOf(state, user.id);
  if (tableSeat < 0) {
    return NextResponse.json({ error: "You're not at this table." }, { status: 403 });
  }

  // Leaving mid-game: the computer takes over the seat and everybody else
  // plays on. The seat keeps its owner, so they still place and still get a
  // result — only who picks the cards has changed.
  if (handOver === true) {
    state.game = handOverToCpu(state.game, tableSeat);
    state.updatedAt = Date.now();
    const { error: handError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
    if (handError) return NextResponse.json({ error: "Couldn't hand over. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true, handedOver: true });
  }

  // Quitting outright ends the game for the whole table, so it is only on
  // once the table is down to the last two. Enforced here, not just in the
  // dialog: the dialog is a courtesy, this is the rule.
  const refusal = concedeRejection(state.game, tableSeat);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });

  state.game = concede(state.game, tableSeat);
  state.status = "finished";
  state.trickEndsAt = null;
  state.rematchReady = [];
  state.updatedAt = Date.now();

  await recordRoomResults(state);

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) return NextResponse.json({ error: "Couldn't quit. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
