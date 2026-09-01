import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authHelpers";
import { writeResult, type HistoryPlayerInput } from "@/lib/recordResult";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const TYPES = new Set(["human", "cpu", "remote"]);
const RESULTS = new Set(["win", "thulla", "placed"]);
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/**
 * Records a finished single-player game.
 *
 * Single-player runs entirely in the browser, so the result has to come from
 * the client — there is no server-side game to consult. What the server can
 * and does enforce: the caller is authenticated, the row is written as
 * *their* row, the payload is internally consistent (positions form a real
 * permutation, exactly one winner, the Thulla finished last), and the write
 * is idempotent on gameId. Online games never come through here — those are
 * recorded from the authoritative room state in `resolve-trick`.
 */
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Malformed request.");
  }

  const p = body as Record<string, unknown>;

  const gameId = typeof p.gameId === "string" ? p.gameId.trim() : "";
  if (gameId.length < 6 || gameId.length > 100) return bad("Invalid game id.");

  if (p.mode !== "cpu") return bad("Only single-player games are recorded here.");

  const playerCount = Number(p.playerCount);
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
    return bad("Invalid player count.");
  }

  const difficulty = p.cpuDifficulty === null ? null : String(p.cpuDifficulty);
  if (difficulty !== null && !DIFFICULTIES.has(difficulty)) return bad("Invalid difficulty.");

  if (!Array.isArray(p.players) || p.players.length !== playerCount) {
    return bad("Player list doesn't match the player count.");
  }

  const players: HistoryPlayerInput[] = [];
  const seenPositions = new Set<number>();
  let humanCount = 0;
  let winners = 0;
  let thullas = 0;

  for (const raw of p.players as unknown[]) {
    const q = raw as Record<string, unknown>;
    const name = typeof q.name === "string" ? q.name.trim().slice(0, 40) : "";
    const type = String(q.type);
    const position = Number(q.position);
    const result = String(q.result);

    if (!name) return bad("Every player needs a name.");
    if (!TYPES.has(type)) return bad("Invalid player type.");
    if (!RESULTS.has(result)) return bad("Invalid player result.");
    if (!Number.isInteger(position) || position < 0 || position >= playerCount) {
      return bad("Invalid finishing position.");
    }
    if (seenPositions.has(position)) return bad("Two players share a finishing position.");
    seenPositions.add(position);

    if (type === "human") humanCount += 1;
    if (result === "win") winners += 1;
    if (result === "thulla") thullas += 1;

    // A winner is first, a Thulla is last — anything else is a broken table.
    if (result === "win" && position !== 0) return bad("The winner must finish first.");
    if (result === "thulla" && position !== playerCount - 1) return bad("The Thulla must finish last.");

    players.push({ playerId: null, name, type: type as HistoryPlayerInput["type"], position, result: result as HistoryPlayerInput["result"] });
  }

  if (seenPositions.size !== playerCount) return bad("Finishing positions are incomplete.");
  if (winners !== 1) return bad("A finished game has exactly one winner.");
  if (thullas > 1) return bad("A finished game has at most one Thulla.");
  if (humanCount !== 1) return bad("A single-player game has exactly one human.");

  const myPosition = Number(p.myPosition);
  if (!Number.isInteger(myPosition) || myPosition < 0 || myPosition >= playerCount) {
    return bad("Invalid finishing position.");
  }

  const me = players.find((x) => x.position === myPosition);
  if (!me || me.type !== "human") return bad("Your finishing position doesn't match the human player.");

  // Derive the flags rather than trusting them.
  const isWin = myPosition === 0;
  const isThulla = me.result === "thulla";
  if (p.isWin !== isWin || p.isThulla !== isThulla) return bad("Result flags don't match the finishing table.");

  me.playerId = user.id;

  let durationMs: number | null = null;
  if (p.durationMs !== undefined && p.durationMs !== null) {
    const d = Number(p.durationMs);
    if (!Number.isFinite(d) || d < 0 || d > MAX_DURATION_MS) return bad("Invalid game duration.");
    durationMs = Math.round(d);
  }

  let startedAt: string | null = null;
  if (typeof p.startedAt === "string") {
    const ts = Date.parse(p.startedAt);
    // Reject clock nonsense: nothing from the future, nothing ancient.
    if (Number.isFinite(ts) && ts <= Date.now() + 60_000 && ts > Date.now() - 30 * 24 * 3600_000) {
      startedAt = new Date(ts).toISOString();
    }
  }

  const winner = players.find((x) => x.position === 0) ?? null;
  const thulla = players.find((x) => x.result === "thulla") ?? null;

  const outcome = await writeResult({
    gameId,
    ownerId: user.id,
    mode: "cpu",
    playerCount,
    cpuDifficulty: difficulty,
    players,
    winnerName: winner?.name ?? null,
    thullaName: thulla?.name ?? null,
    winnerId: winner?.playerId ?? null,
    thullaId: thulla?.playerId ?? null,
    myPosition,
    isWin,
    isThulla,
    durationMs,
    startedAt,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error, migrationMissing: outcome.migrationMissing },
      { status: outcome.migrationMissing ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, created: outcome.created });
}
