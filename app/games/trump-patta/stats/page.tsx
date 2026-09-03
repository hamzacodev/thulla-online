"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { StatTile, StreakRow, WinRateBar } from "@/components/StatTiles";
import { useAuth } from "@/lib/useAuth";
import { useStats } from "@/lib/useStats";
import { formatWinRate } from "@/lib/gameHistory";

/**
 * Trump-Patta's record, and only Trump-Patta's.
 *
 * The headline numbers come from the shared stats machinery scoped to
 * `game = "trump_patta"`. The rest are summed here from `details`, which is
 * where each game keeps whatever only it tracks — nothing generic knows what
 * a "pair" or a "pick" is.
 *
 * Note which way round the framing goes. In Thulla and Bluff the interesting
 * number is wins; here it is how often you *avoided* being the Thief, which
 * is what people actually count after a session of this.
 */
interface Totals {
  pairs: number;
  picks: number;
  turns: number;
}

export default function TrumpPattaStatsPage() {
  const { userId, loading: authLoading } = useAuth();
  const { stats, recent, loading, isLocal } = useStats(userId, 200, "trump_patta");

  const totals = useMemo<Totals>(() => {
    const sum: Totals = { pairs: 0, picks: 0, turns: 0 };
    for (const r of recent) {
      const d = r.details;
      if (!d) continue;
      const n = (key: string) => {
        const v = Number(d[key]);
        return Number.isFinite(v) ? v : 0;
      };
      sum.pairs += n("pairsFormed");
      sum.picks += n("picks");
      sum.turns += n("turns");
    }
    return sum;
  }, [recent]);

  const busy = authLoading || loading;
  const safe = stats.games - stats.thulla;
  const thiefRate = stats.games ? Math.round((stats.thulla / stats.games) * 100) : 0;

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Trump-Patta", href: "/games/trump-patta" },
            { label: "My Stats" },
          ]}
        />

        <h1 className="font-display text-2xl font-bold text-cream-50">
          <span aria-hidden>🥷 </span>My Trump-Patta stats
        </h1>
        <p className="mt-0.5 text-xs text-cream-400">
          Trump-Patta only — Thulla and Bluff keep their own
          {isLocal ? " · saved on this device" : ""}.
        </p>

        {busy ? (
          <p className="mt-10 text-center text-sm text-cream-400">Loading your record…</p>
        ) : stats.games === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="text-4xl" aria-hidden>🥷</p>
            <p className="font-display mt-3 text-xl font-bold text-cream-50">
              No Trump-Patta games yet!
            </p>
            <p className="mt-1 text-sm text-cream-400">Dekhte hain Thulla kis ko banta hai 😏</p>
            <Link href="/games/trump-patta/play?mode=cpu" className="btn btn-primary mt-5 w-full">
              Play your first game
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <StatTile value={stats.games} label="Games" icon="🎮" />
              <StatTile value={safe} label="Got away" icon="😌" accent="mint" />
              <StatTile value={stats.thulla} label="Was the Thief" icon="🥷" accent="chili" />
              <StatTile value={`${thiefRate}%`} label="Thief Rate" icon="📉" accent="chili" />
              <StatTile value={stats.wins} label="Out first" icon="🥇" accent="brass" />
              <StatTile value={formatWinRate(stats)} label="Win Rate" icon="📈" accent="mint" />
            </div>

            <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <WinRateBar stats={stats} />
            </section>

            <section className="mt-4">
              <StreakRow stats={stats} />
            </section>

            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">At the table</h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile value={totals.pairs} label="Pairs thrown" icon="🃏" accent="mint" />
                <StatTile value={totals.picks} label="Cards taken" icon="🫳" />
                <StatTile value={totals.turns} label="Turns played" icon="🔄" />
              </div>
              <p className="mt-2 text-[0.7rem] text-cream-400/70">
                Counted from your last {Math.min(stats.games, 200)} Trump-Patta games.
              </p>
            </section>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/games/trump-patta/history" className="btn btn-secondary flex-1">
                🕘 Full history
              </Link>
              <Link href="/games/trump-patta/play?mode=cpu" className="btn btn-primary flex-1">
                🎮 Play again
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
