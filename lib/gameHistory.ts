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
export { EMPTY_STATS, winRate, formatWinRate, computeStats, applyFilter } from "./statsMath";

import type { GameRecord, HistoryFilter, HistorySort, HistoryPlayer, GameMode, PlayerStats } from "./statsMath";
import { EMPTY_STATS } from "./statsMath";

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
    result: position === 0 ? "win" : p.seat === state.bhabhiSeat ? "bhabhi" : "placed",
  }));

  const myPosition = table.findIndex((p) => p.seat === mySeat);
  if (myPosition < 0) return null;

  const winner = table[0];
  const bhabhi = state.bhabhiSeat !== null ? state.players[state.bhabhiSeat] : null;

  return {
    gameId: state.gameId,
    mode: state.config.mode,
    playerCount: state.players.length,
    cpuDifficulty: state.config.mode === "cpu" ? state.config.difficulty : null,
    players,
    winnerName: winner?.name ?? null,
    bhabhiName: bhabhi?.name ?? null,
    myPosition,
    isWin: myPosition === 0,
    isBhabhi: state.bhabhiSeat === mySeat,
    durationMs: Math.max(0, state.updatedAt - state.startedAt),
    startedAt: new Date(state.startedAt).toISOString(),
  };
}

export type RecordPayload = NonNullable<ReturnType<typeof buildRecordPayload>>;

/* ============================================================
   Local store — signed-out players. Capped so a long-running browser
   can't fill its storage quota with history.
   ============================================================ */

const LOCAL_KEY = "bhabhi.history.v1";
const LOCAL_CAP = 300;

export function readLocalHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GameRecord[]) : [];
  } catch {
    return [];
  }
}

/** Idempotent on `gameId`, so a re-render or refresh can't double-count. */
export function saveLocalRecord(payload: RecordPayload): GameRecord[] {
  const existing = readLocalHistory();
  if (existing.some((r) => r.gameId === payload.gameId)) return existing;

  const record: GameRecord = {
    ...payload,
    id: payload.gameId,
    completedAt: new Date().toISOString(),
  };
  const next = [record, ...existing].slice(0, LOCAL_CAP);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    /* quota — the game still finished, we just can't keep the record */
  }
  return next;
}

/* ============================================================
   Remote store — signed-in players.
   Reads go straight to Postgres under RLS (a user can only ever see their
   own rows). Writes go through the API route, never directly, so the
   browser can't insert a fabricated win.
   ============================================================ */

interface RemoteRow {
  id: string;
  game_id: string;
  mode: GameMode;
  player_count: number;
  cpu_difficulty: Difficulty | null;
  players: HistoryPlayer[];
  winner_name: string | null;
  bhabhi_name: string | null;
  my_position: number;
  is_win: boolean;
  is_bhabhi: boolean;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string;
}

function fromRow(r: RemoteRow): GameRecord {
  return {
    id: r.id,
    gameId: r.game_id,
    mode: r.mode,
    playerCount: r.player_count,
    cpuDifficulty: r.cpu_difficulty,
    players: Array.isArray(r.players) ? r.players : [],
    winnerName: r.winner_name,
    bhabhiName: r.bhabhi_name,
    myPosition: r.my_position,
    isWin: r.is_win,
    isBhabhi: r.is_bhabhi,
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

export async function fetchRemoteStats(userId: string): Promise<PlayerStats> {
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

export async function fetchRemoteHistory(opts: {
  filter: HistoryFilter;
  sort: HistorySort;
  page: number;
  pageSize: number;
}): Promise<HistoryPage> {
  const { filter, sort, page, pageSize } = opts;
  // Fetch one extra row to learn whether another page exists, without a
  // second count query.
  const from = page * pageSize;
  let q = supabase
    .from("game_results")
    .select("*")
    .order("completed_at", { ascending: sort === "oldest" })
    .order("id", { ascending: sort === "oldest" })
    .range(from, from + pageSize);

  if (filter === "wins") q = q.eq("is_win", true);
  else if (filter === "losses") q = q.eq("is_win", false);
  else if (filter === "bhabhi") q = q.eq("is_bhabhi", true);
  else if (filter === "cpu") q = q.eq("mode", "cpu");
  else if (filter === "friends") q = q.eq("mode", "friends");

  const { data, error } = await q;
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
