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

/** How far up a card has to be dragged before letting go plays it. */
const SWIPE_TO_PLAY = 48;
/** The card stops following past this, so it can't be flung off the table. */
const SWIPE_MAX = 110;

interface HandProps {
  hand: Card[];
  legal: Card[];
  enabled: boolean;
  shakeCard: Card | null;
  onPlay: (card: Card) => void;
}

/**
 * The human's hand, with a different gesture for each kind of pointer.
 *
 * **Touch:** drag a card up and let go. The card tracks your thumb the whole
 * way, so the gesture explains itself, and it snaps back if you don't go far
 * enough. A plain tap deliberately does nothing — a hand is a row of
 * overlapping targets an inch wide, and cards used to leap upward under a
 * thumb that only brushed them.
 *
 * **Mouse:** click to raise, click again to play — which is a double-click,
 * the thing people try first. The raise is applied to the card *inside* the
 * button, never to the button itself, so the hit target stays exactly where
 * the first click found it. Move it and the second click of a double-click
 * lands on the table instead of the card.
 */
export function Hand({ hand, legal, enabled, shakeCard, onPlay }: HandProps) {
  const [picked, setPicked] = useState<Card | null>(null);
  const [drag, setDrag] = useState<{ card: Card; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cardW, setCardW] = useState(0);
  const dragRef = useRef<{ card: Card; startY: number } | null>(null);
  /**
   * A click fires for touch too, and whether it arrives as a PointerEvent
   * varies by browser — so the pointer type is remembered on the way down
   * rather than sniffed on the way up.
   */
  const pointerKind = useRef<string>("mouse");

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
    // Touch plays by dragging; a tap there is intentionally inert.
    if (pointerKind.current !== "mouse") return;
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

  function startDrag(card: Card, e: React.PointerEvent<HTMLButtonElement>) {
    pointerKind.current = e.pointerType;
    if (e.pointerType === "mouse") return;
    dragRef.current = { card, startY: e.clientY };
    // Capture, so the card keeps following even once the thumb has left it.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(card: Card, e: React.PointerEvent) {
    const from = dragRef.current;
    if (!from || from.card !== card) return;
    // Upward only: dragging back down is how you change your mind. Rounded,
    // and skipped when nothing moved, so a jittery finger doesn't re-render
    // the whole hand for a fraction of a pixel.
    const dy = Math.round(Math.max(-SWIPE_MAX, Math.min(0, e.clientY - from.startY)));
    setDrag((prev) => (prev?.card === card && prev.dy === dy ? prev : { card, dy }));
  }

  function endDrag(card: Card, e: React.PointerEvent) {
    const from = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!from || from.card !== card) return;
    // Far enough is a play — even when it isn't our turn, so the parent gets
    // to say why not instead of the gesture silently doing nothing.
    if (e.clientY - from.startY <= -SWIPE_TO_PLAY) onPlay(card);
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
              const dragged = drag?.card === card ? drag.dy : 0;
              // Far enough that letting go will play it — worth saying so
              // before the thumb lifts.
              const armed = dragged <= -SWIPE_TO_PLAY;
              const mid = (row.length - 1) / 2;
              const rot = row.length > 1 ? (i - mid) * Math.min(2.4, 16 / row.length) : 0;
              const arc = row.length > 1 ? Math.min(4, Math.abs(i - mid) ** 2 * 0.18) : 0;

              return (
                <button
                  key={card}
                  data-card
                  type="button"
                  onClick={() => handleTap(card)}
                  onPointerDown={(e) => startDrag(card, e)}
                  onPointerMove={(e) => moveDrag(card, e)}
                  onPointerUp={(e) => endDrag(card, e)}
                  onPointerCancel={() => {
                    dragRef.current = null;
                    setDrag(null);
                  }}
                  aria-label={`${cardLabel(card)}${isLegal ? "" : " — not playable now"}${
                    isSelected ? " — selected, click again to play" : ""
                  }`}
                  aria-pressed={isSelected}
                  // touch-none: the browser must not treat a card drag as a
                  // scroll, or the gesture is stolen halfway through.
                  className="relative touch-none select-none outline-offset-4"
                  style={{
                    // Each card advances by a fixed, tappable amount and the
                    // rest of it tucks under its neighbour.
                    marginLeft: i === 0 || !cardW ? 0 : `${advance - cardW}px`,
                    zIndex: isSelected || dragged ? 100 : i,
                  }}
                >
                  <span
                    className={`block ${
                      // No transition while a thumb is on it, so the card
                      // tracks the finger exactly rather than lagging behind.
                      dragged ? "" : "transition-transform duration-200 ease-[var(--ease-card)]"
                    } ${shakeCard === card ? "anim-shake" : ""}`}
                    style={{
                      ["--seat-rot" as string]: `${rot}deg`,
                      transform: `translateY(${
                        isSelected ? "-1.4rem" : `${arc + dragged}px`
                      }) rotate(${rot}deg) scale(${isSelected || armed ? 1.06 : 1})`,
                    }}
                  >
                    <PlayingCard
                      card={card}
                      muted={enabled && !isLegal}
                      className={
                        armed
                          ? "ring-2 ring-mint-300 shadow-[0_18px_34px_-12px_rgba(53,189,136,0.75)]"
                          : isSelected
                          ? "ring-2 ring-brass-300 shadow-[0_18px_30px_-12px_rgba(0,0,0,0.9)]"
                          : ""
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
      <div className="flex h-6 items-center justify-center md:h-9">
        {enabled && (
          <p className="text-[0.72rem] text-cream-400/80" aria-hidden>
            <span className="md:hidden">
              {drag ? "Let go to play it" : "Swipe a card up to play it"}
            </span>
            <span className="hidden md:inline">
              {selected
                ? `Click ${cardLabel(selected)} again to play it`
                : "Double-click a card to play it"}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
