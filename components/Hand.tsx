"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayingCard } from "./PlayingCard";
import type { Card } from "@/lib/engine/cards";
import { cardLabel } from "@/lib/engine/cards";

/**
 * The narrowest strip of a card we're willing to leave tappable. Overlapping
 * a fan hides all but this sliver of every card except the last, so this —
 * not the card width — is the real touch target, and a 13-card hand on a
 * small phone will wrap onto a second row rather than shrink below it.
 */
const MIN_ADVANCE = 38;

interface HandProps {
  hand: Card[];
  legal: Card[];
  enabled: boolean;
  shakeCard: Card | null;
  onPlay: (card: Card) => void;
}

/**
 * The human's hand. Two-step by design: the first tap raises a card, the
 * second plays it. On a phone that removes a whole class of mis-taps; on a
 * desktop the same two clicks are just a double-click, which is what people
 * try first anyway.
 *
 * The raise is applied to the card *inside* the button, never to the button
 * itself. That keeps the hit target exactly where it was when the first
 * click landed — otherwise selecting a card slides it 1.4rem up and out from
 * under the cursor, and the second click of a double-click lands on the
 * table instead of on the card, which is why double-clicking used to do
 * nothing.
 */
export function Hand({ hand, legal, enabled, shakeCard, onPlay }: HandProps) {
  const [picked, setPicked] = useState<Card | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cardW, setCardW] = useState(0);

  // Derived, not synced: a card that has left the hand — or a hand that
  // isn't playable right now — simply isn't selected any more.
  const selected = picked && enabled && hand.includes(picked) ? picked : null;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const probe = el.querySelector("[data-card]") as HTMLElement | null;
    if (probe) setCardW(probe.offsetWidth);
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, hand.length]);

  const count = hand.length;
  const usable = Math.max(0, width - 16);

  // How many cards fit in one row while every one keeps a real target: the
  // last card shows in full, the rest show MIN_ADVANCE each.
  const perRow =
    cardW > 0 && usable > cardW
      ? Math.max(2, Math.floor((usable - cardW) / MIN_ADVANCE) + 1)
      : count;
  const rowCount = Math.max(1, Math.ceil(count / Math.max(1, perRow)));
  const rows: Card[][] = [];
  const size = Math.ceil(count / rowCount);
  for (let i = 0; i < count; i += size) rows.push(hand.slice(i, i + size));

  // Spread each row across the space it has, never tighter than MIN_ADVANCE.
  const advance =
    cardW > 0 && rows.length > 0
      ? Math.min(cardW, Math.max(MIN_ADVANCE, (usable - cardW) / Math.max(1, size - 1)))
      : cardW;

  function handleTap(card: Card) {
    if (!enabled) {
      onPlay(card); // let the parent explain why it isn't playable
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
        ref={containerRef}
        className="flex flex-col items-center gap-1 px-2 pb-4 pt-6"
        role="group"
        aria-label="Your hand"
        aria-disabled={!enabled}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-end justify-center">
            {row.map((card, i) => {
              const isLegal = legal.includes(card);
              const isSelected = selected === card;
              const mid = (row.length - 1) / 2;
              const rot = row.length > 1 ? (i - mid) * Math.min(2.4, 16 / row.length) : 0;
              const arc = row.length > 1 ? Math.min(4, Math.abs(i - mid) ** 2 * 0.18) : 0;

              return (
                <button
                  key={card}
                  data-card
                  type="button"
                  onClick={() => handleTap(card)}
                  aria-label={`${cardLabel(card)}${isLegal ? "" : " — not playable now"}${
                    isSelected ? " — selected, click again to play" : ""
                  }`}
                  aria-pressed={isSelected}
                  className="relative select-none outline-offset-4"
                  style={{
                    // Each card advances by a fixed, tappable amount and the
                    // rest of it tucks under its neighbour.
                    marginLeft: i === 0 || !cardW ? 0 : `${advance - cardW}px`,
                    zIndex: isSelected ? 100 : i,
                  }}
                >
                  <span
                    className={`block transition-transform duration-200 ease-[var(--ease-card)] ${
                      shakeCard === card ? "anim-shake" : ""
                    }`}
                    style={{
                      ["--seat-rot" as string]: `${rot}deg`,
                      transform: `translateY(${isSelected ? "-1.4rem" : `${arc}px`}) rotate(${rot}deg) scale(${
                        isSelected ? 1.06 : 1
                      })`,
                    }}
                  >
                    <PlayingCard
                      card={card}
                      muted={enabled && !isLegal}
                      className={
                        isSelected ? "ring-2 ring-brass-300 shadow-[0_18px_30px_-12px_rgba(0,0,0,0.9)]" : ""
                      }
                    />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* A hint rather than a button: the second click on the raised card is
          the confirmation, on a phone and on a desktop alike. The row
          collapses on small screens rather than leaving an empty strip
          above the safe area. */}
      <div className="flex h-0 items-center justify-center md:h-9">
        {enabled && (
          <p className="hidden text-[0.72rem] text-cream-400/80 md:block" aria-hidden>
            {selected
              ? `Click ${cardLabel(selected)} again to play it`
              : "Double-click a card to play it"}
          </p>
        )}
      </div>
    </div>
  );
}
