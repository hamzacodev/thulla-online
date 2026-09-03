"use client";

import { NumberedCard } from "./TrumpPattaPieces";

/**
 * The hand you are picking from — face-down, always.
 *
 * You are choosing a position out of a fan held out towards you, not reading
 * somebody's cards. That is the whole game: if you could see the faces you
 * would take the one that pairs every single time and there would be nothing
 * left to play. Nobody, at any seat, is ever sent another player's cards —
 * and these aren't hidden with CSS, they were never in the payload.
 *
 * The numbers matter more here than anywhere else, because a position is all
 * you have to go on. They are the donor's own arrangement, and you cannot
 * change it.
 */
export function DonorHand({
  donorName,
  cardCount,
  canPick,
  onPick,
  busy,
  spectating,
}: {
  donorName: string;
  cardCount: number;
  canPick: boolean;
  onPick: (position: number) => void;
  busy?: boolean;
  /** Someone else is picking — you are only watching. */
  spectating?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-ink-900/50 p-3"
      style={{
        // Both together: `--card-h` derives from `--card-w` at the root, so
        // it resolves there and a width-only override would leave a narrow
        // card at full height.
        ["--card-w" as string]: "clamp(2.4rem, 7vw, 3.3rem)",
        ["--card-h" as string]: "calc(var(--card-w) * 1.42)",
      }}
    >
      <p className="mb-2 flex items-baseline justify-between gap-2 px-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-cream-400">
        <span>{donorName}&apos;s hand</span>
        <span className="tabular text-cream-500">
          {cardCount} card{cardCount === 1 ? "" : "s"}
        </span>
      </p>

      <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {Array.from({ length: cardCount }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={!canPick || busy}
            onClick={() => onPick(i + 1)}
            className={`rounded-xl transition-transform duration-150 ${
              canPick && !busy
                ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-400"
                : "cursor-default"
            }`}
            aria-label={`Take the card at position ${i + 1} of ${cardCount}`}
          >
            <NumberedCard position={i + 1} faceDown state={canPick && !busy ? "picked" : "idle"} />
          </button>
        ))}
      </div>

      <p className="mt-2 text-center text-xs text-cream-500">
        {canPick
          ? "Face-down — pick a position and hope."
          : spectating
            ? "Only the player picking can choose from these."
            : "Face-down to everyone."}
      </p>
    </div>
  );
}
