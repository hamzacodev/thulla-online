"use client";

import { standings } from "./rules";
import type { TrumpPattaState } from "./types";
import { saveLocalRecord } from "../statsMath";
import type { HistoryPlayer } from "../statsMath";

/**
 * Turning a finished Trump-Patta game into a result row.
 *
 * It reuses `game_results` for the same reason Bluff does: what a completed
 * game needs recording — who played, where they came, how long it took — is
 * the same for every card game here, and a second table would mean a second
 * copy of the idempotency, the row-level security and the stats function.
 * What is genuinely Trump-Patta's own rides in `details`: the Thief, the card
 * they were left holding, and the card that was pulled out before the deal.
 *
 * `is_thulla` carries "was the Thief". The column is named after Thulla's
 * loser, but every game on this platform has exactly one, and the
 * Trump-Patta screens read it as the Thief.
 */
export interface TrumpPattaRecordPayload {
  gameId: string;
  mode: "cpu" | "friends";
  playerCount: number;
  cpuDifficulty: string | null;
  players: HistoryPlayer[];
  winnerName: string | null;
  thiefName: string | null;
  myPosition: number;
  isWin: boolean;
  isThief: boolean;
  durationMs: number;
  startedAt: string;
  details: Record<string, number | string>;
}

export function buildTrumpPattaPayload(
  state: TrumpPattaState,
  mySeat: number
): TrumpPattaRecordPayload | null {
  if (state.phase !== "finished") return null;
  const me = state.players[mySeat];
  if (!me) return null;

  const table = standings(state);
  const myPosition = table.findIndex((p) => p.seat === mySeat);
  if (myPosition < 0) return null;

  const players: HistoryPlayer[] = table.map((p, position) => ({
    playerId: null,
    name: p.name,
    type: p.kind,
    position,
    // "thulla" is the platform's shared vocabulary for last place; here it
    // means the Thief.
    result: position === 0 ? "win" : position === table.length - 1 ? "thulla" : "placed",
  }));

  const thief = state.thiefSeat !== null ? state.players[state.thiefSeat] : null;

  return {
    gameId: state.gameId,
    mode: state.config.mode,
    playerCount: state.config.playerCount,
    cpuDifficulty: state.config.mode === "cpu" ? state.config.difficulty : null,
    players,
    winnerName: table[0]?.name ?? null,
    thiefName: thief?.name ?? null,
    myPosition,
    isWin: myPosition === 0,
    isThief: myPosition === table.length - 1,
    durationMs: Math.max(0, state.updatedAt - state.startedAt),
    startedAt: new Date(state.startedAt).toISOString(),
    details: {
      // Safe to store now: the game is over, so nothing here is still secret.
      removedCard: state.removedCard,
      remainingCard: state.remainingCard ?? "",
      turns: state.turnNumber,
      picks: me.picks,
      pairsFormed: me.pairsFormed,
    },
  };
}

export interface TrumpPattaRecordOutcome {
  saved: boolean;
  storedRemotely: boolean;
  migrationMissing: boolean;
}

/**
 * Persists a finished game. Signed-in players go through the API route,
 * which re-validates and writes the row as theirs; everyone else keeps a
 * local record in Trump-Patta's own bucket, so a signed-out player still has
 * a record that never touches Thulla's or Bluff's.
 */
export async function recordTrumpPattaGame(
  payload: TrumpPattaRecordPayload,
  accessToken: string | null
): Promise<TrumpPattaRecordOutcome> {
  const local = () => {
    saveLocalRecord(
      {
        gameId: payload.gameId,
        mode: payload.mode,
        playerCount: payload.playerCount,
        cpuDifficulty: payload.cpuDifficulty as never,
        players: payload.players,
        winnerName: payload.winnerName,
        thullaName: payload.thiefName,
        myPosition: payload.myPosition,
        isWin: payload.isWin,
        isThulla: payload.isThief,
        durationMs: payload.durationMs,
        startedAt: payload.startedAt,
        game: "trump_patta",
        details: payload.details,
      },
      "trump_patta"
    );
  };

  if (!accessToken) {
    local();
    return { saved: true, storedRemotely: false, migrationMissing: false };
  }

  try {
    const res = await fetch("/api/trump-patta/record", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string; migrationMissing?: boolean };
    if (!res.ok || !body.ok) {
      // Never lose a finished game to a failed write.
      local();
      return { saved: true, storedRemotely: false, migrationMissing: !!body.migrationMissing };
    }
    return { saved: true, storedRemotely: true, migrationMissing: false };
  } catch {
    local();
    return { saved: true, storedRemotely: false, migrationMissing: false };
  }
}
