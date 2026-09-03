"use client";

import { PlayingCard } from "../PlayingCard";
import { cardLabel, type Card } from "@/lib/engine/cards";

/**
 * A card with its position written above it.
 *
 * The number is the whole point of the layout: it is how the picker says
 * which card they want ("position 3"), and how the owner sees the effect of
 * rearranging. It is derived from the card's index every render, so it is
 * never stale — there is no stored position to fall out of step with the
 * hand.
 *
 * Cards here do not overlap, unlike a Thulla fan. A fan hides all but a
 * sliver of each card, and in this game both the owner and the picker have
 * to read every card and its number.
 */
export function NumberedCard({
  card,
  position,
  faceDown,
  state = "idle",
  className = "",
}: {
  card?: Card;
  position: number;
  faceDown?: boolean;
  /** `lifted` while being moved, `picked` for the card just taken. */
  state?: "idle" | "lifted" | "picked";
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 flex-col items-center gap-1 ${className}`}>
      <span
        className={`tabular text-[0.65rem] font-bold leading-none transition-colors sm:text-xs ${
          state === "idle" ? "text-cream-400" : "text-brass-300"
        }`}
      >
        #{position}
      </span>
      {faceDown || !card ? (
        <span className="card-shell card-back block" aria-hidden />
      ) : (
        <PlayingCard card={card} title={`${cardLabel(card)} — position ${position}`} />
      )}
    </span>
  );
}

/**
 * The pairs everybody can see.
 *
 * Discards are public, deliberately and importantly: they are the only
 * honest way to work out which rank the odd card belongs to, and hiding them
 * would turn deduction into guesswork. Every pair that has left any hand
 * appears here, including the ones thrown away before the first turn.
 */
export function DiscardPairs({ pairs }: { pairs: Array<[Card, Card]> }) {
  if (!pairs.length) {
    return (
      <p className="rounded-2xl border border-white/10 bg-ink-900/40 px-3 py-3 text-center text-xs text-cream-400">
        No pairs discarded yet.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 px-2.5 py-2">
      <p className="mb-1 flex items-baseline justify-between gap-2 text-[0.65rem] font-semibold uppercase tracking-wide text-cream-400">
        <span>Discarded pairs</span>
        <span className="tabular text-cream-500">
          {pairs.length} pair{pairs.length === 1 ? "" : "s"} · {pairs.length * 2} cards
        </span>
      </p>
      {/*
        A sideways strip, not a wrapping grid. There can be up to 25 pairs by
        the end of a game, and letting them wrap downwards pushed the hand —
        the part you actually play with — off the bottom of the screen.
      */}
      <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5">
        {pairs.map((pair, i) => (
          <span
            key={`${pair[0]}-${pair[1]}-${i}`}
            className="flex shrink-0 items-center gap-0.5 rounded-lg bg-black/25 px-1 py-1"
            style={{
              ["--card-w" as string]: "clamp(1.35rem, 3.4vw, 1.9rem)",
              // Both, always. `--card-h` is `calc(var(--card-w) * 1.42)` at
              // the root, so it computes there and descendants inherit the
              // resolved length — override the width alone and you get a
              // narrow card at full height.
              ["--card-h" as string]: "calc(var(--card-w) * 1.42)",
            }}
          >
            <PlayingCard card={pair[0]} />
            <PlayingCard card={pair[1]} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The card you just turned over.
 *
 * The one moment in the game where a hidden card becomes yours, so it gets
 * the middle of the table and stays there until you say go. If it made a
 * pair, both cards are shown together — you can see *why* they're leaving,
 * rather than watching your hand shrink for no visible reason.
 */
export function PickReveal({
  card,
  paired,
  position,
  donorName,
  pickerName,
  onConfirm,
}: {
  /** Absent when the pick was between two other players — none of your business. */
  card?: Card;
  paired: [Card, Card] | null;
  position: number;
  donorName: string;
  pickerName: string;
  onConfirm?: () => void;
}) {
  // Watching two other people trade a card tells you a position and nothing
  // more. A discarded pair is different — it lands in the public pile.
  const mine = !!card;

  return (
    <div className="panel anim-pop flex w-[min(92vw,22rem)] flex-col items-center gap-3 p-4 text-center">
      <p className="text-[0.7rem] uppercase tracking-wide text-cream-400">
        {mine ? `Position ${position} from ${donorName}` : `${pickerName} ← ${donorName}`}
      </p>

      {paired ? (
        <>
          <div className="flex items-end justify-center gap-2">
            <PlayingCard card={paired[0]} />
            <span className="pb-6 text-xl font-bold text-emerald-300" aria-hidden>+</span>
            <PlayingCard card={paired[1]} />
          </div>
          <p className="text-sm font-semibold text-emerald-300">
            {mine
              ? `${cardLabel(card!)} — a pair! Both go to the discards.`
              : `${pickerName} made a pair — both go to the discards.`}
          </p>
        </>
      ) : mine ? (
        <>
          <PlayingCard card={card!} />
          <p className="text-sm font-semibold text-cream-100">
            You took {cardLabel(card!)}. No pair — it stays in your hand.
          </p>
        </>
      ) : (
        <>
          <span className="card-shell card-back block" aria-hidden />
          <p className="text-sm font-semibold text-cream-300">
            {pickerName} took position{" "}
            <span className="tabular font-bold text-brass-300">{position}</span> from {donorName}.
          </p>
          <p className="text-xs text-cream-500">Face-down — only they know what it was.</p>
        </>
      )}

      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          className="btn btn-primary !min-h-11 w-full text-sm"
          autoFocus
        >
          {paired ? "Discard the pair →" : "Keep it →"}
        </button>
      )}
    </div>
  );
}

/** Who is showing to whom, in one line, for everyone at the table. */
export function TurnBanner({
  donorName,
  pickerName,
  youArePicker,
  youAreDonor,
}: {
  donorName: string;
  pickerName: string;
  youArePicker: boolean;
  youAreDonor: boolean;
}) {
  const text = youArePicker
    ? `${donorName} is showing you their cards — take one`
    : youAreDonor
      ? `You're showing your cards to ${pickerName}`
      : `${donorName} is showing their cards to ${pickerName}`;

  return (
    <p
      className={`rounded-2xl border px-3 py-2.5 text-center text-sm font-semibold ${
        youArePicker
          ? "border-brass-400/60 bg-brass-500/15 text-brass-200"
          : "border-white/10 bg-ink-900/50 text-cream-300"
      }`}
      aria-live="polite"
    >
      {text}
    </p>
  );
}
