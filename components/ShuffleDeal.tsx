"use client";

import { CardBack } from "./PlayingCard";

/**
 * The pre-game cinematic: a deck that riffles, cuts, fans, and then throws a
 * card at each seat. It is purely presentational — the hands were already
 * dealt by the engine before this ran, so nothing here can affect the game.
 */
export function ShuffleDeal({
  stage,
  playerCount,
  shufflingLabel,
  dealingLabel,
}: {
  stage: "shuffling" | "dealing";
  playerCount: number;
  shufflingLabel: string;
  dealingLabel: string;
}) {
  const RIFFLE = 9;
  const FLIGHTS = Math.min(playerCount * 2, 16);

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-10">
      <div className="relative grid place-items-center" style={{ width: "calc(var(--card-w) * 3.4)", height: "calc(var(--card-h) * 2.2)" }}>
        {stage === "shuffling" ? (
          <div className="relative anim-cut" style={{ width: "var(--card-w)", height: "var(--card-h)" }}>
            {Array.from({ length: RIFFLE }, (_, i) => {
              const side = i % 2 === 0 ? 1 : -1;
              return (
                <CardBack
                  key={i}
                  className="absolute left-0 top-0 anim-riffle"
                  style={{
                    ["--sx" as string]: `${side * (2 + (i % 4))}px`,
                    ["--srot" as string]: `${side * (5 + i)}deg`,
                    animationDelay: `${i * 55}ms`,
                    zIndex: i,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="relative" style={{ width: "var(--card-w)", height: "var(--card-h)" }}>
            <CardBack className="absolute left-0 top-0" />
            {Array.from({ length: FLIGHTS }, (_, i) => {
              // Fan each dealt card out towards a different seat position.
              const angle = (i / FLIGHTS) * Math.PI * 2;
              return (
                <CardBack
                  key={i}
                  className="absolute left-0 top-0 anim-fan"
                  style={{
                    ["--fan-x" as string]: `${Math.cos(angle) * 120}px`,
                    ["--fan-rot" as string]: `${Math.sin(angle) * 40}deg`,
                    animationDelay: `${i * 70}ms`,
                    opacity: 0.9,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <p className="text-sm font-medium tracking-wide text-brass-300">
        {stage === "shuffling" ? shufflingLabel : dealingLabel}
      </p>
    </div>
  );
}
