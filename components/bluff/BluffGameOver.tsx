"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { cardsForDecks } from "@/lib/bluff/cards";
import { bluffStandings } from "@/lib/bluff/rules";
import type { BluffState } from "@/lib/bluff/types";

const PLACE = ["🥇", "🥈", "🥉"];

function duration(state: BluffState): string {
  const ms = Math.max(0, state.updatedAt - state.startedAt);
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/** The result, plus the numbers that only Bluff has. */
export function BluffGameOver({
  state,
  viewSeat,
  avatars,
  onRematch,
}: {
  state: BluffState;
  viewSeat: number;
  avatars?: Record<string, string>;
  onRematch?: () => void;
}) {
  const table = bluffStandings(state);
  const winner = table[0];
  const me = state.players[viewSeat];
  const iWon = winner?.seat === viewSeat;
  const mine = me?.stats;

  return (
    <div className="relative flex flex-1 items-center justify-center px-4 py-8">
      <div className="panel anim-pop w-full max-w-md p-6 text-center">
        <p className="font-display text-3xl font-bold text-cream-50">Game Over 🃏</p>
        <p className="mt-1 text-sm text-cream-400">
          {iWon ? "Wah bhai! Sab cards khatam! 🔥" : "Agli baar dekhte hain 😎"}
        </p>

        <div className="brass-rule my-5" />

        <div className="rounded-xl border border-brass-400/25 bg-brass-400/10 p-3">
          <p className="text-[0.7rem] uppercase tracking-wider text-brass-300">🏆 Winner</p>
          <p className="font-display mt-1 truncate text-xl font-bold text-cream-50">
            {winner?.name ?? "—"}
          </p>
        </div>

        <ol className="mt-5 space-y-1.5 text-left">
          {table.map((p, i) => (
            <li
              key={p.seat}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                p.seat === viewSeat ? "bg-white/[0.06] ring-1 ring-brass-300/50" : "bg-white/[0.04]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-center">{PLACE[i] ?? `${i + 1}️⃣`}</span>
                {p.kind === "cpu" ? (
                  <span aria-hidden className="text-xs">🤖</span>
                ) : (
                  <Avatar src={avatars?.[p.id]} name={p.name} size={20} />
                )}
                <span className="truncate font-medium text-cream-50">{p.name}</span>
                {p.seat === viewSeat && <span className="shrink-0 text-[0.65rem] text-brass-300">(you)</span>}
              </span>
              <span className="tabular shrink-0 text-xs text-cream-400">
                {p.hand.length > 0 ? `${p.hand.length} left` : "out"}
              </span>
            </li>
          ))}
        </ol>

        {mine && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-left">
            <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-brass-300">Your game</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["Bluffs called", mine.bluffsCalled],
                ["Calls that landed", mine.successfulCalls],
                ["Calls that missed", mine.failedCalls],
                ["Lies you got away with", mine.successfulBluffs],
                ["Times caught", mine.timesCaught],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-cream-400">{label}</dt>
                  <dd className="tabular font-display font-bold text-cream-50">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p className="tabular mt-4 text-xs text-cream-400">
          {state.config.playerCount} players · {"🃏".repeat(state.config.deckCount)}{" "}
          {state.config.deckCount} deck{state.config.deckCount > 1 ? "s" : ""} /{" "}
          {cardsForDecks(state.config.deckCount)} cards · {duration(state)}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {onRematch && (
            <button className="btn btn-primary flex-1" onClick={onRematch}>
              🔄 Play again
            </button>
          )}
          <Link href="/games/bluff" className="btn btn-secondary flex-1">
            😈 Back to Bluff
          </Link>
          <Link href="/games" className="btn btn-secondary flex-1">
            🃏 Games
          </Link>
        </div>
      </div>
    </div>
  );
}
