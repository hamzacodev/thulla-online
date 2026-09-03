"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { PlayingCard } from "@/components/PlayingCard";
import { standings } from "@/lib/trumpPatta/rules";
import type { TrumpPattaState } from "@/lib/trumpPatta/types";

const PLACE = ["🥇", "🥈", "🥉"];

function duration(state: TrumpPattaState): string {
  const ms = Math.max(0, state.updatedAt - state.startedAt);
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * The result, and the reveal.
 *
 * This is the only screen allowed to show the card that was pulled out
 * before the deal — showing it a moment earlier would give away who was
 * safe. Putting the two cards side by side is what makes the ending legible:
 * the Thief is holding one half of a pair whose other half was never in the
 * game.
 */
export function TrumpPattaGameOver({
  state,
  viewSeat,
  avatars,
  onRematch,
  series,
}: {
  state: TrumpPattaState;
  viewSeat: number;
  avatars?: Record<string, string>;
  onRematch?: () => void;
  /** The between-games panel, when this game was part of a series. */
  series?: React.ReactNode;
}) {
  const table = standings(state);
  const thief = state.thiefSeat !== null ? state.players[state.thiefSeat] : null;
  const iAmThief = state.thiefSeat === viewSeat;

  return (
    <div className="relative flex flex-1 items-center justify-center px-4 py-8">
      <div className="panel anim-pop w-full max-w-md p-6 text-center">
        <p className="font-display text-3xl font-bold text-cream-50">
          {iAmThief ? "You're the Thief! 🥷" : "Game Over 🃏"}
        </p>
        <p className="mt-1 text-sm text-cream-400">
          {iAmThief ? "Arre yaar! Agli baar zaroor. 😅" : "Safe nikal gaye! 🎉"}
        </p>

        <div className="brass-rule my-5" />

        <div className="rounded-xl border border-chili-400/30 bg-chili-500/10 p-3">
          <p className="text-[0.7rem] uppercase tracking-wider text-chili-300">🥷 The Thief</p>
          <p className="font-display mt-1 truncate text-xl font-bold text-cream-50">
            {thief?.name ?? "—"}
          </p>
        </div>

        {/* The two halves of the pair that never met. */}
        <div className="mt-4 flex items-start justify-center gap-6">
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">Left holding</p>
            {state.remainingCard ? (
              <PlayingCard card={state.remainingCard} />
            ) : (
              <span className="card-shell card-back block" aria-hidden />
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">Hidden card</p>
            <PlayingCard card={state.removedCard} />
            <p className="max-w-[8rem] text-[0.65rem] leading-tight text-cream-500">
              Pulled out before the deal, so its partner could never pair.
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-1.5 text-left">
          {table.map((p, i) => {
            const isThief = p.seat === state.thiefSeat;
            return (
              <li
                key={p.seat}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isThief
                    ? "bg-chili-500/15 text-chili-200"
                    : p.seat === viewSeat
                      ? "bg-white/10 text-cream-100"
                      : "text-cream-300"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-center">{PLACE[i] ?? i + 1}</span>
                  <Avatar src={avatars?.[p.id]} name={p.name} size={22} />
                  <span className="truncate font-semibold">{p.name}</span>
                </span>
                <span className="shrink-0 text-xs">{isThief ? "Thief 🥷" : "Safe"}</span>
              </li>
            );
          })}
        </ol>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Turns", String(state.turnNumber)],
            ["Pairs", String(state.discards.length)],
            ["Time", duration(state)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-black/20 px-2 py-1.5">
              <dt className="text-[0.65rem] uppercase tracking-wide text-cream-500">{label}</dt>
              <dd className="tabular text-sm font-semibold text-cream-100">{value}</dd>
            </div>
          ))}
        </dl>

        {series}

        {!series && (
          <div className="mt-5 flex flex-col gap-2">
            {onRematch && (
              <button
                type="button"
                onClick={onRematch}
                className="btn-brass w-full rounded-xl px-4 py-3 font-semibold"
              >
                Play again
              </button>
            )}
            <Link
              href="/games/trump-patta"
              className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-cream-200 hover:bg-white/5"
            >
              Back to Trump-Patta
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
