"use client";

import Link from "next/link";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { StatTile, StreakRow, WinRateBar } from "@/components/StatTiles";
import { useAuth } from "@/lib/useAuth";
import { useStats } from "@/lib/useStats";
import { formatWinRate } from "@/lib/gameHistory";
import { useMemo } from "react";

/**
 * Bluff's record, and only Bluff's.
 *
 * The headline numbers come from the shared stats machinery scoped to
 * `gameId = "bluff"`. The challenge counters underneath don't — they're
 * stored per game in `details`, and nothing generic knows how to total
 * them, so they're summed here from the same rows the history reads.
 */
interface BluffTotals {
  bluffsCalled: number;
  successfulCalls: number;
  failedCalls: number;
  successfulBluffs: number;
  timesCaught: number;
}

const ZERO: BluffTotals = {
  bluffsCalled: 0,
  successfulCalls: 0,
  failedCalls: 0,
  successfulBluffs: 0,
  timesCaught: 0,
};

export default function BluffStatsPage() {
  const { userId, loading: authLoading } = useAuth();
  const { stats, recent, loading, isLocal } = useStats(userId, 200, "bluff");
  // Derived, not synced: `recent` already comes from the database when
  // signed in and from this device's own Bluff bucket when not.
  const totals = useMemo<BluffTotals>(() => {
    const sum = { ...ZERO };
    for (const r of recent) {
      const d = r.details;
      if (!d) continue;
      // `details` is jsonb and now carries strings for other games, so read
      // the counters as numbers rather than trusting the field's type.
      const n = (key: string) => {
        const v = Number(d[key]);
        return Number.isFinite(v) ? v : 0;
      };
      sum.bluffsCalled += n("bluffsCalled");
      sum.successfulCalls += n("successfulCalls");
      sum.failedCalls += n("failedCalls");
      sum.successfulBluffs += n("successfulBluffs");
      sum.timesCaught += n("timesCaught");
    }
    return sum;
  }, [recent]);

  const busy = authLoading || loading;

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Bluff", href: "/games/bluff" },
            { label: "My Stats" },
          ]}
        />

        <h1 className="font-display text-2xl font-bold text-cream-50">
          <span aria-hidden>😈 </span>My Bluff stats
        </h1>
        <p className="mt-0.5 text-xs text-cream-400">
          Bluff only — Thulla has its own record{isLocal ? " · saved on this device" : ""}.
        </p>

        {busy ? (
          <p className="mt-10 text-center text-sm text-cream-400">Loading your record…</p>
        ) : stats.games === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="text-4xl" aria-hidden>😈</p>
            <p className="font-display mt-3 text-xl font-bold text-cream-50">No Bluff games yet!</p>
            <p className="mt-1 text-sm text-cream-400">Chalo bhai, ek jhoot bolte hain 😎</p>
            <Link href="/games/bluff/play?mode=cpu" className="btn btn-primary mt-5 w-full">
              Play your first game
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <StatTile value={stats.games} label="Games" icon="🎮" />
              <StatTile value={stats.wins} label="Wins" icon="🏆" accent="brass" />
              <StatTile value={stats.losses} label="Losses" icon="❌" />
              <StatTile value={formatWinRate(stats)} label="Win Rate" icon="📈" accent="mint" />
              <StatTile value={stats.thulla} label="Last place" icon="😅" accent="chili" />
              <StatTile value={stats.bestWinStreak} label="Best Streak" icon="🔥" accent="brass" />
            </div>

            <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <WinRateBar stats={stats} />
            </section>

            <section className="mt-4">
              <StreakRow stats={stats} />
            </section>

            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">Bluffing</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile value={totals.bluffsCalled} label="Bluffs called" icon="😈" />
                <StatTile value={totals.successfulCalls} label="Calls that landed" icon="🎯" accent="mint" />
                <StatTile value={totals.failedCalls} label="Calls that missed" icon="😭" accent="chili" />
                <StatTile value={totals.successfulBluffs} label="Lies you got away with" icon="🤫" accent="brass" />
                <StatTile value={totals.timesCaught} label="Times caught" icon="🚨" accent="chili" />
              </div>
              <p className="mt-2 text-[0.7rem] text-cream-400/70">
                Counted from your last {Math.min(stats.games, 200)} Bluff games.
              </p>
            </section>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/games/bluff/history" className="btn btn-secondary flex-1">
                🕘 Full history
              </Link>
              <Link href="/games/bluff/play?mode=cpu" className="btn btn-primary flex-1">
                🎮 Play again
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
