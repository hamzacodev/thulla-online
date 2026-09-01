"use client";

import Link from "next/link";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { StatTile, StreakRow, WinRateBar, statsQuip } from "@/components/StatTiles";
import { useAuth } from "@/lib/useAuth";
import { useStats } from "@/lib/useStats";
import { formatWinRate } from "@/lib/gameHistory";

/**
 * Thulla's own statistics.
 *
 * Every result stored so far is a Thulla result, so these are the same
 * numbers the profile shows — but they live under the game, which is where
 * they belong once there is more than one game to have a record in.
 */
export default function ThullaStatsPage() {
  const { userId, loading: authLoading } = useAuth();
  const { stats, loading, isLocal } = useStats(userId);

  const busy = authLoading || loading;
  const quip = statsQuip(stats);

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Thulla", href: "/games/thulla" },
            { label: "My Stats" },
          ]}
        />

        <h1 className="font-display text-2xl font-bold text-cream-50">
          <span aria-hidden>🃏 </span>Thulla stats
        </h1>
        <p className="mt-0.5 text-xs text-cream-400">
          Your record in Thulla{isLocal ? " · saved on this device" : ""}.
        </p>

        {busy ? (
          <p className="mt-10 text-center text-sm text-cream-400">Loading your record…</p>
        ) : stats.games === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="text-4xl" aria-hidden>🃏</p>
            <p className="font-display mt-3 text-xl font-bold text-cream-50">No games yet!</p>
            <p className="mt-1 text-sm text-cream-400">Chalo bhai, pehli game shuru karo 😎</p>
            <Link href="/games/thulla/play?mode=cpu" className="btn btn-primary mt-5 w-full">
              Play your first game
            </Link>
          </div>
        ) : (
          <>
            {quip && (
              <p className="mt-4 rounded-xl border border-brass-400/20 bg-brass-400/[0.08] px-3 py-2 text-center text-sm font-semibold text-brass-200">
                {quip}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <StatTile value={stats.games} label="Games" icon="🎮" />
              <StatTile value={stats.wins} label="Wins" icon="🏆" accent="brass" />
              <StatTile value={stats.losses} label="Losses" icon="❌" />
              <StatTile value={formatWinRate(stats)} label="Win Rate" icon="📈" accent="mint" />
              <StatTile value={stats.thulla} label="Thulla" icon="😂" accent="chili" />
              <StatTile value={stats.bestWinStreak} label="Best Streak" icon="🔥" accent="brass" />
            </div>

            <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <WinRateBar stats={stats} />
            </section>

            <section className="mt-4">
              <StreakRow stats={stats} />
            </section>

            <section className="mt-5 grid grid-cols-2 gap-2.5">
              <StatTile value={stats.cpuGames} label="vs Computer" icon="🤖" />
              <StatTile value={stats.friendGames} label="With Friends" icon="👥" />
            </section>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/games/thulla/history" className="btn btn-secondary flex-1">
                🕘 Full history
              </Link>
              <Link href="/games/thulla/play?mode=cpu" className="btn btn-primary flex-1">
                🎮 Play again
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
