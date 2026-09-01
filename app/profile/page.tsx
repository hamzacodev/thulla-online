"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { HistoryCard } from "@/components/HistoryCard";
import { StatTile, StreakRow, WinRateBar, statsQuip } from "@/components/StatTiles";
import { useAuth } from "@/lib/useAuth";
import { useStats } from "@/lib/useStats";
import { formatWinRate } from "@/lib/gameHistory";
import { supabase } from "@/lib/supabaseClient";

export default function ProfilePage() {
  const router = useRouter();
  const { userId, username, displayName, email, loading: authLoading } = useAuth();
  const { stats, recent, loading, isLocal, migrationMissing, error } = useStats(userId);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const quip = statsQuip(stats);
  const busy = authLoading || loading;

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader
        title="Your Stats"
        right={
          userId ? (
            <button onClick={signOut} className="btn btn-ghost !min-h-9 !px-2.5 !text-xs">
              Sign out
            </button>
          ) : undefined
        }
      />

      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        {/* Identity */}
        <div className="panel p-4">
          <p className="font-display text-2xl font-bold text-cream-50">
            {username ?? displayName ?? (userId ? "…" : "Guest player")}
          </p>
          {email && <p className="mt-0.5 truncate text-xs text-cream-400">{email}</p>}
          {!userId && !authLoading && (
            <p className="mt-2 text-xs text-cream-400">
              Playing as a guest — your record is saved on this device only.{" "}
              <Link href="/login" className="font-semibold text-brass-300 underline underline-offset-2">
                Sign in
              </Link>{" "}
              to keep it everywhere.
            </p>
          )}
        </div>

        {migrationMissing && (
          <p className="mt-3 rounded-xl border border-brass-400/30 bg-brass-400/10 px-3 py-2 text-xs text-brass-200">
            Showing this device&apos;s record. To sync stats across devices, run{" "}
            <code className="font-mono">supabase-schema.sql</code> in your Supabase SQL editor.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-chili-500/15 px-3 py-2 text-xs text-chili-400" role="alert">
            Oops! Kuch masla ho gaya — couldn&apos;t load your stats. {error}
          </p>
        )}

        {busy ? (
          <p className="mt-8 text-center text-sm text-cream-400">Loading your record…</p>
        ) : stats.games === 0 ? (
          /* Empty state — an invitation, not a wall of zeroes. */
          <div className="panel mt-4 p-6 text-center">
            <p className="text-4xl" aria-hidden>🃏</p>
            <p className="mt-3 font-display text-xl font-bold text-cream-50">No games yet!</p>
            <p className="mt-1 text-sm text-cream-400">Chalo bhai, pehli game shuru karo 😎</p>
            <Link href="/play?mode=cpu" className="btn btn-primary mt-5 w-full">
              Play Your First Game
            </Link>
          </div>
        ) : (
          <>
            {quip && (
              <p className="mt-3 rounded-xl border border-brass-400/20 bg-brass-400/[0.08] px-3 py-2 text-center text-sm font-semibold text-brass-200">
                {quip}
              </p>
            )}

            <section className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">
                Career stats
                {isLocal && <span className="ml-1.5 font-normal text-cream-400">· this device</span>}
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile value={stats.games} label="Games" icon="🎮" />
                <StatTile value={stats.wins} label="Wins" icon="🏆" accent="brass" />
                <StatTile value={stats.losses} label="Losses" icon="❌" />
                <StatTile value={formatWinRate(stats)} label="Win Rate" icon="📈" accent="mint" />
                <StatTile value={stats.bhabhi} label="Bhabhi" icon="😂" accent="chili" />
                <StatTile value={stats.bestWinStreak} label="Best Streak" icon="🔥" accent="brass" />
              </div>
            </section>

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

            {recent.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-cream-100">Recent games</h2>
                  <Link href="/profile/history" className="text-xs font-semibold text-brass-300 underline underline-offset-2">
                    View all history →
                  </Link>
                </div>
                <div className="space-y-2">
                  {recent.map((r) => (
                    <HistoryCard key={r.id} record={r} />
                  ))}
                </div>
              </section>
            )}

            <Link href="/play?mode=cpu" className="btn btn-primary mt-7 w-full">
              🎮 Play again
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
