"use client";

import { RANKS, rankLabel, claimLabel, countOfRank, type BluffCard, type Rank } from "@/lib/bluff/cards";

/**
 * Choose the rank, then commit. Deliberately says out loud that the claim
 * doesn't have to be true — a player who doesn't realise they're allowed to
 * lie isn't playing Bluff, and nothing else on screen tells them.
 *
 * When the round is locked to a rank the picker collapses to a statement of
 * what they have to claim, because there's no choice left to offer.
 */
export function ClaimBar({
  selected,
  hand,
  lockedRank,
  claimRank,
  onPickRank,
  onPlay,
  onClear,
  busy,
}: {
  selected: string[];
  hand: BluffCard[];
  lockedRank: Rank | null;
  claimRank: Rank | null;
  onPickRank: (rank: Rank) => void;
  onPlay: () => void;
  onClear: () => void;
  busy?: boolean;
}) {
  const count = selected.length;
  const rank = lockedRank ?? claimRank;
  const ready = count > 0 && !!rank && !busy;

  // Whether what they're about to say is actually true — shown only to them,
  // as a nudge that the game knows and the table doesn't.
  const chosen = hand.filter((c) => selected.includes(c.id));
  const truthful = !!rank && chosen.length > 0 && chosen.every((c) => c.rank === rank);

  return (
    <div className="shrink-0 border-t border-white/10 bg-ink-950/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between gap-2">
          <p className="tabular text-xs text-cream-400">
            {count === 0 ? "Pick your cards" : `${count} card${count === 1 ? "" : "s"} selected`}
          </p>
          {count > 0 && (
            <button onClick={onClear} className="btn btn-ghost !min-h-8 !px-2 !text-xs">
              Clear
            </button>
          )}
        </div>

        {lockedRank ? (
          <p className="mt-2 rounded-xl border border-brass-400/25 bg-brass-400/[0.08] px-3 py-2 text-center text-sm text-cream-100">
            This round is on{" "}
            <span className="font-display font-bold text-brass-200">{rankLabel(lockedRank)}s</span> — say
            that, whatever you actually play.
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs text-cream-400">
              What do you claim? <span className="text-cream-400/70">(it doesn&apos;t have to be true 😈)</span>
            </p>
            <div className="mt-1.5 grid grid-cols-7 gap-1">
              {RANKS.map((r) => {
                const have = countOfRank(hand, r);
                const active = claimRank === r;
                return (
                  <button
                    key={r}
                    onClick={() => onPickRank(r)}
                    aria-pressed={active}
                    className={`tabular btn relative !min-h-9 !px-0 !text-sm ${
                      active ? "btn-primary" : "btn-secondary"
                    }`}
                  >
                    {rankLabel(r)}
                    {have > 0 && (
                      <span
                        className={`absolute right-0.5 top-0.5 text-[0.55rem] ${
                          active ? "text-ink-950/70" : "text-cream-400/70"
                        }`}
                        title={`You hold ${have}`}
                      >
                        {have}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={onPlay}
          disabled={!ready}
          className="btn btn-primary mt-2 !min-h-12 w-full text-base"
        >
          {count === 0
            ? "Select cards to play"
            : !rank
            ? "Pick a rank to claim"
            : `Play & claim ${claimLabel(rank, count)}`}
        </button>

        {ready && (
          <p className="mt-1.5 text-center text-[0.7rem] text-cream-400/80">
            {truthful ? "😇 That one's actually true." : "😈 Bluff — hope nobody calls it."}
          </p>
        )}
      </div>
    </div>
  );
}

/** BLUFF! or let it go. Two big, well-separated targets. */
export function ChallengeBar({
  name,
  rank,
  count,
  onCall,
  onPass,
}: {
  name: string;
  rank: Rank;
  count: number;
  onCall: () => void;
  onPass: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-white/10 bg-ink-950/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      <div className="mx-auto w-full max-w-md">
        <p className="text-center text-sm text-cream-100">
          <span className="font-semibold">{name}</span> claims{" "}
          <span className="font-display font-bold text-brass-200">{claimLabel(rank, count)}</span>
        </p>
        <p className="mt-0.5 text-center text-xs text-cream-400">
          Only you can call this one. Pass and it&apos;s your turn.
        </p>

        {/* Gap, deliberately: these two do opposite things. */}
        <div className="mt-2.5 flex gap-3">
          <button
            onClick={onPass}
            className="btn btn-secondary !min-h-13 flex-1 text-base"
          >
            PASS
          </button>
          <button
            onClick={onCall}
            className="btn !min-h-13 flex-1 !border-chili-400/50 !bg-chili-500/90 text-base !text-white"
          >
            😈 BLUFF!
          </button>
        </div>
      </div>
    </div>
  );
}
