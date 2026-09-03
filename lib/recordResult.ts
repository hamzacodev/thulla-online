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
  /**
   * Which game this result belongs to. Defaulted rather than required so
   * every existing Thulla caller keeps working untouched, and so a row
   * written against a database where the column doesn't exist yet still
   * lands (Postgres fills the column default).
   */
  game?: string;
  /** Anything only one game tracks — Bluff's challenge counters. */
  /**
   * Whatever is true of one game and no other — Bluff's deck count and
   * challenge counters, Trump-Patta's Thief and the two cards that decided
   * it. Strings as well as numbers: the column is jsonb, and it was only
   * this type that insisted on numbers.
   */
  details?: Record<string, number | string> | null;
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
        game: row.game ?? "thulla",
        details: row.details ?? null,
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
    // A database that predates the game/details columns rejects them by
    // name. Thulla rows are still perfectly writable without them, so retry
    // once rather than losing somebody's result to a migration they haven't
    // run yet.
    if ((error.code === "42703" || error.code === "PGRST204") && (row.game ?? "thulla") === "thulla") {
      const retry = await supabaseAdmin
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
      if (!retry.error) {
        return { ok: true, created: (retry.data?.length ?? 0) > 0, migrationMissing: false };
      }
    }
    if (isMissingRelation(error.code)) {
      return { ok: false, created: false, migrationMissing: true, error: "stats tables not set up" };
    }
    return { ok: false, created: false, migrationMissing: false, error: error.message };
  }
  // `ignoreDuplicates` returns no rows when the record already existed.
  return { ok: true, created: (data?.length ?? 0) > 0, migrationMissing: false };
}
