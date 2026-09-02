"use client";

import { CardBack } from "@/components/PlayingCard";
import { cardsForDecks } from "@/lib/bluff/cards";

/**
 * The decks arriving, combining and being dealt.
 *
 * It shows the actual number of decks in play, because "how many decks is
 * this?" is the one thing about a Bluff table that changes between games and
 * that everybody needs to know before the first card lands.
 */
export function ShuffleDecks({ deckCount, stage }: { deckCount: number; stage: "shuffling" | "dealing" }) {
  const decks = Array.from({ length: deckCount }, (_, i) => i);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="relative" style={{ width: "calc(var(--card-w) * 3.4)", height: "calc(var(--card-h) * 1.3)" }}>
        {decks.map((i) => {
          // Shuffling: the decks slide together into one stack.
          const spread = deckCount === 1 ? 0 : (i - (deckCount - 1) / 2) * 1;
          return (
            <span
              key={i}
              className={`absolute left-1/2 top-1/2 ${stage === "shuffling" ? "anim-riffle" : ""}`}
              style={{
                transform: `translate(-50%, -50%) translateX(${
                  stage === "shuffling" ? spread * 62 : spread * 5
                }px) rotate(${stage === "shuffling" ? spread * 7 : 0}deg)`,
                transition: "transform 620ms var(--ease-card)",
                animationDelay: `${i * 130}ms`,
                zIndex: i,
              }}
            >
              <CardBack />
            </span>
          );
        })}
      </div>

      <div>
        <p className="font-display text-2xl font-bold text-cream-50">
          {stage === "shuffling" ? "Patte mil rahe hain…" : "Baant raha hoon…"}
        </p>
        <p className="tabular mt-1 text-sm text-brass-300">
          {"🃏".repeat(deckCount)} {deckCount} deck{deckCount > 1 ? "s" : ""} ·{" "}
          {cardsForDecks(deckCount)} cards
        </p>
      </div>
    </div>
  );
}
