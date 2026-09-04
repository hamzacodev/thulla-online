"use client";

/**
 * Four little bars, moving while somebody is talking.
 *
 * The seat pods already say who is on the call; this says who is talking
 * *right now*, which is the thing you actually want when three people are
 * on a voice call and one of them is telling you to hurry up.
 *
 * The bars carry a title as well, because motion alone is invisible to
 * anyone who has turned it off — and under reduced motion the bars simply
 * stop, which still reads correctly: bars present at all means talking.
 */
export function SpeakingWaves({
  name,
  className = "",
}: {
  /** Whose voice it is, for the tooltip and screen readers. */
  name?: string;
  className?: string;
}) {
  const label = name ? `${name} is speaking` : "Speaking";

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`flex h-4 shrink-0 items-center gap-[3px] ${className}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className="voice-bar block w-[2.5px] rounded-full bg-mint-300 shadow-[0_0_6px_rgba(111,216,172,0.9)]"
          // Varied resting heights, so it isn't four identical sticks.
          style={{ height: [9, 16, 12, 7][i] }}
        />
      ))}
    </span>
  );
}
