import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthedUser } from "@/lib/authHelpers";
import { dealNewGame } from "@/lib/roomFlow";
import { isRoomState, type RoomState } from "@/lib/roomTypes";

/**
 * "Play again" for an online room.
 *
 * Every player at the table gets a say, not just the host — waiting on one
 * particular person to still have the tab open is how a table full of people
 * who all want another game ends up sitting there doing nothing. The deal
 * fires by itself the moment the last seat says yes.
 *
 * The host can also deal without waiting (`now: true`), which is the way out
 * when somebody has wandered off and is never going to answer.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code, now } = await req.json();
  if (!code) return NextResponse.json({ error: "Missing room code." }, { status: 400 });
  const roomCode = String(code).trim().toUpperCase();

  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", roomCode).single();
  if (error || !data) return NextResponse.json({ error: "No room with that code." }, { status: 404 });
  if (!isRoomState(data.state)) {
    return NextResponse.json({ error: "That room was created by an older version of the game." }, { status: 409 });
  }

  const state = data.state as RoomState;

  if (!state.seats.some((s) => s.id === user.id)) {
    return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  }
  // Already dealt — somebody else's vote got there first. Not an error: this
  // client is about to see the new game arrive over realtime anyway.
  if (state.status === "playing") return NextResponse.json({ ok: true, started: true });
  if (state.status !== "finished" || state.game?.phase !== "finished") {
    return NextResponse.json({ error: "That game hasn't finished yet." }, { status: 400 });
  }

  // A won series is finished. Another game would be game N+1 of a match
  // that already has a winner, so it is refused here rather than left to
  // whichever screen happens to hide the button.
  if (state.series && state.series.status === "completed") {
    return NextResponse.json(
      { error: "That series is over. Start a new one to keep playing." },
      { status: 400 }
    );
  }

  const seatIds = state.seats.map((s) => s.id);
  const ready = new Set((state.rematchReady ?? []).filter((id) => seatIds.includes(id)));

  if (now === true) {
    if (state.hostId !== user.id) {
      return NextResponse.json({ error: "Only the host can deal without waiting." }, { status: 403 });
    }
  } else if (ready.has(user.id)) {
    // Tapping it again takes the vote back.
    ready.delete(user.id);
  } else {
    ready.add(user.id);
  }

  const everyone = now === true || seatIds.every((id) => ready.has(id));
  if (everyone) {
    dealNewGame(state);
  } else {
    state.rematchReady = [...ready];
    state.updatedAt = Date.now();
  }

  const { error: updateError } = await supabaseAdmin.from("rooms").update({ state }).eq("code", roomCode);
  if (updateError) {
    return NextResponse.json({ error: "Couldn't set up the rematch. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, started: everyone, ready: [...ready] });
}
