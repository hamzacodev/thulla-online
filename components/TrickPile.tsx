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
      <div className="pile-area">
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
              className="pile-card anim-play"
              style={{
                ["--px" as string]: `${Math.cos(angle) * 26}px`,
                ["--py" as string]: `${Math.sin(angle) * 22}px`,
                ["--rot" as string]: `${spin}deg`,
                ["--from-x" as string]: `${Math.cos(angle) * 83}px`,
                ["--from-y" as string]: `${Math.sin(angle) * 79}px`,
                ["--land-rot" as string]: `${spin}deg`,
                ["--pop" as string]: isHigh && outcome ? "1.1" : "1",
                zIndex: isHigh && outcome ? 50 : i + 1,
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
                    ? "ring-2 ring-chili-400/60"
                    : ""
                }
              />
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
