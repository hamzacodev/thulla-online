"use client";

import { Avatar } from "./Avatar";
import { SpeakingWaves } from "./SpeakingWaves";
import { CardStack } from "./PlayingCard";
import type { EnginePlayer } from "@/lib/engine/types";

/** 0-based finishing position → "🏆 1st", "2nd", … */
export function rankBadge(rank: number): string {
  const n = rank + 1;
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n === 1 ? "🏆 " : ""}${n}${suffix}`;
}

interface SeatPodProps {
  player: EnginePlayer;
  /** Their profile picture, if they've uploaded one. */
  avatarUrl?: string | null;
  isTurn: boolean;
  isThinking: boolean;
  thinkingLabel: string;
  cardsLabel: string;
  outLabel: string;
  /**
   * Set at the end of a trick on the player who played the highest card of
   * the led suit — "won" when the pile is discarded, "collects" when they
   * have to pick it up.
   */
  highlight?: "won" | "collects" | null;
  compact?: boolean;
  /** Drops the card thumbnail so many seats still fit round the table. */
  dense?: boolean;
  /**
   * How many turns away this player is: 1 is whoever plays straight after
   * you. Null once they're out, since a player with no cards is skipped.
   *
   * On a wide screen the seats sit round an ellipse and their order is the
   * order you read them in. On a phone they wrap into a row, which says
   * nothing about who follows whom — so the number is the only thing
   * carrying it, and in Thulla knowing who plays after you is most of the
   * game.
   */
  turnsAway?: number | null;
  /** They're talking on voice chat right now. */
  speaking?: boolean;
}

/**
 * One opponent: who they are, how many cards they're sitting on, and whether
 * the table is waiting on them. Turn state is carried by a glow *and* a text
 * label, so it never depends on colour alone.
 */
export function SeatPod({
  player,
  turnsAway,
  speaking,
  avatarUrl,
  isTurn,
  isThinking,
  thinkingLabel,
  cardsLabel,
  outLabel,
  highlight,
  compact,
  dense,
}: SeatPodProps) {
  const isOut = player.hand.length === 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition-colors backdrop-blur-sm ${
        highlight === "won"
          ? "anim-pop border-brass-300 bg-brass-400/20 shadow-[0_0_26px_-6px_rgba(229,193,121,0.9)]"
          : highlight === "collects"
          ? "anim-pop border-chili-400 bg-chili-500/20 shadow-[0_0_26px_-6px_rgba(226,87,76,0.9)]"
          : isTurn
          ? "border-mint-300/70 bg-mint-400/10 anim-turn"
          : isOut
          ? "border-white/10 bg-white/[0.03] opacity-70"
          : "border-brass-400/20 bg-ink-900/70"
      }`}
      style={{ minWidth: dense ? "6.6rem" : compact ? "8.5rem" : "9.5rem" }}
      aria-label={
        turnsAway == null
          ? `${player.name}, out`
          : `${player.name}, ${
              turnsAway === 1 ? "plays after you" : `${turnsAway} turns after you`
            }, ${player.hand.length} cards`
      }
    >
      {/* The stack is drawn at 0.62, so its box is 0.62 too. It used to
          reserve a full-height card and scale the paint down inside it,
          which left every pod ~70px taller than it looked — enough to push
          the top seat down onto the trick pile. Origin is top-left so the
          scaled card lands exactly in the smaller box. */}
      {!dense && (
      <div
        className="relative shrink-0 overflow-hidden"
        style={{
          width: "calc(var(--card-w) * 0.62)",
          height: "calc(var(--card-h) * 0.62)",
        }}
      >
        <div style={{ transform: "scale(0.62)", transformOrigin: "top left" }}>
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
      </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {turnsAway != null && (
            <span
              aria-hidden
              title={turnsAway === 1 ? "Plays after you" : `${turnsAway} turns after you`}
              className={`tabular grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold ${
                turnsAway === 1
                  ? "bg-brass-400 text-ink-950"
                  : "bg-white/10 text-cream-400"
              }`}
            >
              {turnsAway}
            </span>
          )}
          {player.kind === "cpu" || player.autoplay ? (
            <span aria-hidden className="text-xs">🤖</span>
          ) : (
            <Avatar src={avatarUrl} name={player.name} size={dense ? 18 : 20} dim={isOut} />
          )}
          <span className="truncate text-sm font-semibold text-cream-50">{player.name}</span>
          {speaking && <SpeakingWaves name={player.name} />}
        </div>
        {highlight === "won" ? (
          <span className="text-[0.7rem] font-semibold text-brass-200">🏆 took the trick</span>
        ) : highlight === "collects" ? (
          <span className="text-[0.7rem] font-semibold text-chili-400">😂 picks up</span>
        ) : isOut ? (
          <span className="text-[0.7rem] font-medium text-mint-300">
            {player.finishedRank === null ? `✓ ${outLabel}` : `${rankBadge(player.finishedRank)} ${outLabel}`}
          </span>
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
