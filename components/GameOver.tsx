"use client";

import Link from "next/link";
import { standings } from "@/lib/engine/rules";
import type { GameState } from "@/lib/engine/types";
import { phrase, t, type Lang } from "@/lib/copy";
import { formatWinRate, type PlayerStats } from "@/lib/gameHistory";

/** A short burst of confetti. Positions are deterministic per index. */
function Confetti() {
  const colors = ["#e5c179", "#6fd8ac", "#e2574c", "#f7f1e2", "#35bd88"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className="absolute block h-2 w-1.5 rounded-[1px]"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animation: `confetti-fall ${2.4 + (i % 5) * 0.35}s linear ${(i % 7) * 0.22}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

interface GameOverProps {
  state: GameState;
  viewSeat: number;
  lang: Lang;
  /** Already includes this game — null while it's still being saved. */
  stats?: PlayerStats | null;
  statsAreLocal?: boolean;
  onRematch?: () => void;
  onNewGame?: () => void;
}

export function GameOver({
  state,
  viewSeat,
  lang,
  stats,
  statsAreLocal,
  onRematch,
  onNewGame,
}: GameOverProps) {
  const table = standings(state);
  const winner = table[0];
  const bhabhi = state.bhabhiSeat !== null ? state.players[state.bhabhiSeat] : null;
  const iAmBhabhi = state.bhabhiSeat === viewSeat;
  const iWon = winner?.seat === viewSeat;

  return (
    <div className="relative flex flex-1 items-center justify-center px-4 py-8">
      {iWon && <Confetti />}
      <div className="panel anim-pop w-full max-w-md p-6 text-center">
        <p className="font-display text-3xl font-bold text-cream-50">{t("gameOver", lang)} 🃏</p>
        <p className="mt-1 text-sm text-cream-400">{t("greatGame", lang)}</p>

        <div className="brass-rule my-5" />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-brass-400/25 bg-brass-400/10 p-3">
            <p className="text-[0.7rem] uppercase tracking-wider text-brass-300">🏆 {t("winner", lang)}</p>
            <p className="mt-1 truncate font-semibold text-cream-50">{winner?.name ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-chili-400/30 bg-chili-500/10 p-3">
            <p className="text-[0.7rem] uppercase tracking-wider text-chili-400">😂 Bhabhi</p>
            <p className="mt-1 truncate font-semibold text-cream-50">{bhabhi?.name ?? "—"}</p>
          </div>
        </div>

        <p className="mt-4 text-base font-semibold text-cream-100">
          {iAmBhabhi
            ? `😂 ${t("bhabhiYou", lang)}`
            : bhabhi
            ? `😂 ${phrase.isBhabhi(bhabhi.name, lang)}`
            : ""}
        </p>

        <ol className="mt-5 space-y-1.5 text-left">
          {table.map((p, i) => {
            const isBhabhi = p.seat === state.bhabhiSeat;
            return (
              <li
                key={p.seat}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isBhabhi ? "bg-chili-500/10 ring-1 ring-chili-400/30" : "bg-white/[0.04]"
                } ${p.seat === viewSeat ? "ring-1 ring-brass-300/50" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="tabular w-5 shrink-0 text-cream-400">{i + 1}.</span>
                  <span className="truncate font-medium text-cream-50">{p.name}</span>
                  {p.seat === viewSeat && <span className="shrink-0 text-[0.65rem] text-brass-300">(you)</span>}
                </span>
                <span className="shrink-0 text-xs">
                  {i === 0 ? "🏆" : isBhabhi ? "😂 Bhabhi" : `${i + 1}${["st", "nd", "rd"][i] ?? "th"}`}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Updated career record — recomputed the moment this game saved,
            so the player never has to reload to see it move. */}
        {stats && (
          <div className="mt-5 rounded-xl border border-brass-400/20 bg-brass-400/[0.07] p-3.5 text-left">
            <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-brass-300">
              Your record{statsAreLocal ? " (this device)" : ""}
            </p>
            <dl className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Games", String(stats.games)],
                ["Wins", String(stats.wins)],
                ["Win rate", formatWinRate(stats)],
                [
                  "Streak",
                  stats.currentWinStreak > 0 ? `🔥 ${stats.currentWinStreak}` : "—",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dd className="tabular font-display text-lg font-bold text-cream-50">{value}</dd>
                  <dt className="text-[0.62rem] uppercase tracking-wide text-cream-400">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {onRematch && (
            <button className="btn btn-primary flex-1" onClick={onRematch}>
              🔄 {t("rematch", lang)}
            </button>
          )}
          {onNewGame && (
            <button className="btn btn-secondary flex-1" onClick={onNewGame}>
              👥 {t("newGame", lang)}
            </button>
          )}
          <Link href="/profile" className="btn btn-secondary flex-1">
            📊 Stats
          </Link>
          <Link href="/" className="btn btn-secondary flex-1">
            🏠 {t("home", lang)}
          </Link>
        </div>
      </div>
    </div>
  );
}
