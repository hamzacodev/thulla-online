"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useSettings } from "@/lib/settings";
import { authedFetch } from "@/lib/apiClient";
import { clearSavedGame } from "@/lib/useLocalGame";
import { PLAYER_COUNTS, defaultNames, loadSetup, saveSetup, type TableSetup } from "@/lib/setup";
import type { Difficulty } from "@/lib/engine/types";
import { sfx, primeAudio } from "@/lib/sound";

/**
 * Thulla's table setup: opponents, player count, names, CPU difficulty.
 *
 * Lifted out of the old `/play` route so the game's own hub can open the
 * same screen without a second copy of it. `/play` still works and renders
 * this; `/games/thulla/play` renders it too. One setup, two doors.
 *
 * `basePath` is which of those doors it was opened through, so the
 * vs-Computer / With-Friends toggle links back to the same place instead of
 * teleporting the player out of the game section they were in.
 */
const DIFFICULTIES: Array<{ id: Difficulty; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Plays any legal card" },
  { id: "medium", label: "Medium", hint: "Ducks under high cards" },
  { id: "hard", label: "Hard", hint: "Tracks who's out of a suit" },
];

export function ThullaSetup({ basePath = "/play" }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "friends" ? "friends" : "cpu";
  const { userId, username, accessToken, loading: authLoading } = useAuth();
  const { settings } = useSettings();

  const [setup, setSetup] = useState<TableSetup>({
    playerCount: 4,
    difficulty: settings.difficulty,
    names: defaultNames(4, "You"),
  });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Restore the last table, and prefer the signed-in username if we have one.
  useEffect(() => {
    const saved = loadSetup();
    const human = username ?? saved?.names[0] ?? "You";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the last table from localStorage, unavailable during render
    if (saved) setSetup({ ...saved, names: [human, ...saved.names.slice(1)] });
    else setSetup((s) => ({ ...s, names: defaultNames(s.playerCount, human) }));
  }, [username]);

  function setCount(n: number) {
    sfx.click();
    setSetup((s) => {
      const names = defaultNames(n, s.names[0] ?? "You");
      // Keep any names the player already customised.
      for (let i = 1; i < Math.min(n, s.names.length); i++) names[i] = s.names[i];
      return { ...s, playerCount: n, names };
    });
  }

  function setName(i: number, value: string) {
    setSetup((s) => {
      const names = [...s.names];
      names[i] = value;
      return { ...s, names };
    });
  }

  function startLocal() {
    primeAudio();
    const cleaned: TableSetup = {
      ...setup,
      names: setup.names.map((n, i) => n.trim() || (i === 0 ? "You" : `CPU ${i}`)),
    };
    saveSetup(cleaned);
    clearSavedGame(); // a new table makes the old save stale
    router.push("/game");
  }

  async function createRoom() {
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/create-room", accessToken, { maxPlayers: setup.playerCount });
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push(`/room/${data.code}`);
  }

  async function joinRoom() {
    if (!joinCode.trim()) return setError("Enter a room code first.");
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/join-room", accessToken, { code: joinCode });
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push(`/room/${data.code}`);
  }

  const needsAuth = mode === "friends" && !authLoading && !userId;
  const needsUsername = mode === "friends" && !!userId && !username;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1.5">
          <Link href={`${basePath}?mode=cpu`} className={`btn !min-h-11 text-sm ${mode === "cpu" ? "btn-primary" : "btn-ghost"}`}>
            🤖 vs Computer
          </Link>
          <Link href={`${basePath}?mode=friends`} className={`btn !min-h-11 text-sm ${mode === "friends" ? "btn-primary" : "btn-ghost"}`}>
            👥 With Friends
          </Link>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-cream-100">How many players?</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {PLAYER_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                aria-pressed={setup.playerCount === n}
                className={`tabular btn !min-h-12 !px-0 text-base ${setup.playerCount === n ? "btn-primary" : "btn-secondary"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-cream-400">
            {setup.playerCount === 2
              ? "Head to head — 26 cards each."
              : `52 cards split ${setup.playerCount} ways${
                  52 % setup.playerCount === 0
                    ? ` — ${52 / setup.playerCount} each.`
                    : " — some hands get one extra, just like dealing by hand."
                }`}
          </p>
        </section>

        {mode === "cpu" ? (
          <>
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">CPU difficulty</h2>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      sfx.click();
                      setSetup((s) => ({ ...s, difficulty: d.id }));
                    }}
                    aria-pressed={setup.difficulty === d.id}
                    className={`btn !min-h-16 flex-col !gap-0.5 !px-1 ${setup.difficulty === d.id ? "btn-primary" : "btn-secondary"}`}
                  >
                    <span className="text-sm font-semibold">{d.label}</span>
                    <span className="text-[0.6rem] font-normal opacity-80">{d.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">Player names</h2>
              <div className="space-y-2">
                {setup.names.map((name, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-cream-400">{i === 0 ? "🙂 You" : `🤖 CPU ${i}`}</span>
                    <input
                      className="field"
                      value={name}
                      maxLength={14}
                      onChange={(e) => setName(i, e.target.value)}
                      aria-label={i === 0 ? "Your name" : `Name for CPU ${i}`}
                    />
                  </label>
                ))}
              </div>
            </section>

            <button onClick={startLocal} className="btn btn-primary mt-7 w-full !min-h-14 text-base">
              🎮 Deal the cards
            </button>
          </>
        ) : (
          <section className="mt-6">
            {needsAuth ? (
              <div className="panel p-5 text-center">
                <p className="text-sm text-cream-100">Playing with friends needs an account.</p>
                <p className="mt-1 text-xs text-cream-400">It&apos;s how your room and stats stay attached to you.</p>
                <Link href="/login" className="btn btn-primary mt-4 w-full">Sign in / Sign up</Link>
                <Link href={`${basePath}?mode=cpu`} className="btn btn-ghost mt-2 w-full !text-xs">
                  Or play vs the computer — no account needed
                </Link>
              </div>
            ) : needsUsername ? (
              <div className="panel p-5 text-center">
                <p className="text-sm text-cream-100">Pick a username first.</p>
                <p className="mt-1 text-xs text-cream-400">It&apos;s what other players will see.</p>
                <Link href="/username" className="btn btn-primary mt-4 w-full">Choose username</Link>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-cream-100">Host a room</h2>
                  <button onClick={createRoom} disabled={busy} className="btn btn-primary w-full">
                    {busy ? "Creating…" : `Create a ${setup.playerCount}-player room`}
                  </button>
                  <p className="mt-2 text-xs text-cream-400">
                    You&apos;ll get a code to share. Everyone joins from wherever they are.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="brass-rule flex-1 opacity-50" />
                  <span className="text-xs text-cream-400">or</span>
                  <div className="brass-rule flex-1 opacity-50" />
                </div>

                <div>
                  <h2 className="mb-2 text-sm font-semibold text-cream-100">Join a room</h2>
                  <div className="flex gap-2">
                    <input
                      className="field tabular uppercase tracking-[0.25em]"
                      placeholder="CODE"
                      value={joinCode}
                      maxLength={5}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      aria-label="Room code"
                    />
                    <button onClick={joinRoom} disabled={busy} className="btn btn-secondary shrink-0">Join</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">{error}</p>
        )}
    </div>
  );
}
