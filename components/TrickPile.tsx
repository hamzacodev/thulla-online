"use client";

import { PlayingCard } from "./PlayingCard";
import type { GameState } from "@/lib/engine/types";
import { suitName, suitSymbol } from "@/lib/engine/cards";

interface TrickPileProps {
  state: GameState;
  /** Seat rendered at the bottom of the table, so cards fly from the right place. */
  viewSeat: number;
  emptyLabel: string;
}

/**
 * The centre of the table.
 *
 * Two layouts, because the same arrangement doesn't mean the same thing on
 * both. On a wide screen the seats sit round an ellipse, so placing a card
 * in its player's direction genuinely says who played it. On a phone the
 * opponents are a wrapped row at the top and that direction is meaningless,
 * so the pile becomes a left-to-right row in play order instead. Either way
 * every card is captioned with the name of whoever played it.
 */
export function TrickPile({ state, viewSeat, emptyLabel }: TrickPileProps) {
  const total = state.players.length;
  /**
   * How far cards sit from the middle, as a multiple of a card. Offsets used
   * to be a flat 26px, which is two thirds of an overlap once a desktop card
   * is 80px wide — the pile read as one shuffled heap with the names buried
   * underneath. Expressed in card widths instead, it spreads properly at
   * every size, and a busier table gets a wider ring to sit on.
   */
  const spread = Math.min(1.5, 0.8 + total * 0.1);
  const outcome = state.phase === "trickEnd" ? state.trickOutcome : null;
  const highSeat =
    outcome?.kind === "discard" ? outcome.winnerSeat : outcome?.kind === "pickup" ? outcome.collectorSeat : -1;

  if (state.pile.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <div
          className="rounded-xl border border-dashed border-brass-400/25"
          style={{ width: "var(--card-w)", height: "var(--card-h)" }}
          aria-hidden
        />
        <p className="text-xs text-cream-400/70">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="pile-area" style={{ ["--spread" as string]: spread.toFixed(2) }}>
        {state.pile.map((entry, i) => {
          const player = state.players[entry.seat];
          // Direction of that seat relative to the viewer — only used on
          // the wide layout, where the seats actually sit in a ring.
          const rel = (entry.seat - viewSeat + total) % total;
          const angle = (rel / total) * Math.PI * 2 + Math.PI / 2;
          const spin = ((entry.card.charCodeAt(0) + entry.seat * 7) % 13) - 6;
          const isHigh = entry.seat === highSeat;
          const brokeIt = outcome?.kind === "pickup" && outcome.brokeBySeat === entry.seat;
          const isMe = entry.seat === viewSeat;

          return (
            <div
              key={`${entry.card}-${entry.seat}`}
              className="pile-card"
              style={{
                ["--pxf" as string]: (Math.cos(angle) * spread).toFixed(3),
                ["--pyf" as string]: (Math.sin(angle) * spread).toFixed(3),
                ["--rot" as string]: `${spin}deg`,
                // The off-suit card is the whole story of the trick — it's
                // the one that broke the suit — so it goes on top of the
                // pile. Otherwise whoever played the highest card of the led
                // suit covers it, and you can't see what actually happened.
                ["--pop" as string]: brokeIt ? "1.14" : isHigh && outcome ? "1.1" : "1",
                zIndex: brokeIt ? 60 : isHigh && outcome ? 50 : i + 1,
              }}
            >
              {/* The fly-in lives on its own wrapper so it composes with the
                  card's resting position instead of replacing it. Animating
                  the positioned element itself made every card snap from the
                  middle of the table to its real spot the instant the
                  animation ended. */}
              <div
                className="pile-fly"
                style={{
                  ["--from-x" as string]: `${Math.cos(angle) * 83}px`,
                  ["--from-y" as string]: `${Math.sin(angle) * 79}px`,
                }}
              >
                <PlayingCard
                  card={entry.card}
                  muted={!!outcome && !isHigh && !brokeIt}
                  className={
                    isHigh && outcome
                      ? outcome.kind === "pickup"
                        ? "ring-2 ring-chili-400 shadow-[0_0_30px_-4px_rgba(226,87,76,0.85)]"
                        : "ring-2 ring-brass-300 shadow-[0_0_30px_-4px_rgba(229,193,121,0.85)]"
                      : brokeIt
                      ? "ring-2 ring-chili-400 shadow-[0_0_34px_-2px_rgba(226,87,76,0.9)]"
                      : ""
                  }
                />
              </div>
              {/* Who played it — the thing that was impossible to tell on a phone. */}
              <span
                className={`pile-name ${
                  isHigh && outcome
                    ? outcome.kind === "pickup"
                      ? "text-chili-400"
                      : "text-brass-200"
                    : isMe
                    ? "text-cream-100"
                    : "text-cream-400"
                }`}
              >
                {isMe ? "You" : player?.name ?? "—"}
                {brokeIt && <span className="text-chili-400"> · thulla!</span>}
              </span>
            </div>
          );
        })}
      </div>

      {state.ledSuit && (
        <p className="text-[0.7rem] text-cream-400/80">
          <span aria-hidden>{suitSymbol(state.ledSuit)}</span> {suitName(state.ledSuit)} led
        </p>
      )}
    </div>
  );
}
