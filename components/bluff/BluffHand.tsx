"use client";

import { PlayingCard } from "@/components/PlayingCard";
import { faceOf, type BluffCard } from "@/lib/bluff/cards";

/**
 * The player's hand: multi-select, and built for the awkward case rather
 * than the tidy one. Three decks between two people is seventy-eight cards
 * in one hand, so this scrolls horizontally with a fixed, tappable step
 * between cards instead of squeezing them until nobody can hit one.
 *
 * Selection is by card id, not by face — with three decks there are three
 * aces of spades and tapping one must not select the other two.
 */
export function BluffHand({
  hand,
  selected,
  enabled,
  onToggle,
}: {
  hand: BluffCard[];
  selected: string[];
  enabled: boolean;
  onToggle: (id: string) => void;
}) {
  const chosen = new Set(selected);

  return (
    <div
      className="no-scrollbar w-full overflow-x-auto overflow-y-hidden px-3 pb-3 pt-7"
      role="group"
      aria-label="Your hand"
      aria-disabled={!enabled}
    >
      <div className="mx-auto flex w-max items-end">
        {hand.map((card, i) => {
          const isSelected = chosen.has(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onToggle(card.id)}
              disabled={!enabled}
              aria-pressed={isSelected}
              aria-label={`${faceOf(card)}${isSelected ? " — selected" : ""}`}
              className="relative shrink-0 touch-manipulation select-none outline-offset-4 disabled:cursor-not-allowed"
              style={{
                // A fixed overlap keeps every card's exposed strip the same
                // width, so the target size doesn't depend on hand size.
                marginLeft: i === 0 ? 0 : "calc(var(--card-w) * -0.52)",
                zIndex: isSelected ? 100 + i : i,
              }}
            >
              <span
                className="block transition-transform duration-200 ease-[var(--ease-card)]"
                style={{ transform: isSelected ? "translateY(-1.1rem)" : "translateY(0)" }}
              >
                <PlayingCard
                  card={faceOf(card)}
                  muted={!enabled && !isSelected}
                  className={
                    isSelected
                      ? "ring-2 ring-brass-300 shadow-[0_16px_28px_-12px_rgba(0,0,0,0.9)]"
                      : ""
                  }
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
