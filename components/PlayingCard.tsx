"use client";

import { CSSProperties } from "react";
import { Card, isRedSuit, rankLabel, suitOf, suitSymbol } from "@/lib/engine/cards";

/** Pip layouts for number cards, as fractions of the card's inner area. */
const PIPS: Record<number, Array<[number, number]>> = {
  2: [[0.5, 0.18], [0.5, 0.82]],
  3: [[0.5, 0.18], [0.5, 0.5], [0.5, 0.82]],
  4: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.8], [0.72, 0.8]],
  5: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.5], [0.28, 0.8], [0.72, 0.8]],
  6: [[0.28, 0.18], [0.72, 0.18], [0.28, 0.5], [0.72, 0.5], [0.28, 0.82], [0.72, 0.82]],
  7: [[0.28, 0.18], [0.72, 0.18], [0.5, 0.34], [0.28, 0.5], [0.72, 0.5], [0.28, 0.82], [0.72, 0.82]],
  8: [[0.28, 0.18], [0.72, 0.18], [0.5, 0.34], [0.28, 0.5], [0.72, 0.5], [0.5, 0.66], [0.28, 0.82], [0.72, 0.82]],
  9: [[0.28, 0.16], [0.72, 0.16], [0.28, 0.38], [0.72, 0.38], [0.5, 0.5], [0.28, 0.62], [0.72, 0.62], [0.28, 0.84], [0.72, 0.84]],
  10: [[0.28, 0.16], [0.72, 0.16], [0.5, 0.28], [0.28, 0.38], [0.72, 0.38], [0.28, 0.62], [0.72, 0.62], [0.5, 0.72], [0.28, 0.84], [0.72, 0.84]],
};

const COURT: Record<string, string> = { J: "♞", Q: "♛", K: "♚", A: "" };

export interface PlayingCardProps {
  card: Card;
  className?: string;
  style?: CSSProperties;
  /** Dim + desaturate, for cards that aren't legal right now. */
  muted?: boolean;
  title?: string;
}

export function PlayingCard({ card, className = "", style, muted, title }: PlayingCardProps) {
  const suit = suitOf(card);
  const rank = rankLabel(card);
  const red = isRedSuit(suit);
  const sym = suitSymbol(suit);
  const pipCount = Number(rank);
  const pips = PIPS[pipCount];
  const ink = red ? "#c0362c" : "#15201c";

  return (
    <div
      className={`card-shell card-face ${className}`}
      style={{ color: ink, opacity: muted ? 0.42 : 1, filter: muted ? "saturate(0.5)" : undefined, ...style }}
      title={title}
    >
      {/* Corner index, mirrored bottom-right the way a real card reads. */}
      <span className="absolute left-[6%] top-[3%] leading-none font-bold flex flex-col items-center"
            style={{ fontSize: "calc(var(--card-w) * 0.26)" }}>
        {rank}
        <span style={{ fontSize: "calc(var(--card-w) * 0.22)", marginTop: "-0.1em" }}>{sym}</span>
      </span>
      <span className="absolute right-[6%] bottom-[3%] leading-none font-bold flex flex-col items-center rotate-180"
            style={{ fontSize: "calc(var(--card-w) * 0.26)" }}>
        {rank}
        <span style={{ fontSize: "calc(var(--card-w) * 0.22)", marginTop: "-0.1em" }}>{sym}</span>
      </span>

      {/* Centre: pip grid for numbers, a single large glyph for court cards. */}
      <span className="absolute inset-[22%_24%]" aria-hidden>
        {pips
          ? pips.map(([x, y], i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 leading-none"
                style={{ left: `${x * 100}%`, top: `${y * 100}%`, fontSize: "calc(var(--card-w) * 0.2)" }}
              >
                {sym}
              </span>
            ))
          : (
            <span
              className="absolute inset-0 grid place-items-center leading-none"
              style={{ fontSize: "calc(var(--card-w) * 0.46)" }}
            >
              {COURT[rank] || sym}
            </span>
          )}
      </span>

      <span className="sr-only">
        {rank} of {suit === "S" ? "Spades" : suit === "H" ? "Hearts" : suit === "D" ? "Diamonds" : "Clubs"}
      </span>
    </div>
  );
}

/**
 * Card back. The lattice and centre medallion come from CSS gradients plus
 * one inline SVG rosette, so there's no image to load.
 */
export function CardBack({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`card-shell card-back ${className}`} style={style} aria-hidden>
      <svg viewBox="0 0 40 56" className="absolute inset-0 h-full w-full opacity-70">
        <g fill="none" stroke="#f0d9a3" strokeWidth="0.7" strokeLinecap="round">
          <circle cx="20" cy="28" r="7.5" opacity="0.75" />
          <circle cx="20" cy="28" r="4" opacity="0.55" />
          {/* Eight-point star — a common motif on desi tilework. */}
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={20 + Math.cos(a) * 4}
                y1={28 + Math.sin(a) * 4}
                x2={20 + Math.cos(a) * 10.5}
                y2={28 + Math.sin(a) * 10.5}
                opacity="0.6"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** A squat stack of backs, used for the deck and for opponents' hands. */
export function CardStack({ count, className = "" }: { count: number; className?: string }) {
  const shown = Math.min(count, 4);
  return (
    <div className={`relative ${className}`} style={{ width: "var(--card-w)", height: "var(--card-h)" }}>
      {Array.from({ length: shown }, (_, i) => (
        <CardBack
          key={i}
          className="absolute left-0 top-0"
          style={{ transform: `translate(${i * 1.6}px, ${-i * 1.6}px)`, zIndex: i }}
        />
      ))}
    </div>
  );
}
