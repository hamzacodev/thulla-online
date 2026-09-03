"use client";

import { useCallback, useRef, useState } from "react";
import { NumberedCard } from "./TrumpPattaPieces";
import { cardLabel, type Card } from "@/lib/engine/cards";

/**
 * Your own hand, in whatever order you put it in.
 *
 * Arranging it matters here in a way it doesn't in the other games: the next
 * player sees this exact order, so where you put the card you'd rather keep
 * is a real decision. Nothing in the app ever re-sorts it — not the deal,
 * not receiving a card, not a pair leaving, not a refresh.
 *
 * Two ways to move a card, because one of them always suits the device:
 *
 * **Drag** it. Pointer events, so a mouse and a thumb take the same path,
 * and the hand reorders live underneath as you pass over each slot.
 *
 * **Tap** it, then tap where it should go. Which is the one that works when
 * dragging on a phone fights with the page scrolling, and the one that can
 * be done accurately with a thumb on a small screen.
 */
export function OwnHand({
  hand,
  onReorder,
  disabled,
}: {
  hand: Card[];
  onReorder: (order: Card[]) => void;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<Card | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ card: Card; x: number; y: number; moved: boolean } | null>(null);

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= hand.length || to >= hand.length) return;
      const next = [...hand];
      const [card] = next.splice(from, 1);
      next.splice(to, 0, card);
      onReorder(next);
    },
    [hand, onReorder]
  );

  /** The slot under the pointer, from the DOM rather than arithmetic. */
  const slotAt = (clientX: number, clientY: number): number => {
    const el = document.elementFromPoint(clientX, clientY);
    const slot = el?.closest("[data-slot]");
    const index = slot?.getAttribute("data-slot");
    return index === null || index === undefined ? -1 : Number(index);
  };

  function onPointerDown(e: React.PointerEvent, card: Card) {
    if (disabled) return;
    gesture.current = { card, x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || disabled) return;

    if (!g.moved) {
      const far = Math.abs(e.clientX - g.x) > 8 || Math.abs(e.clientY - g.y) > 8;
      if (!far) return;
      g.moved = true;
      setDragging(g.card);
      setPicked(null);
      // Keep the gesture even if the pointer leaves the card it started on.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }

    const over = slotAt(e.clientX, e.clientY);
    const from = hand.indexOf(g.card);
    if (over >= 0 && from >= 0 && over !== from) move(from, over);
  }

  function onPointerUp(e: React.PointerEvent, card: Card) {
    const g = gesture.current;
    gesture.current = null;
    setDragging(null);
    if (disabled) return;

    // A drag has already done its work on the way.
    if (g?.moved) return;

    // A tap: pick this card up, or drop the one already held onto this slot.
    if (picked === null) {
      setPicked(card);
      return;
    }
    if (picked === card) {
      setPicked(null);
      return;
    }
    move(hand.indexOf(picked), hand.indexOf(card));
    setPicked(null);
    void e;
  }

  if (!hand.length) {
    return (
      <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-4 text-center text-sm font-semibold text-emerald-200">
        You&apos;re out — no cards left. Safe! 🎉
      </p>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-cream-400">
          Your hand
        </p>
        <p className="text-[0.7rem] text-cream-500">
          {picked
            ? `Tap where ${cardLabel(picked)} should go`
            : disabled
              ? `${hand.length} card${hand.length === 1 ? "" : "s"}`
              : "Drag, or tap two cards, to rearrange"}
        </p>
      </div>

      <div
        ref={containerRef}
        className="flex flex-wrap justify-center gap-1.5 rounded-2xl border border-white/10 bg-ink-900/40 p-2 sm:gap-2"
        style={{
          // Both together: `--card-h` is derived from `--card-w` at the root,
          // so it resolves there and a width-only override would leave the
          // height behind — a narrow card at full height.
          ["--card-w" as string]: "clamp(2.3rem, 7vw, 3.1rem)",
          ["--card-h" as string]: "calc(var(--card-w) * 1.42)",
        }}
        onPointerMove={onPointerMove}
        // `touch-action: none` on the cards, so a drag doesn't scroll the page.
      >
        {hand.map((card, i) => {
          const isPicked = picked === card;
          const isDragging = dragging === card;
          return (
            <button
              key={card}
              type="button"
              data-slot={i}
              disabled={disabled}
              onPointerDown={(e) => onPointerDown(e, card)}
              onPointerUp={(e) => onPointerUp(e, card)}
              onPointerCancel={() => {
                gesture.current = null;
                setDragging(null);
              }}
              className={`touch-none rounded-xl transition-transform duration-150 ${
                disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
              } ${isPicked || isDragging ? "-translate-y-2 scale-105" : ""}`}
              aria-label={`${cardLabel(card)}, position ${i + 1} of ${hand.length}${
                isPicked ? " — held, tap another card to place it" : ""
              }`}
              aria-pressed={isPicked}
            >
              <NumberedCard
                card={card}
                position={i + 1}
                state={isPicked || isDragging ? "lifted" : "idle"}
                className={
                  isPicked || isDragging
                    ? "drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
                    : undefined
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
