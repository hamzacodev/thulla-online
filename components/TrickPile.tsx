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
 * The centre of the table. Each card lands where its player sits, so you can
 * read who played what without a legend — and when a trick ends, the winning
 * card is the one still lit while the rest dim.
 */
export function TrickPile({ state, viewSeat, emptyLabel }: TrickPileProps) {
  const total = state.players.length;
  const outcome = state.phase === "trickEnd" ? state.trickOutcome : null;
  const highSeat =
    outcome?.kind === "discard" ? outcome.winnerSeat : outcome?.kind === "pickup" ? outcome.collectorSeat : -1;

  return (
    <div className="relative grid place-items-center pb-6" style={{ minHeight: "calc(var(--card-h) * 2.1)" }}>
      {state.pile.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="rounded-xl border border-dashed border-brass-400/25"
            style={{ width: "var(--card-w)", height: "var(--card-h)" }}
            aria-hidden
          />
          <p className="text-xs text-cream-400/70">{emptyLabel}</p>
        </div>
      ) : (
        <div className="relative" style={{ width: "calc(var(--card-w) * 2.6)", height: "calc(var(--card-h) * 1.7)" }}>
          {state.pile.map((entry, i) => {
            // Offset from the seat's direction relative to the viewer, so a
            // card from the player on your left lands slightly to the left.
            const rel = (entry.seat - viewSeat + total) % total;
            const angle = (rel / total) * Math.PI * 2 + Math.PI / 2;
            const dx = Math.cos(angle) * 26;
            const dy = Math.sin(angle) * 22;
            const spin = ((entry.card.charCodeAt(0) + entry.seat * 7) % 13) - 6;
            const isHigh = entry.seat === highSeat;
            const brokeIt = outcome?.kind === "pickup" && outcome.brokeBySeat === entry.seat;

            return (
              <div
                key={`${entry.card}-${entry.seat}`}
                className="absolute left-1/2 top-1/2 anim-play"
                style={{
                  ["--from-x" as string]: `${dx * 3.2}px`,
                  ["--from-y" as string]: `${dy * 3.6}px`,
                  ["--land-rot" as string]: `${spin}deg`,
                  transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${spin}deg)`,
                  zIndex: i + 1,
                  animationDelay: "0ms",
                }}
              >
                <PlayingCard
                  card={entry.card}
                  muted={!!outcome && !isHigh && !brokeIt}
                  className={
                    isHigh && outcome
                      ? "ring-2 ring-brass-300 shadow-[0_0_28px_-4px_rgba(229,193,121,0.75)]"
                      : brokeIt
                      ? "ring-2 ring-chili-400/80"
                      : ""
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {state.ledSuit && state.pile.length > 0 && (
        <p className="absolute bottom-0 text-[0.7rem] text-cream-400/80">
          <span aria-hidden>{suitSymbol(state.ledSuit)}</span> {suitName(state.ledSuit)} led
        </p>
      )}
    </div>
  );
}
