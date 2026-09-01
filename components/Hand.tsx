"use client";

import { useState } from "react";
import { PlayingCard } from "./PlayingCard";
import type { Card } from "@/lib/engine/cards";
import { cardLabel } from "@/lib/engine/cards";

interface HandProps {
  hand: Card[];
  legal: Card[];
  enabled: boolean;
  shakeCard: Card | null;
  onPlay: (card: Card) => void;
  playLabel: string;
}

/**
 * The human's hand. Two-step by design: the first tap raises a card, the
 * second plays it. On a phone that removes the whole class of mis-taps that
 * a single-tap hand suffers from, and it gives us somewhere to put the
 * explicit Play button for anyone who'd rather have one.
 */
export function Hand({ hand, legal, enabled, shakeCard, onPlay, playLabel }: HandProps) {
  const [picked, setPicked] = useState<Card | null>(null);

  // Derived, not synced: a card that has left the hand — or a hand that
  // isn't playable right now — simply isn't selected any more. Deriving
  // avoids a render pass that briefly shows a stale selection.
  const selected = picked && enabled && hand.includes(picked) ? picked : null;

  const count = hand.length;
  // Squeeze the fan as the hand grows so a 20-card hand still fits a phone.
  const overlap = count <= 6 ? 0.32 : count <= 10 ? 0.48 : count <= 15 ? 0.6 : 0.68;

  function handleTap(card: Card) {
    if (!enabled) {
      onPlay(card); // let the parent explain why it's not playable
      return;
    }
    if (selected === card) {
      onPlay(card);
      setPicked(null);
    } else {
      setPicked(card);
    }
  }

  return (
    <div className="w-full">
      <div
        className="flex items-end justify-center px-2 pb-3 pt-8 min-h-[calc(var(--card-h)+3rem)]"
        role="group"
        aria-label="Your hand"
        aria-disabled={!enabled}
      >
        {hand.map((card, i) => {
          const isLegal = legal.includes(card);
          const isSelected = selected === card;
          const mid = (count - 1) / 2;
          const rot = count > 1 ? (i - mid) * Math.min(2.6, 18 / count) : 0;
          const arc = count > 1 ? Math.min(10, Math.abs(i - mid) ** 2 * 0.22) : 0;

          return (
            <button
              key={card}
              type="button"
              onClick={() => handleTap(card)}
              aria-label={`${cardLabel(card)}${isLegal ? "" : " — not playable now"}${isSelected ? " — selected, tap again to play" : ""}`}
              aria-pressed={isSelected}
              className={`relative outline-offset-4 transition-transform duration-200 ease-[var(--ease-card)] ${
                shakeCard === card ? "anim-shake" : ""
              }`}
              style={{
                marginLeft: i === 0 ? 0 : `calc(var(--card-w) * -${overlap})`,
                zIndex: isSelected ? 100 : i,
                // `--seat-rot` keeps the shake keyframes in the card's own frame.
                ["--seat-rot" as string]: `${rot}deg`,
                transform: `translateY(${isSelected ? "-1.4rem" : `${arc}px`}) rotate(${rot}deg) scale(${isSelected ? 1.06 : 1})`,
              }}
            >
              <PlayingCard
                card={card}
                muted={enabled && !isLegal}
                className={
                  isSelected
                    ? "ring-2 ring-brass-300 shadow-[0_18px_30px_-12px_rgba(0,0,0,0.9)]"
                    : ""
                }
              />
            </button>
          );
        })}
      </div>

      <div className="h-11 flex items-center justify-center">
        {selected && enabled && (
          <button
            type="button"
            className="btn btn-primary anim-rise"
            onClick={() => {
              onPlay(selected);
              setPicked(null);
            }}
          >
            {playLabel} {cardLabel(selected)}
          </button>
        )}
      </div>
    </div>
  );
}
