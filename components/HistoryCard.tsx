"use client";

import Link from "next/link";
import type { GameRecord } from "@/lib/gameHistory";

export function relativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * What each game calls coming last.
 *
 * `is_thulla` is the shared column for it — every game here has exactly one
 * loser — but the word isn't shared: Bluff's is plain last place and
 * Trump-Patta's is the Thief. Calling a Trump-Patta loss a "Thulla" is
 * simply the wrong game's vocabulary.
 */
export function loserName(game?: string | null): { text: string; icon: string } {
  switch (game) {
    case "trump_patta":
      return { text: "Thief", icon: "🥷" };
    case "bluff":
      return { text: "Last", icon: "😅" };
    default:
      return { text: "Thulla", icon: "😂" };
  }
}

export function outcomeLabel(r: GameRecord): { text: string; icon: string; tone: string } {
  if (r.isWin) return { text: "Won", icon: "🏆", tone: "text-brass-300" };
  if (r.isThulla) {
    const loser = loserName(r.game);
    return { text: loser.text, icon: loser.icon, tone: "text-chili-400" };
  }
  return { text: "Lost", icon: "❌", tone: "text-cream-400" };
}

export function opponentSummary(r: GameRecord): string {
  if (r.mode === "friends") return `vs ${r.playerCount - 1} player${r.playerCount === 2 ? "" : "s"}`;
  const cpus = r.players.filter((p) => p.type === "cpu").length;
  return `vs ${cpus} CPU${cpus === 1 ? "" : "s"}`;
}

/**
 * One game, as a card. Cards rather than table rows all the way up — a wide
 * table on a phone either overflows or shrinks its text to nothing.
 */
export function HistoryCard({ record }: { record: GameRecord }) {
  const outcome = outcomeLabel(record);
  return (
    <Link
      href={`/profile/history/${record.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:border-brass-400/40 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold ${outcome.tone}`}>
            <span aria-hidden>{outcome.icon}</span> {outcome.text}
          </p>
          <p className="mt-0.5 truncate text-xs text-cream-400">
            {opponentSummary(record)} · {record.mode === "cpu" ? "CPU" : "Friends"}
            {record.cpuDifficulty ? ` · ${record.cpuDifficulty}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-cream-400">{relativeDay(record.completedAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.7rem] text-cream-400">
        <span>
          Winner: <span className="text-cream-100">{record.winnerName ?? "—"}</span>
        </span>
        <span>
          Thulla: <span className="text-cream-100">{record.thullaName ?? "—"}</span>
        </span>
      </div>
    </Link>
  );
}
