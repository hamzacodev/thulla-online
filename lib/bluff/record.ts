"use client";

import { bluffStandings } from "./rules";
import { cardsForDecks } from "./cards";
import type { BluffState } from "./types";
import { saveLocalRecord } from "../statsMath";
import type { HistoryPlayer } from "../statsMath";

/**
 * Turning a finished Bluff game into a result row.
 *
 * It reuses `game_results` rather than getting a table of its own: the
 * shape a completed game needs — who played, where they came, how long it
 * took — is the same for every card game, and a second table would mean a
 * second copy of the idempotency, the row-level security and the stats
 * function. What is genuinely Bluff's own (deck count, and the challenge
 * counters) rides in `details`.
 *
 * `is_thulla` carries "finished last" here. The column is named after
 * Thulla's loser, but every game on this platform has one, and the Bluff
 * screens read it as last place.
 */
export interface BluffRecordPayload {
  gameId: string;
  mode: "cpu" | "friends";
  playerCount: number;
  deckCount: number;
  cpuDifficulty: string | null;
  players: HistoryPlayer[];
  winnerName: string | null;
  lastName: string | null;
  myPosition: number;
  isWin: boolean;
  isLast: boolean;
  durationMs: number;
  startedAt: string;
  details: Record<string, number>;
}

export function buildBluffPayload(state: BluffState, mySeat: number): BluffRecordPayload | null {
  if (state.phase !== "finished") return null;
  const me = state.players[mySeat];
  if (!me) return null;

  const table = bluffStandings(state);
  const myPosition = table.findIndex((p) => p.seat === mySeat);
  if (myPosition < 0) return null;

  const players: HistoryPlayer[] = table.map((p, position) => ({
    playerId: null,
    name: p.name,
    type: p.kind,
    position,
    // "thulla" is the shared vocabulary for last place across the platform.
    result: position === 0 ? "win" : position === table.length - 1 ? "thulla" : "placed",
  }));

  return {
    gameId: state.gameId,
    mode: state.config.mode,
    playerCount: state.config.playerCount,
    deckCount: state.config.deckCount,
    cpuDifficulty: state.config.mode === "cpu" ? state.config.difficulty : null,
    players,
    winnerName: table[0]?.name ?? null,
    lastName: table[table.length - 1]?.name ?? null,
    myPosition,
    isWin: myPosition === 0,
    isLast: myPosition === table.length - 1,
    durationMs: Math.max(0, state.updatedAt - state.startedAt),
    startedAt: new Date(state.startedAt).toISOString(),
    details: {
      deckCount: state.config.deckCount,
      totalCards: cardsForDecks(state.config.deckCount),
      bluffsCalled: me.stats.bluffsCalled,
      successfulCalls: me.stats.successfulCalls,
      failedCalls: me.stats.failedCalls,
      successfulBluffs: me.stats.successfulBluffs,
      timesCaught: me.stats.timesCaught,
    },
  };
}

export interface BluffRecordOutcome {
  saved: boolean;
  storedRemotely: boolean;
  migrationMissing: boolean;
}

/**
 * Persists a finished Bluff game. Signed-in players go through the API
 * route, which re-validates and writes the row as theirs; everyone else
 * keeps a local record, in Bluff's own bucket, so a signed-out player still
 * has a Bluff record that never touches Thulla's.
 */
export async function recordBluffGame(
  payload: BluffRecordPayload,
  accessToken: string | null
): Promise<BluffRecordOutcome> {
  const local = () => {
    saveLocalRecord(
      {
        gameId: payload.gameId,
        mode: payload.mode,
        playerCount: payload.playerCount,
        cpuDifficulty: payload.cpuDifficulty as never,
        players: payload.players,
        winnerName: payload.winnerName,
        thullaName: payload.lastName,
        myPosition: payload.myPosition,
        isWin: payload.isWin,
        isThulla: payload.isLast,
        durationMs: payload.durationMs,
        startedAt: payload.startedAt,
        game: "bluff",
        details: payload.details,
      },
      "bluff"
    );
  };

  if (!accessToken) {
    local();
    return { saved: true, storedRemotely: false, migrationMissing: false };
  }

  try {
    const res = await fetch("/api/bluff/record", {
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
