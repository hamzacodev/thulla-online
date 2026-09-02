"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_STATS,
  MigrationMissingError,
  applyFilter,
  computeStats,
  fetchRemoteHistory,
  fetchRemoteStats,
  readLocalHistory,
  type GameRecord,
  type HistoryFilter,
  type PlayerStats,
} from "./gameHistory";

export interface StatsState {
  stats: PlayerStats;
  recent: GameRecord[];
  loading: boolean;
  /** True when this record lives only in this browser (signed-out play). */
  isLocal: boolean;
  /** True when the signed-in user's stats tables haven't been created yet. */
  migrationMissing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * One statistics view over two backends: Postgres for signed-in players,
 * localStorage for everyone else. Both produce the same shape, so nothing
 * downstream has to care which one it's looking at.
 */
/**
 * @param gameId which game's record to read. Defaults to Thulla so every
 * existing caller is unchanged; Bluff passes "bluff" and gets a completely
 * separate set of numbers out of the same machinery.
 */
export function useStats(userId: string | null, recentCount = 5, gameId = "thulla"): StatsState {
  const [stats, setStats] = useState<PlayerStats>(EMPTY_STATS);
  const [recent, setRecent] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the fetch in flight; the stats themselves arrive asynchronously
    setLoading(true);
    setError(null);
    setMigrationMissing(false);

    async function load() {
      if (!userId) {
        const local = readLocalHistory(gameId);
        if (!active) return;
        setStats(computeStats(local));
        setRecent(local.slice(0, recentCount));
        setLoading(false);
        return;
      }
      try {
        const [remoteStats, page] = await Promise.all([
          fetchRemoteStats(userId, gameId),
          fetchRemoteHistory({ filter: "all", sort: "newest", page: 0, pageSize: recentCount, gameId }),
        ]);
        if (!active) return;
        setStats(remoteStats);
        setRecent(page.records);
      } catch (e) {
        if (!active) return;
        if (e instanceof MigrationMissingError) {
          // Fall back to whatever this device recorded, and say so.
          const local = readLocalHistory(gameId);
          setStats(computeStats(local));
          setRecent(local.slice(0, recentCount));
          setMigrationMissing(true);
        } else {
          setError(e instanceof Error ? e.message : "Couldn't load your stats.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [userId, recentCount, gameId, nonce]);

  return { stats, recent, loading, isLocal: !userId || migrationMissing, migrationMissing, error, refresh };
}

/** Local-only paging, so signed-out history behaves like the remote one. */
export function pageLocalHistory(
  records: GameRecord[],
  filter: HistoryFilter,
  sort: "newest" | "oldest",
  page: number,
  pageSize: number
) {
  const filtered = applyFilter(records, filter).sort((a, b) =>
    sort === "newest" ? b.completedAt.localeCompare(a.completedAt) : a.completedAt.localeCompare(b.completedAt)
  );
  const from = page * pageSize;
  return { records: filtered.slice(from, from + pageSize), hasMore: filtered.length > from + pageSize };
}
