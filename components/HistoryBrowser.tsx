"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HistoryCard } from "@/components/HistoryCard";
import { useAuth } from "@/lib/useAuth";
import { pageLocalHistory } from "@/lib/useStats";
import {
  MigrationMissingError,
  fetchRemoteHistory,
  readLocalHistory,
  type GameRecord,
  type HistoryFilter,
  type HistorySort,
} from "@/lib/gameHistory";
import { gameSlug, getGame } from "@/lib/games";

/**
 * The paged, filterable list of finished games.
 *
 * Shared between the account-level history at `/profile/history` and
 * Thulla's own at `/games/thulla/history`. Every stored result is a Thulla
 * result today, so the two show the same rows — the split matters for the
 * day a second game starts writing results, at which point this takes a
 * game filter and the two pages stop being identical.
 */
const PAGE_SIZE = 20;

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
  { id: "thulla", label: "Last place" },
  { id: "cpu", label: "vs CPU" },
  { id: "friends", label: "Friends" },
];

export function HistoryBrowser({ gameId = "thulla" }: { gameId?: string }) {
  // A game's stored id isn't always its URL segment — Trump-Patta is
  // `trump_patta` in the database and `trump-patta` in a link.
  const playSlug = gameSlug(getGame(gameId) ?? { id: gameId } as never);
  const { userId, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [sort, setSort] = useState<HistorySort>("newest");
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Pages are fetched, never accumulated client-side — a player with 10,000
   * games pulls 20 rows, not 10,000.
   */
  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        let result;
        if (userId) {
          try {
            result = await fetchRemoteHistory({ filter, sort, page: targetPage, pageSize: PAGE_SIZE, gameId });
          } catch (e) {
            if (!(e instanceof MigrationMissingError)) throw e;
            result = pageLocalHistory(readLocalHistory(gameId), filter, sort, targetPage, PAGE_SIZE);
          }
        } else {
          result = pageLocalHistory(readLocalHistory(gameId), filter, sort, targetPage, PAGE_SIZE);
        }
        setRecords((prev) => (append ? [...prev, ...result.records] : result.records));
        setHasMore(result.hasMore);
        setPage(targetPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your history.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, filter, sort, gameId]
  );

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the fetch in flight; the data itself arrives asynchronously
    void load(0, false);
  }, [authLoading, load]);

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-3">
        {/* Filters — a horizontal scroller so six chips never wrap awkwardly
            or shrink below a tappable size on a narrow phone. */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`btn !min-h-9 shrink-0 !px-3.5 !text-xs ${
                filter === f.id ? "btn-primary" : "btn-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-cream-400">
            {loading ? "Loading…" : `${records.length}${hasMore ? "+" : ""} game${records.length === 1 ? "" : "s"}`}
          </p>
          <button
            onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
            className="btn btn-ghost !min-h-9 !px-2.5 !text-xs"
          >
            {sort === "newest" ? "↓ Newest first" : "↑ Oldest first"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-chili-500/15 px-3 py-2 text-xs text-chili-400" role="alert">
            Oops! Kuch masla ho gaya — {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-center text-sm text-cream-400">Loading…</p>
        ) : records.length === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="text-3xl" aria-hidden>🃏</p>
            <p className="mt-2 font-semibold text-cream-50">
              {filter === "all" ? "No games yet!" : "Nothing matches that filter."}
            </p>
            {filter === "all" && (
              <>
                <p className="mt-1 text-sm text-cream-400">Chalo bhai, pehli game shuru karo 😎</p>
                <Link href={`/games/${playSlug}/play?mode=cpu`} className="btn btn-primary mt-4 w-full">
                  Play Your First Game
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {records.map((r) => (
                <HistoryCard key={r.id} record={r} />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => load(page + 1, true)}
                disabled={loadingMore}
                className="btn btn-secondary mt-4 w-full"
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            )}
          </>
        )}
    </div>
  );
}
