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
 * Records a finished single-player Bluff game.
 *
 * Single-player runs in the browser, so the result has to come from the
 * client — there is no server-side game to consult. What the server can and
 * does enforce: the caller is authenticated, the row is written as *their*
 * row under `game = 'bluff'`, the payload is internally consistent
 * (positions form a real permutation, exactly one winner, last place really
 * is last, the challenge counters can't exceed the number of challenges
 * made), and the write is idempotent on the game id.
 *
 * Separate from Thulla's `/api/record-game` on purpose: the two games agree
 * on what a result row looks like and on nothing else, and one endpoint
 * validating both would end up trusting whichever set of rules the caller
 * claimed to be playing by.
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

  const deckCount = Number(p.deckCount);
  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 3) {
    return bad("Bluff uses 1 to 3 decks.");
  }

  const cpuDifficulty = p.cpuDifficulty === null ? null : String(p.cpuDifficulty ?? "");
  if (cpuDifficulty !== null && !DIFFICULTIES.has(cpuDifficulty)) return bad("Invalid difficulty.");

  const players = p.players;
  if (!Array.isArray(players) || players.length !== playerCount) return bad("Invalid players.");

  const positions = new Set<number>();
  let winners = 0;
  let lasts = 0;
  for (const raw of players) {
    const pl = raw as Record<string, unknown>;
    const name = typeof pl.name === "string" ? pl.name.trim() : "";
    const position = Number(pl.position);
    if (!name || name.length > 40) return bad("Invalid player name.");
    if (!Number.isInteger(position) || position < 0 || position >= playerCount) {
      return bad("Invalid finishing position.");
    }
    if (positions.has(position)) return bad("Two players can't share a position.");
    positions.add(position);
    if (!TYPES.has(String(pl.type))) return bad("Invalid player type.");
    if (!RESULTS.has(String(pl.result))) return bad("Invalid player result.");
    if (pl.result === "win") {
      winners++;
      if (position !== 0) return bad("The winner has to come first.");
    }
    if (pl.result === "thulla") {
      lasts++;
      if (position !== playerCount - 1) return bad("Last place has to come last.");
    }
  }
  if (positions.size !== playerCount) return bad("Positions don't form a full table.");
  if (winners !== 1) return bad("A finished game has exactly one winner.");
  if (lasts !== 1) return bad("A finished game has exactly one last place.");

  const myPosition = Number(p.myPosition);
  if (!Number.isInteger(myPosition) || myPosition < 0 || myPosition >= playerCount) {
    return bad("Invalid position.");
  }
  if (p.isWin !== (myPosition === 0)) return bad("Result doesn't match the position.");
  if (p.isLast !== (myPosition === playerCount - 1)) return bad("Result doesn't match the position.");

  const durationMs = Number(p.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) {
    return bad("Invalid duration.");
  }

  // The per-game counters. Bounded against each other so a client can't
  // inflate a "successful bluffs" number it was never in a position to earn.
  const d = (p.details ?? {}) as Record<string, unknown>;
  const num = (key: string) => {
    const v = Number(d[key]);
    return Number.isInteger(v) && v >= 0 && v <= 10000 ? v : null;
  };
  const bluffsCalled = num("bluffsCalled");
  const successfulCalls = num("successfulCalls");
  const failedCalls = num("failedCalls");
  const successfulBluffs = num("successfulBluffs");
  const timesCaught = num("timesCaught");
  if (
    bluffsCalled === null || successfulCalls === null || failedCalls === null ||
    successfulBluffs === null || timesCaught === null
  ) {
    return bad("Invalid game details.");
  }
  if (successfulCalls + failedCalls !== bluffsCalled) {
    return bad("Challenge counters don't add up.");
  }

  const outcome = await writeResult({
    gameId,
    ownerId: user.id,
    game: "bluff",
    mode: "cpu",
    playerCount,
    cpuDifficulty,
    players: players as HistoryPlayerInput[],
    winnerName: typeof p.winnerName === "string" ? p.winnerName.slice(0, 40) : null,
    thullaName: typeof p.lastName === "string" ? p.lastName.slice(0, 40) : null,
    winnerId: null,
    thullaId: null,
    myPosition,
    isWin: myPosition === 0,
    isThulla: myPosition === playerCount - 1,
    durationMs: Math.round(durationMs),
    startedAt: typeof p.startedAt === "string" ? p.startedAt : null,
    details: {
      deckCount,
      totalCards: deckCount * 52,
      bluffsCalled,
      successfulCalls,
      failedCalls,
      successfulBluffs,
      timesCaught,
    },
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error ?? "Couldn't save that game.", migrationMissing: outcome.migrationMissing },
      { status: outcome.migrationMissing ? 200 : 500 }
    );
  }
  return NextResponse.json({ ok: true, created: outcome.created });
}
