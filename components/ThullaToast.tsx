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
 * Upper-centre and pointer-transparent, so it never eats a tap on a card
 * underneath it.
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
      // Sits above the pile, well clear of the hand at the bottom.
      className="pointer-events-none fixed left-1/2 top-[22%] z-[95] md:top-[18%]"
      aria-live="polite"
    >
      <div
        // `key` restarts the animation when a second thulla lands quickly.
        key={notice.key}
        className="anim-thulla relative max-w-[92vw] min-w-[15rem] rounded-3xl border-2 border-chili-400/70 bg-ink-900/97 px-8 py-6 text-center shadow-[0_26px_60px_-14px_rgba(0,0,0,0.95)] backdrop-blur-sm sm:min-w-[19rem] sm:px-12 sm:py-8"
        style={{ willChange: "transform, opacity" }}
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
                ["--spark-x" as string]: `${Math.cos(angle) * 108}px`,
                ["--spark-y" as string]: `${Math.sin(angle) * 82}px`,
                ["--spark-rot" as string]: `${(i % 2 ? 1 : -1) * 55}deg`,
                animationDelay: `${120 + i * 45}ms`,
              }}
            >
              {suit}
            </span>
          );
        })}

        <p className="font-display text-4xl font-bold leading-none tracking-tight text-chili-400 sm:text-6xl">
          <span aria-hidden>🃏 </span>
          THULLA!
          <span aria-hidden> 😂</span>
        </p>
        <p className="mt-3 text-base font-semibold text-cream-100 sm:text-xl">
          {notice.isYou ? "You got the Thulla!" : `${notice.name} got the Thulla!`}
        </p>
        <p className="tabular mt-1 text-sm text-cream-400 sm:text-base">
          +{notice.count} card{notice.count === 1 ? "" : "s"}
        </p>
      </div>
    </div>,
    document.body
  );
}
