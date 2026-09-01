"use client";

import { CardStack } from "./PlayingCard";
import type { EnginePlayer } from "@/lib/engine/types";

interface SeatPodProps {
  player: EnginePlayer;
  isTurn: boolean;
  isThinking: boolean;
  thinkingLabel: string;
  cardsLabel: string;
  outLabel: string;
  compact?: boolean;
  /** Drops the card thumbnail so many seats still fit round the table. */
  dense?: boolean;
}

/**
 * One opponent: who they are, how many cards they're sitting on, and whether
 * the table is waiting on them. Turn state is carried by a glow *and* a text
 * label, so it never depends on colour alone.
 */
export function SeatPod({
  player,
  isTurn,
  isThinking,
  thinkingLabel,
  cardsLabel,
  outLabel,
  compact,
  dense,
}: SeatPodProps) {
  const isOut = player.hand.length === 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition-colors backdrop-blur-sm ${
        isTurn
          ? "border-mint-300/70 bg-mint-400/10 anim-turn"
          : isOut
          ? "border-white/10 bg-white/[0.03] opacity-70"
          : "border-brass-400/20 bg-ink-900/70"
      }`}
      style={{ minWidth: dense ? "6.6rem" : compact ? "8.5rem" : "9.5rem" }}
    >
      {!dense && (
      <div className="relative shrink-0" style={{ transform: "scale(0.62)", transformOrigin: "center", marginInline: "-0.7rem" }}>
        {isOut ? (
          <div
            className="grid place-items-center rounded-lg border border-dashed border-white/20 text-[0.6rem] text-cream-400"
            style={{ width: "var(--card-w)", height: "var(--card-h)" }}
          >
            —
          </div>
        ) : (
          <CardStack count={player.hand.length} />
        )}
      </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-xs">{player.kind === "cpu" ? "🤖" : "🙂"}</span>
          <span className="truncate text-sm font-semibold text-cream-50">{player.name}</span>
        </div>
        {isOut ? (
          <span className="text-[0.7rem] font-medium text-mint-300">✓ {outLabel}</span>
        ) : isThinking ? (
          <span className="flex items-center gap-1 text-[0.7rem] text-brass-300">
            {thinkingLabel}
            <span className="flex gap-0.5" aria-hidden>
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
            </span>
          </span>
        ) : (
          <span className="tabular text-[0.7rem] text-cream-400">
            {player.hand.length} {cardsLabel}
          </span>
        )}
      </div>
    </div>
  );
}
