"use client";

import { BluffHand } from "./BluffHand";
import { BluffSeatPod, ClaimBanner, PileStack } from "./BluffPieces";
import { ChallengeBar, ClaimBar } from "./ClaimBar";
import type { Rank } from "@/lib/bluff/cards";
import type { BluffState } from "@/lib/bluff/types";

/**
 * The Bluff table.
 *
 * Same two-layout trick the Thulla table uses: opponents wrap into a row on
 * a phone and sit on an arc from `md` up, from one pass of markup. The pile
 * is the fixed centre either way, because it's the only thing everybody is
 * looking at.
 */
export function BluffTable({
  state,
  viewSeat,
  selected,
  claimRank,
  awaitingChallenge,
  pendingChallenger,
  avatars,
  onToggleCard,
  onPickRank,
  onPlay,
  onClearSelection,
  onCall,
  onPass,
}: {
  state: BluffState;
  viewSeat: number;
  selected: string[];
  claimRank: Rank | null;
  awaitingChallenge: boolean;
  pendingChallenger: number | null;
  avatars?: Record<string, string>;
  onToggleCard: (id: string) => void;
  onPickRank: (rank: Rank) => void;
  onPlay: () => void;
  onClearSelection: () => void;
  onCall: () => void;
  onPass: () => void;
}) {
  const total = state.players.length;
  const me = state.players[viewSeat];
  const others = Array.from({ length: total - 1 }, (_, i) => state.players[(viewSeat + 1 + i) % total]);
  const crowded = others.length > 5;

  // Only players still holding cards take a turn, so only they get a number.
  const turnsAway = new Map<number, number>();
  let step = 0;
  for (const p of others) {
    if (p.hand.length === 0) continue;
    turnsAway.set(p.seat, ++step);
  }

  const myTurn = state.phase === "claiming" && state.turnSeat === viewSeat;
  const revealing = state.phase === "reveal" ? state.outcome?.cards ?? null : null;
  const claim = state.claim;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The table takes whatever height is left over.
          Thulla's ring is a fixed height, which works there because its
          controls are a row of cards. Bluff's are a thirteen-button rank
          picker and a commit button — much taller — so a fixed ring either
          pushed them off the bottom of a short window or, once shortened,
          left a band of dead felt underneath them on a tall one. Growing
          instead of fixing keeps the controls on the bottom edge where a
          thumb expects them, at every height. */}
      <div className="seat-ring flex min-h-0 flex-1 flex-col md:block md:!h-auto md:!min-h-[15rem]">
        <div className="flex flex-wrap items-start justify-center gap-2 px-2 pt-2 md:contents">
          {others.map((p, i) => {
            const along = others.length === 1 ? 0.5 : 0.09 + (0.82 * i) / (others.length - 1);
            const angle = Math.PI + Math.PI * along;
            const x = 50 + Math.cos(angle) * (crowded ? 46 : 44);
            const y = 50 + Math.sin(angle) * (crowded ? 45 : 42);
            return (
              <div
                key={p.seat}
                className="seat-slot anim-rise"
                style={{
                  ["--seat-x" as string]: `${x}%`,
                  ["--seat-y" as string]: `${y}%`,
                  animationDelay: `${i * 55}ms`,
                }}
              >
                <BluffSeatPod
                  player={p}
                  turnsAway={turnsAway.get(p.seat) ?? null}
                  isTurn={state.phase === "claiming" && state.turnSeat === p.seat}
                  isDeciding={state.phase === "challenge" && pendingChallenger === p.seat}
                  avatarUrl={avatars?.[p.id]}
                  compact={crowded}
                />
              </div>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-1 md:absolute md:left-1/2 md:top-1/2 md:z-[2] md:block md:w-auto md:flex-none md:-translate-x-1/2 md:-translate-y-1/2">
          <PileStack size={state.pile.length} revealing={revealing} />
          {claim && state.phase === "challenge" && (
            <div className="mt-2">
              <ClaimBanner
                name={state.players[claim.seat]?.name ?? "They"}
                rank={claim.rank}
                count={claim.cards.length}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="flex min-h-[1.75rem] shrink-0 items-center justify-center px-3 pt-0.5">
        <p
          className={`rounded-full px-4 py-1 text-sm font-semibold ${
            myTurn || awaitingChallenge
              ? "bg-mint-400/15 text-mint-300 ring-1 ring-mint-300/40"
              : "text-cream-400"
          }`}
          aria-live="polite"
        >
          {state.phase === "reveal"
            ? "Cards on the table…"
            : awaitingChallenge
            ? "😈 Call it, or let it go"
            : myTurn
            ? "🔵 Your turn — pick cards and claim"
            : state.phase === "challenge" && pendingChallenger !== null
            ? `${state.players[pendingChallenger]?.name} is deciding…`
            : state.turnSeat >= 0
            ? `${state.players[state.turnSeat]?.name}'s turn`
            : ""}
        </p>
      </div>

      {/* Your seat */}
      <div className="flex min-h-0 shrink-0 flex-col">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs text-cream-400">
          <span className="font-semibold text-cream-100">{me?.name}</span>
          <span className="tabular">
            · {me?.hand.length ?? 0} card{me?.hand.length === 1 ? "" : "s"}
          </span>
          {me && me.hand.length > 0 && me.hand.length <= 3 && (
            <span className="text-mint-300">· Bas thore cards reh gaye! 👀</span>
          )}
        </div>

        {me && me.hand.length > 0 ? (
          <BluffHand hand={me.hand} selected={selected} enabled={myTurn} onToggle={onToggleCard} />
        ) : (
          <p className="py-6 text-center text-sm font-semibold text-mint-300">
            {me?.finishedRank === 0 ? "🔥 Wah bhai! Sab cards khatam!" : "✓ You're out, safe."}
          </p>
        )}
      </div>

      {/* Controls */}
      {awaitingChallenge && claim ? (
        <ChallengeBar
          name={state.players[claim.seat]?.name ?? "They"}
          rank={claim.rank}
          count={claim.cards.length}
          onCall={onCall}
          onPass={onPass}
        />
      ) : myTurn && me ? (
        <ClaimBar
          selected={selected}
          hand={me.hand}
          lockedRank={state.config.lockRankPerRound ? state.roundRank : null}
          claimRank={claimRank}
          onPickRank={onPickRank}
          onPlay={onPlay}
          onClear={onClearSelection}
        />
      ) : null}
    </div>
  );
}
