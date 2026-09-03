import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authHelpers";
import { writeResult, type HistoryPlayerInput } from "@/lib/recordResult";
import { RANKS, SUITS } from "@/lib/engine/cards";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const TYPES = new Set(["human", "cpu", "remote"]);
const RESULTS = new Set(["win", "thulla", "placed"]);
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const CARDS = new Set(SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`)));

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/**
 * Records a finished single-player Trump-Patta game.
 *
 * Single-player runs in the browser, so the result has to come from the
 * client — there is no server-side game to consult. What the server can and
 * does enforce: the caller is authenticated, the row is written as *their*
 * row under `game = 'trump_patta'`, the payload is internally consistent
 * (positions form a real permutation, exactly one winner, the Thief really is
 * last), the two cards are real cards of the same rank — which is the one
 * thing that must be true of every finished game of this — and the write is
 * idempotent on the game id.
 *
 * Separate from Thulla's and Bluff's endpoints on purpose: the three games
 * agree on what a result row looks like and on nothing else, and one endpoint
 * validating all of them would end up trusting whichever set of rules the
 * caller claimed to be playing by.
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

  const cpuDifficulty = p.cpuDifficulty === null ? null : String(p.cpuDifficulty ?? "");
  if (cpuDifficulty !== null && !DIFFICULTIES.has(cpuDifficulty)) return bad("Invalid difficulty.");

  const players = p.players;
  if (!Array.isArray(players) || players.length !== playerCount) return bad("Invalid players.");

  const positions = new Set<number>();
  let winners = 0;
  let thieves = 0;
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
      thieves++;
      if (position !== playerCount - 1) return bad("The Thief has to come last.");
    }
  }
  if (positions.size !== playerCount) return bad("Positions don't form a full table.");
  if (winners !== 1) return bad("A finished game has exactly one winner.");
  if (thieves !== 1) return bad("A finished game has exactly one Thief.");

  const myPosition = Number(p.myPosition);
  if (!Number.isInteger(myPosition) || myPosition < 0 || myPosition >= playerCount) {
    return bad("Invalid position.");
  }
  if (p.isWin !== (myPosition === 0)) return bad("Result doesn't match the position.");
  if (p.isThief !== (myPosition === playerCount - 1)) return bad("Result doesn't match the position.");

  const durationMs = Number(p.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) {
    return bad("Invalid duration.");
  }

  // The two cards that decide the game. They must be real cards, and they
  // must share a rank — a game where the last card doesn't match the one
  // pulled out before the deal did not happen.
  const d = (p.details ?? {}) as Record<string, unknown>;
  const removedCard = String(d.removedCard ?? "");
  const remainingCard = String(d.remainingCard ?? "");
  if (!CARDS.has(removedCard)) return bad("Invalid hidden card.");
  if (!CARDS.has(remainingCard)) return bad("Invalid remaining card.");
  if (removedCard === remainingCard) return bad("The hidden card can't also be the last one.");
  if (removedCard.slice(0, -1) !== remainingCard.slice(0, -1)) {
    return bad("The last card has to match the rank of the hidden one.");
  }

  const num = (key: string, max: number) => {
    const v = Number(d[key]);
    return Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  };
  const turns = num("turns", 5000);
  const picks = num("picks", 5000);
  const pairsFormed = num("pairsFormed", 26);
  if (turns === null || picks === null || pairsFormed === null) return bad("Invalid game details.");

  const outcome = await writeResult({
    gameId,
    ownerId: user.id,
    game: "trump_patta",
    mode: "cpu",
    playerCount,
    cpuDifficulty,
    players: players as HistoryPlayerInput[],
    winnerName: typeof p.winnerName === "string" ? p.winnerName.slice(0, 40) : null,
    thullaName: typeof p.thiefName === "string" ? p.thiefName.slice(0, 40) : null,
    winnerId: null,
    thullaId: null,
    myPosition,
    isWin: myPosition === 0,
    isThulla: myPosition === playerCount - 1,
    durationMs: Math.round(durationMs),
    startedAt: typeof p.startedAt === "string" ? p.startedAt : null,
    details: { removedCard, remainingCard, turns, picks, pairsFormed },
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: outcome.error ?? "Couldn't save that game.",
        migrationMissing: outcome.migrationMissing,
      },
      { status: outcome.migrationMissing ? 200 : 500 }
    );
  }
  return NextResponse.json({ ok: true, created: outcome.created });
}
