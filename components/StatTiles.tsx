"use client";

import { formatWinRate, winRate, type PlayerStats } from "@/lib/gameHistory";

export function StatTile({
  value,
  label,
  icon,
  accent,
}: {
  value: string | number;
  label: string;
  icon?: string;
  accent?: "brass" | "mint" | "chili";
}) {
  const tone =
    accent === "mint"
      ? "text-mint-300"
      : accent === "chili"
      ? "text-chili-400"
      : accent === "brass"
      ? "text-brass-300"
      : "text-cream-50";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
      <p className={`tabular font-display text-2xl font-bold leading-none ${tone}`}>{value}</p>
      <p className="mt-1.5 text-[0.68rem] uppercase tracking-wide text-cream-400">
        {icon && <span aria-hidden>{icon} </span>}
        {label}
      </p>
    </div>
  );
}

/**
 * Win-rate bar. The percentage is always written out next to it — the bar
 * is a second reading of the same number, never the only one.
 */
export function WinRateBar({ stats }: { stats: PlayerStats }) {
  const rate = winRate(stats);
  const pct = rate ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-cream-100">Win Rate</span>
        <span className="tabular text-sm font-bold text-brass-300">{formatWinRate(stats)}</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={rate ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Win rate ${formatWinRate(stats)}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300 transition-[width] duration-700 ease-[var(--ease-card)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {stats.games > 0 && (
        <p className="tabular mt-1 text-[0.68rem] text-cream-400">
          {stats.wins} won · {stats.losses} lost of {stats.games}
        </p>
      )}
    </div>
  );
}

export function StreakRow({ stats }: { stats: PlayerStats }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">🔥 Current streak</p>
        <p className="tabular mt-1 font-display text-xl font-bold text-cream-50">
          {stats.currentWinStreak > 0
            ? `${stats.currentWinStreak} win${stats.currentWinStreak === 1 ? "" : "s"}`
            : stats.currentLossStreak > 0
            ? `😅 ${stats.currentLossStreak} loss${stats.currentLossStreak === 1 ? "" : "es"}`
            : "—"}
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">🏆 Best streak</p>
        <p className="tabular mt-1 font-display text-xl font-bold text-brass-300">
          {stats.bestWinStreak > 0 ? `${stats.bestWinStreak} win${stats.bestWinStreak === 1 ? "" : "s"}` : "—"}
        </p>
      </div>
    </div>
  );
}

/** A little colour commentary, only when there's something to comment on. */
export function statsQuip(stats: PlayerStats): string | null {
  if (stats.games === 0) return null;
  if (stats.currentWinStreak >= 3) return "Wah ji wah — winning streak chal rahi hai! 🔥";
  if (stats.currentLossStreak >= 3) return "Thoda rough patch hai. Agli game apni! 😅";
  if (stats.thulla >= 5) return "Oho! Thulla count barh gaya 😂";
  const r = winRate(stats);
  if (r !== null && r >= 60 && stats.games >= 5) return "Kya record hai boss! 🔥";
  return null;
}
