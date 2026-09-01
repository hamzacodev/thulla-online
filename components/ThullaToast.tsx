"use client";

import type { ThullaNotice } from "@/lib/useThulla";

const SUITS = ["♠", "♥", "♦", "♣", "♠", "♦"];

/**
 * The THULLA! pop-up. Presentation only — it renders whatever notice it is
 * handed and knows nothing about when a thulla happens; `useThulla` owns
 * the timing and the engine owns the event.
 *
 * Deliberately small and upper-centre: it never covers the hand or the
 * turn indicator, and it's pointer-transparent so it can't eat a tap on a
 * card underneath it.
 */
export function ThullaToast({ notice }: { notice: ThullaNotice | null }) {
  if (!notice) return null;

  return (
    <div
      // Sits above the pile, well clear of the hand at the bottom.
      className="pointer-events-none absolute left-1/2 top-[24%] z-40 md:top-[16%]"
      aria-live="polite"
    >
      <div
        // `key` restarts the animation when a second thulla lands quickly.
        key={notice.key}
        className="anim-thulla relative rounded-2xl border border-chili-400/60 bg-ink-900/95 px-5 py-3 text-center shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-sm"
        style={{ willChange: "transform, opacity" }}
      >
        {/* Suit glyphs bursting out from behind the card. */}
        {SUITS.map((suit, i) => {
          const angle = (i / SUITS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={i}
              aria-hidden
              className="anim-spark absolute left-1/2 top-1/2 text-sm text-brass-300"
              style={{
                ["--spark-x" as string]: `${Math.cos(angle) * 62}px`,
                ["--spark-y" as string]: `${Math.sin(angle) * 46}px`,
                ["--spark-rot" as string]: `${(i % 2 ? 1 : -1) * 55}deg`,
                animationDelay: `${120 + i * 45}ms`,
              }}
            >
              {suit}
            </span>
          );
        })}

        <p className="font-display text-2xl font-bold leading-none tracking-tight text-chili-400 sm:text-3xl">
          <span aria-hidden>🃏 </span>
          THULLA!
          <span aria-hidden> 😂</span>
        </p>
        <p className="mt-1.5 text-xs font-semibold text-cream-100">
          {notice.isYou ? "You got the Thulla!" : `${notice.name} got the Thulla!`}
        </p>
        <p className="tabular mt-0.5 text-[0.68rem] text-cream-400">
          +{notice.count} card{notice.count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
