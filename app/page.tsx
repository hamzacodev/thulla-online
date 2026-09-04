"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlatformNav } from "@/components/PlatformNav";
import { GameRow } from "@/components/GameRow";
import { CardBack, PlayingCard } from "@/components/PlayingCard";
import { useAuth } from "@/lib/useAuth";
import { authedFetch } from "@/lib/apiClient";
import { GAMES } from "@/lib/games";
import { ROOM_CODE_LENGTH, normalizeRoomCode } from "@/lib/roomCode";

/**
 * The platform's front page.
 *
 * It used to be Thulla's front page — the brand, the hook and the play
 * buttons were all Thulla's. The job of this page now is to make somebody
 * want to choose a game; the games introduce themselves on their own hubs.
 *
 * No game is featured. Every one gets the same row, so what stands out is
 * whether you can play it, not where it happens to sit in the list — the
 * day Bluff ships it needs no change here at all.
 *
 * Still playable without an account: single-player runs entirely in the
 * browser, so signing in is only asked for where it actually buys something.
 */
export default function Home() {
  const router = useRouter();
  const { userId, username, accessToken } = useAuth();

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  /** Straight into a friend's table, without going via the game's setup. */
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeRoomCode(joinCode);
    if (!code) return setJoinError("Enter the code your friend shared.");
    if (!userId) return router.push("/login");
    if (!username) return router.push("/username");

    setJoining(true);
    setJoinError("");
    const data = await authedFetch("/api/join-room", accessToken, { code });
    setJoining(false);
    if (data.error) return setJoinError(data.error);
    router.push(`/room/${data.code}`);
  }

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        {/* ---------- Hero ---------- */}
        <section className="flex flex-col items-center py-10 text-center sm:py-14">
          <div
            className="anim-rise relative mb-6"
            style={{ width: "calc(var(--card-w) * 3.1)", height: "calc(var(--card-h) * 1.2)" }}
            aria-hidden
          >
            <CardBack
              className="absolute bottom-0 left-0"
              style={{ transform: "rotate(-17deg)", transformOrigin: "bottom right" }}
            />
            <CardBack
              className="absolute bottom-0 right-0"
              style={{ transform: "rotate(17deg)", transformOrigin: "bottom left" }}
            />
            <PlayingCard
              card="AS"
              className="absolute bottom-0 left-1/2"
              style={{ transform: "translateX(-50%) translateY(-7%)" }}
            />
          </div>

          <h1 className="font-display text-4xl font-bold tracking-tight text-cream-50 sm:text-6xl">
            <span aria-hidden>🃏 </span>DESI CARD GAMES
          </h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-brass-300">
            Apni game. Apne rules. Apne log. 😎
          </p>
          <p className="mt-3 max-w-md text-sm text-cream-400">
            A modern collection of classic Pakistani card games. Play the computer on your own, or
            deal your friends in from anywhere.
          </p>

          <Link href="/games" className="btn btn-primary mt-7 !min-h-14 w-full max-w-xs text-base">
            🎮 Explore Games
          </Link>
        </section>

        {/* ---------- The shelf ---------- */}
        <section aria-labelledby="games-heading">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="games-heading" className="text-sm font-semibold text-cream-100">
              Games
            </h2>
            <Link
              href="/games"
              className="text-xs font-semibold text-brass-300 underline underline-offset-2"
            >
              All games →
            </Link>
          </div>

          <div className="space-y-4">
            {GAMES.map((game, i) => (
              <GameRow key={game.id} game={game} index={i} />
            ))}
          </div>

          {/* Join a friend's table without going through any setup. */}
          <form onSubmit={handleJoin} className="mx-auto mt-5 flex max-w-md gap-2">
            <input
              className="field tabular text-center uppercase tracking-[0.3em]"
              placeholder="ROOM CODE"
              value={joinCode}
              maxLength={ROOM_CODE_LENGTH}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Room code to join"
              // Stored exactly as typed. The uppercase is CSS, and the
              // tidying happens on blur and on submit — rewriting the value
              // on every keystroke is what emptied the field on Android.
              onChange={(e) => {
                setJoinCode(e.target.value);
                setJoinError("");
              }}
              onBlur={() => setJoinCode((c) => normalizeRoomCode(c))}
            />
            <button
              type="submit"
              disabled={joining || joinCode.trim().length === 0}
              className="btn btn-secondary shrink-0 !min-h-11"
            >
              {joining ? "…" : "Join table"}
            </button>
          </form>
          {joinError && (
            <p className="mt-1.5 text-center text-xs text-chili-400" role="alert">
              {joinError}
            </p>
          )}
        </section>

      </div>
    </main>
  );
}
