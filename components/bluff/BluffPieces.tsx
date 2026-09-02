"use client";

import { CardBack, PlayingCard } from "@/components/PlayingCard";
import { Avatar } from "@/components/Avatar";
import { claimLabel, faceOf, rankLabel, type BluffCard } from "@/lib/bluff/cards";
import type { BluffPlayer, ChallengeOutcome } from "@/lib/bluff/types";

/**
 * The pile in the middle: face-down, always. Only the count is public —
 * seeing what's in it would give away every claim before it's called.
 */
export function PileStack({ size, revealing }: { size: number; revealing?: BluffCard[] | null }) {
  const shown = Math.min(size, 6);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative"
        style={{ width: "calc(var(--card-w) * 1.6)", height: "calc(var(--card-h) * 1.05)" }}
      >
        {size === 0 && !revealing?.length && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed border-brass-400/25"
            style={{ width: "var(--card-w)", height: "var(--card-h)" }}
            aria-hidden
          />
        )}

        {/* Face-down pile. */}
        {!revealing?.length &&
          Array.from({ length: shown }, (_, i) => (
            <CardBack
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) translate(${(i - shown / 2) * 4}px, ${-i * 2}px) rotate(${
                  ((i * 37) % 13) - 6
                }deg)`,
                zIndex: i,
              }}
            />
          ))}

        {/* Mid-challenge: the claimed cards come face-up. */}
        {revealing?.map((card, i) => (
          <span
            key={card.id}
            className="anim-pop absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translateX(${
                (i - (revealing.length - 1) / 2) * 26
              }px) rotate(${(i - (revealing.length - 1) / 2) * 5}deg)`,
              zIndex: 20 + i,
              animationDelay: `${i * 90}ms`,
            }}
          >
            <PlayingCard card={faceOf(card)} />
          </span>
        ))}
      </div>

      <p className="tabular text-xs text-cream-400">
        {size === 0 && !revealing?.length ? "Pile is empty" : `${size} card${size === 1 ? "" : "s"} in the pile`}
      </p>
    </div>
  );
}

/** One opponent: who they are, how many cards, and whether we're waiting. */
export function BluffSeatPod({
  player,
  isTurn,
  isDeciding,
  avatarUrl,
  compact,
}: {
  player: BluffPlayer;
  isTurn: boolean;
  isDeciding: boolean;
  avatarUrl?: string | null;
  compact?: boolean;
}) {
  const out = player.hand.length === 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 backdrop-blur-sm transition-colors ${
        isTurn || isDeciding
          ? "anim-turn border-mint-300/70 bg-mint-400/10"
          : out
          ? "border-white/10 bg-white/[0.03] opacity-70"
          : "border-brass-400/20 bg-ink-900/70"
      }`}
      style={{ minWidth: compact ? "7.5rem" : "9rem" }}
    >
      <div className="relative shrink-0" style={{ width: "1.9rem", height: "2.7rem" }}>
        {out ? (
          <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-white/20 text-[0.6rem] text-mint-300">
            ✓
          </div>
        ) : (
          <div style={{ transform: "scale(0.42)", transformOrigin: "top left" }}>
            <CardBack />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {player.kind === "cpu" ? (
            <span aria-hidden className="text-xs">🤖</span>
          ) : (
            <Avatar src={avatarUrl} name={player.name} size={18} dim={out} />
          )}
          <span className="truncate text-sm font-semibold text-cream-50">{player.name}</span>
        </div>
        {out ? (
          <span className="text-[0.7rem] font-medium text-mint-300">
            {player.finishedRank === 0 ? "🏆 Won" : "✓ Out, safe"}
          </span>
        ) : isDeciding ? (
          <span className="flex items-center gap-1 text-[0.7rem] text-brass-300">
            Soch raha hoon
            <span className="flex gap-0.5" aria-hidden>
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
              <span className="think-dot h-1 w-1 rounded-full bg-brass-300" />
            </span>
          </span>
        ) : (
          <span className="tabular text-[0.7rem] text-cream-400">
            {player.hand.length} card{player.hand.length === 1 ? "" : "s"}
            {player.hand.length <= 3 && player.hand.length > 0 ? " 👀" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The claim everyone can see. The cards behind it are face-down; this
 * banner is the only thing the table has to go on.
 */
export function ClaimBanner({ name, rank, count }: { name: string; rank: string; count: number }) {
  return (
    <div className="anim-pop mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full border border-brass-400/40 bg-ink-900/90 px-4 py-1.5 text-center backdrop-blur-sm">
      <span className="truncate text-xs text-cream-400">{name} claims</span>
      <span className="font-display text-base font-bold text-brass-200">
        {claimLabel(rank as never, count)}
      </span>
    </div>
  );
}

/** The short, loud verdict on a challenge. */
export function ChallengeNotice({ outcome, players }: { outcome: ChallengeOutcome; players: BluffPlayer[] }) {
  const liar = players[outcome.claimSeat]?.name ?? "They";
  const caller = players[outcome.challengerSeat]?.name ?? "They";
  const collector = players[outcome.collectorSeat]?.name ?? "They";

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-30 flex justify-center" aria-live="polite">
      <div
        className={`anim-pop rounded-2xl border-2 px-5 py-3 text-center shadow-[0_20px_44px_-14px_rgba(0,0,0,0.95)] backdrop-blur-sm ${
          outcome.caught
            ? "border-chili-400/70 bg-ink-900/95"
            : "border-mint-300/60 bg-ink-900/95"
        }`}
      >
        <p
          className={`font-display text-2xl font-bold leading-none sm:text-3xl ${
            outcome.caught ? "text-chili-400" : "text-mint-300"
          }`}
        >
          {outcome.caught ? "😂 BLUFF PAKRA GAYA!" : "😭 SACH BOL RAHA THA!"}
        </p>
        <p className="mt-2 text-sm font-semibold text-cream-100">
          {outcome.caught
            ? `${liar} claimed ${claimLabel(outcome.rank as never, outcome.cards.length)} — and didn't have them.`
            : `${caller} called it, but ${liar} was telling the truth.`}
        </p>
        <p className="tabular mt-1 text-xs text-cream-400">
          {collector} picks up {outcome.pileSize} card{outcome.pileSize === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

export { rankLabel };
