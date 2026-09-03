"use client";

import { supabase } from "./supabaseClient";
import { standings } from "./engine/rules";
import type { Difficulty, GameState } from "./engine/types";

export type {
  GameMode,
  PlayerResult,
  HistoryFilter,
  HistorySort,
  HistoryPlayer,
  GameRecord,
  PlayerStats,
} from "./statsMath";
export {
  EMPTY_STATS,
  winRate,
  formatWinRate,
  computeStats,
  applyFilter,
  readLocalHistory,
  saveLocalRecord,
} from "./statsMath";

import type { GameRecord, HistoryFilter, HistorySort, HistoryPlayer, GameMode, PlayerStats } from "./statsMath";
import { EMPTY_STATS, saveLocalRecord } from "./statsMath";

/* ============================================================
   Building a record from a finished game
   ============================================================ */

/**
 * Turns a finished engine state into the payload we persist. Only ever
 * called on a game the engine has marked `finished`, which is what keeps
 * abandoned games out of the record entirely.
 */
export function buildRecordPayload(state: GameState, mySeat: number) {
  if (state.phase !== "finished") return null;

  const table = standings(state);
  const players: HistoryPlayer[] = table.map((p, position) => ({
    playerId: p.kind === "cpu" ? null : p.id,
    name: p.name,
    type: p.kind,
    position,
    result: position === 0 ? "win" : p.seat === state.thullaSeat ? "thulla" : "placed",
  }));

  const myPosition = table.findIndex((p) => p.seat === mySeat);
  if (myPosition < 0) return null;

  const winner = table[0];
  const thulla = state.thullaSeat !== null ? state.players[state.thullaSeat] : null;

  return {
    gameId: state.gameId,
    mode: state.config.mode,
    playerCount: state.players.length,
    cpuDifficulty: state.config.mode === "cpu" ? state.config.difficulty : null,
    players,
    winnerName: winner?.name ?? null,
    thullaName: thulla?.name ?? null,
    myPosition,
    isWin: myPosition === 0,
    isThulla: state.thullaSeat === mySeat,
    durationMs: Math.max(0, state.updatedAt - state.startedAt),
    startedAt: new Date(state.startedAt).toISOString(),
  };
}

export type RecordPayload = NonNullable<ReturnType<typeof buildRecordPayload>>;

/* ============================================================
   Remote store — signed-in players.
   Reads go straight to Postgres under RLS (a user can only ever see their
   own rows). Writes go through the API route, never directly, so the
   browser can't insert a fabricated win.
   ============================================================ */

interface RemoteRow {
  id: string;
  game_id: string;
  game?: string | null;
  /**
   * Whatever is true of one game and no other — Bluff's deck count and
   * challenge counters, Trump-Patta's Thief and the two cards that decided
   * it. Strings as well as numbers: the column is jsonb, and it was only
   * this type that insisted on numbers.
   */
  details?: Record<string, number | string> | null;
  mode: GameMode;
  player_count: number;
  cpu_difficulty: Difficulty | null;
  players: HistoryPlayer[];
  winner_name: string | null;
  thulla_name: string | null;
  my_position: number;
  is_win: boolean;
  is_thulla: boolean;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string;
}

