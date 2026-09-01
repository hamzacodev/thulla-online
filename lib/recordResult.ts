import { supabaseAdmin } from "./supabaseAdmin";

/** Postgres/PostgREST codes meaning "the migration hasn't been run". */
export function isMissingRelation(code?: string) {
  return code === "42P01" || code === "42883" || code === "PGRST202";
}

export interface HistoryPlayerInput {
  playerId: string | null;
  name: string;
  type: "human" | "cpu" | "remote";
  position: number;
  result: "win" | "thulla" | "placed";
}

export interface ResultRow {
  gameId: string;
  ownerId: string;
  mode: "cpu" | "friends";
  playerCount: number;
  cpuDifficulty: string | null;
  players: HistoryPlayerInput[];
  winnerName: string | null;
  thullaName: string | null;
  winnerId: string | null;
  thullaId: string | null;
  myPosition: number;
  isWin: boolean;
  isThulla: boolean;
  durationMs: number | null;
  startedAt: string | null;
}

export interface WriteOutcome {
  ok: boolean;
  created: boolean;
  migrationMissing: boolean;
  error?: string;
}

/**
 * Writes one result row. Idempotent: the (owner_id, game_id) unique
 * constraint means a retry, a double render, or a refresh after the game
 * ends can never produce a second row. A conflict is a success with
 * `created: false`, not an error.
 */
export async function writeResult(row: ResultRow): Promise<WriteOutcome> {
  const { data, error } = await supabaseAdmin
    .from("game_results")
    .upsert(
      {
        game_id: row.gameId,
        owner_id: row.ownerId,
        mode: row.mode,
        player_count: row.playerCount,
        cpu_difficulty: row.cpuDifficulty,
        players: row.players,
        winner_name: row.winnerName,
        thulla_name: row.thullaName,
        winner_id: row.winnerId,
        thulla_id: row.thullaId,
        my_position: row.myPosition,
        is_win: row.isWin,
        is_thulla: row.isThulla,
        duration_ms: row.durationMs,
        started_at: row.startedAt,
      },
      { onConflict: "owner_id,game_id", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    if (isMissingRelation(error.code)) {
      return { ok: false, created: false, migrationMissing: true, error: "stats tables not set up" };
    }
    return { ok: false, created: false, migrationMissing: false, error: error.message };
  }
  // `ignoreDuplicates` returns no rows when the record already existed.
  return { ok: true, created: (data?.length ?? 0) > 0, migrationMissing: false };
}
