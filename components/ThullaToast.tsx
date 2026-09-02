"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ThullaNotice } from "@/lib/useThulla";

const SUITS = ["♠", "♥", "♦", "♣", "♠", "♦"];

/**
 * The THULLA! pop-up. Presentation only — it renders whatever notice it is
 * handed and knows nothing about when a thulla happens; `useThulla` owns
 * the timing and the engine owns the event.
 *
 * It leaves when the gag stops playing, not on a timer of its own: the
 * notice carries the sound's length and the fade is delayed to meet it.
 *
 * A banner across the top rather than a card in the middle of the table.
 * It used to sit over the centre of the felt, which put it squarely on top
 * of the trick pile — hiding the one thing the announcement is about. Up
 * here it's just as loud and the cards stay visible underneath it.
 *
 * Pointer-transparent, so it never eats a tap on a card behind it.
 *
 * Rendered into `document.body`. A positioned, z-indexed ancestor caps its
 * descendants' z-index however high they set it, and the table sets
 * `isolation: isolate` on top of that — which is how the biggest moment in
 * the game ended up painting *behind* the header. A portal is the one
 * version of this that can't be trapped by anything a parent does.
 */
export function ThullaToast({ notice }: { notice: ThullaNotice | null }) {
  const [mounted, setMounted] = useState(false);

  // A portal needs a DOM to aim at, which the server render doesn't have.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the client mount, the only point a portal target exists
  useEffect(() => setMounted(true), []);

  if (!notice || !mounted) return null;

  return createPortal(
    <div
      // Just under the header, so the trick pile below stays in full view.
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-[95] w-[min(94vw,36rem)] -translate-x-1/2 px-1"
      aria-live="polite"
    >
      <div
        // `key` restarts the animation when a second thulla lands quickly.
        key={notice.key}
        className="anim-thulla relative flex items-center justify-center gap-3 rounded-2xl border-2 border-chili-400/70 bg-ink-900/95 px-4 py-2.5 shadow-[0_22px_50px_-16px_rgba(0,0,0,0.95)] backdrop-blur-sm sm:gap-5 sm:px-6 sm:py-3.5"
        style={{
          willChange: "transform, opacity",
          // Pop in, sit still while the gag plays, fade out as it ends.
          animationDelay: `0ms, ${Math.max(560, notice.ms - 380)}ms`,
        }}
      >
        {/* Suit glyphs bursting out from behind the card. */}
        {SUITS.map((suit, i) => {
          const angle = (i / SUITS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={i}
              aria-hidden
              className="anim-spark absolute left-1/2 top-1/2 text-xl text-brass-300 sm:text-2xl"
              style={{
                ["--spark-x" as string]: `${Math.cos(angle) * 150}px`,
                ["--spark-y" as string]: `${Math.sin(angle) * 46}px`,
                ["--spark-rot" as string]: `${(i % 2 ? 1 : -1) * 55}deg`,
                animationDelay: `${120 + i * 45}ms`,
              }}
            >
              {suit}
            </span>
          );
        })}

        <p className="font-display shrink-0 text-2xl font-bold leading-none tracking-tight text-chili-400 sm:text-4xl">
          <span aria-hidden>🃏 </span>
          THULLA!
          <span aria-hidden> 😂</span>
        </p>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold text-cream-100 sm:text-lg">
            {notice.isYou ? "You got the Thulla!" : `${notice.name} got the Thulla!`}
          </p>
          <p className="tabular text-xs text-cream-400 sm:text-sm">
            +{notice.count} card{notice.count === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