function fromRow(r: RemoteRow): GameRecord {
  return {
    id: r.id,
    gameId: r.game_id,
    game: r.game ?? "thulla",
    details: r.details ?? null,
    mode: r.mode,
    playerCount: r.player_count,
    cpuDifficulty: r.cpu_difficulty,
    players: Array.isArray(r.players) ? r.players : [],
    winnerName: r.winner_name,
    thullaName: r.thulla_name,
    myPosition: r.my_position,
    isWin: r.is_win,
    isThulla: r.is_thulla,
    durationMs: r.duration_ms,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

/** Distinguishes "no games yet" from "the migration hasn't been run". */
export class MigrationMissingError extends Error {
  constructor() {
    super("game_results table not found");
    this.name = "MigrationMissingError";
  }
}

function isMissingRelation(code?: string) {
  // 42P01 undefined_table, 42883 undefined_function, PGRST202 no such RPC.
  return code === "42P01" || code === "42883" || code === "PGRST202";
}

/**
 * A player's record in one game.
 *
 * `get_game_stats` is the game-aware function. Thulla falls back to the
 * original `get_player_stats` when it isn't there yet, so an un-migrated
 * database keeps working exactly as before; any other game reports the
 * migration as missing and the caller drops to the local record.
 */
export async function fetchRemoteStats(userId: string, gameId = "thulla"): Promise<PlayerStats> {
  const scoped = await supabase.rpc("get_game_stats", { p_user: userId, p_game: gameId });
  if (!scoped.error) return { ...EMPTY_STATS, ...(scoped.data as Partial<PlayerStats>) };

  if (!isMissingRelation(scoped.error.code)) throw new Error(scoped.error.message);
  if (gameId !== "thulla") throw new MigrationMissingError();

  const { data, error } = await supabase.rpc("get_player_stats", { p_user: userId });
  if (error) {
    if (isMissingRelation(error.code)) throw new MigrationMissingError();
    throw new Error(error.message);
  }
  return { ...EMPTY_STATS, ...(data as Partial<PlayerStats>) };
}

export interface HistoryPage {
  records: GameRecord[];
  hasMore: boolean;
}

/** Postgres "column does not exist" — the `game` column isn't there yet. */
function isMissingColumn(code?: string) {
  return code === "42703" || code === "PGRST204";
}

export async function fetchRemoteHistory(opts: {
  filter: HistoryFilter;
  sort: HistorySort;
  page: number;
  pageSize: number;
  gameId?: string;
}): Promise<HistoryPage> {
  const { filter, sort, page, pageSize, gameId = "thulla" } = opts;
  // Fetch one extra row to learn whether another page exists, without a
  // second count query.
  const from = page * pageSize;
  const build = (scoped: boolean) => {
    let q = supabase
      .from("game_results")
      .select("*")
      .order("completed_at", { ascending: sort === "oldest" })
      .order("id", { ascending: sort === "oldest" })
      .range(from, from + pageSize);
    if (scoped) q = q.eq("game", gameId);
    return q;
  };

  let q = build(true);
  if (filter === "wins") q = q.eq("is_win", true);
  else if (filter === "losses") q = q.eq("is_win", false);
  else if (filter === "thulla") q = q.eq("is_thulla", true);
  else if (filter === "cpu") q = q.eq("mode", "cpu");
  else if (filter === "friends") q = q.eq("mode", "friends");

  let { data, error } = await q;

  if (error && isMissingColumn(error.code)) {
    // Pre-migration. Every row that exists is a Thulla row, so Thulla can
    // safely read them unfiltered; anything else genuinely has no history.
    if (gameId !== "thulla") return { records: [], hasMore: false };
    let retry = build(false);
    if (filter === "wins") retry = retry.eq("is_win", true);
    else if (filter === "losses") retry = retry.eq("is_win", false);
    else if (filter === "thulla") retry = retry.eq("is_thulla", true);
    else if (filter === "cpu") retry = retry.eq("mode", "cpu");
    else if (filter === "friends") retry = retry.eq("mode", "friends");
    ({ data, error } = await retry);
  }

  if (error) {
    if (isMissingRelation(error.code)) throw new MigrationMissingError();
    throw new Error(error.message);
  }
  const rows = (data ?? []) as RemoteRow[];
  return { records: rows.slice(0, pageSize).map(fromRow), hasMore: rows.length > pageSize };
}

export async function fetchRemoteGame(id: string): Promise<GameRecord | null> {
  const { data, error } = await supabase.from("game_results").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelation(error.code)) throw new MigrationMissingError();
    throw new Error(error.message);
  }
  return data ? fromRow(data as RemoteRow) : null;
}

/* ============================================================
   Recording
   ============================================================ */

export interface RecordOutcome {
  saved: boolean;
  /** True when this call created the row; false when it already existed. */
  created: boolean;
  storedRemotely: boolean;
  migrationMissing: boolean;
}

/**
 * Persists one finished game. Signed-in players go through the API route
 * (server-validated, idempotent on gameId); everyone else gets a local
 * record so the dashboard still means something before they sign up.
 */
export async function recordFinishedGame(
  payload: RecordPayload,
  accessToken: string | null
): Promise<RecordOutcome> {
  if (!accessToken) {
    saveLocalRecord(payload);
    return { saved: true, created: true, storedRemotely: false, migrationMissing: false };
  }

  try {
    const res = await fetch("/api/record-game", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { ok?: boolean; created?: boolean; error?: string; migrationMissing?: boolean };
    if (!res.ok || !body.ok) {
      // Never lose the result: fall back to the local record.
      saveLocalRecord(payload);
      return {
        saved: true,
        created: true,
        storedRemotely: false,
        migrationMissing: !!body.migrationMissing,
      };
    }
    return { saved: true, created: !!body.created, storedRemotely: true, migrationMissing: false };
  } catch {
    saveLocalRecord(payload);
    return { saved: true, created: true, storedRemotely: false, migrationMissing: false };
  }
}
