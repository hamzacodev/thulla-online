"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useSettings } from "@/lib/settings";
import { cardsForDecks, MAX_DECKS, MIN_DECKS } from "@/lib/bluff/cards";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bluff/rules";
import { clearSavedBluffGame } from "@/lib/bluff/useBluffGame";
import { bluffCpuName } from "@/lib/bluff/ai";
import { loadBluffSetup, saveBluffSetup, type BluffTableSetup } from "@/lib/bluff/setup";
import type { BluffDifficulty } from "@/lib/bluff/types";
import { primeAudio, sfx } from "@/lib/sound";

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);
const DECKS = Array.from({ length: MAX_DECKS - MIN_DECKS + 1 }, (_, i) => MIN_DECKS + i);

const DIFFICULTIES: Array<{ id: BluffDifficulty; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Rarely calls a bluff" },
  { id: "medium", label: "Medium", hint: "Counts what it holds" },
  { id: "hard", label: "Hard", hint: "Weighs the pile before calling" },
];

/**
 * Setting up a Bluff table.
 *
 * The deck count is the thing that makes this different from Thulla's
 * setup, and it belongs to the *game*, not to the player — it is chosen
 * here, per game, and never remembered as a profile preference. In an online
 * room the same control is the host's alone.
 */
export function BluffSetup({ basePath = "/games/bluff/play" }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "friends" ? "friends" : "cpu";
  const { userId, username } = useAuth();
  const { settings } = useSettings();

  const [setup, setSetup] = useState<BluffTableSetup>({
    playerCount: 4,
    deckCount: 1,
    difficulty: settings.difficulty as BluffDifficulty,
    names: ["You", bluffCpuName(0), bluffCpuName(1), bluffCpuName(2)],
  });

  useEffect(() => {
    const saved = loadBluffSetup();
    const human = username ?? saved?.names[0] ?? "You";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the last table from localStorage, unavailable during render
    if (saved) setSetup({ ...saved, names: [human, ...saved.names.slice(1)] });
    else setSetup((s) => ({ ...s, names: [human, ...s.names.slice(1)] }));
  }, [username]);

  function setCount(n: number) {
    sfx.click();
    setSetup((s) => {
      const names = Array.from({ length: n }, (_, i) =>
        i === 0 ? s.names[0] ?? "You" : s.names[i] ?? bluffCpuName(i - 1)
      );
      return { ...s, playerCount: n, names };
    });
  }

  function start() {
    primeAudio();
    const cleaned: BluffTableSetup = {
      ...setup,
      names: setup.names.map((n, i) => n.trim() || (i === 0 ? "You" : bluffCpuName(i - 1))),
    };
    saveBluffSetup(cleaned);
    clearSavedBluffGame(); // a new table makes the old save stale
    router.push("/games/bluff/table");
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1.5">
        <Link
          href={`${basePath}?mode=cpu`}
          className={`btn !min-h-11 text-sm ${mode === "cpu" ? "btn-primary" : "btn-ghost"}`}
        >
          🤖 vs Computer
        </Link>
        <Link
          href={`${basePath}?mode=friends`}
          className={`btn !min-h-11 text-sm ${mode === "friends" ? "btn-primary" : "btn-ghost"}`}
        >
          👥 With Friends
        </Link>
      </div>

      {mode === "friends" ? (
        <section className="panel mt-6 p-5 text-center">
          <p className="text-3xl" aria-hidden>🚧</p>
          <p className="font-display mt-2 text-lg font-bold text-cream-50">
            Online Bluff rooms aren&apos;t built yet
          </p>
          <p className="mt-1.5 text-sm text-cream-400">
            The engine, the CPU and the whole table are done — what&apos;s missing is the room:
            hosting, joining, and the host&apos;s deck choice syncing to everyone. Thulla&apos;s
            online rooms are unaffected.
          </p>
          <Link href={`${basePath}?mode=cpu`} className="btn btn-primary mt-4 w-full">
            🤖 Play against the computer
          </Link>
          <Link href="/games/thulla/play?mode=friends" className="btn btn-ghost mt-2 w-full !text-xs">
            Play Thulla with friends instead
          </Link>
        </section>
      ) : (
        <>
          {/* ---------- Decks: the host's call, per game ---------- */}
          <section className="mt-6">
            <h2 className="mb-1 text-sm font-semibold text-cream-100">How many decks?</h2>
            <p className="mb-2 text-xs text-cream-400">
              More decks means more of every card — and more room to lie about them.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DECKS.map((n) => {
                const active = setup.deckCount === n;
                return (
                  <button
                    key={n}
                    onClick={() => {
                      sfx.click();
                      setSetup((s) => ({ ...s, deckCount: n }));
                    }}
                    aria-pressed={active}
                    className={`btn flex-col !min-h-20 !gap-0.5 !px-1 ${active ? "btn-primary" : "btn-secondary"}`}
                  >
                    <span aria-hidden className="text-base leading-none">{"🃏".repeat(n)}</span>
                    <span className="text-sm font-bold">{n} Deck{n > 1 ? "s" : ""}</span>
                    <span className={`tabular text-[0.65rem] ${active ? "text-ink-950/70" : "text-cream-400"}`}>
                      {cardsForDecks(n)} cards
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-cream-100">How many players?</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {PLAYER_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  aria-pressed={setup.playerCount === n}
                  className={`tabular btn !min-h-12 !px-0 text-base ${
                    setup.playerCount === n ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="tabular mt-2 text-xs text-cream-400">
              {cardsForDecks(setup.deckCount)} cards split {setup.playerCount} ways —{" "}
              {Math.floor(cardsForDecks(setup.deckCount) / setup.playerCount)}
              {cardsForDecks(setup.deckCount) % setup.playerCount === 0 ? "" : "–" + Math.ceil(cardsForDecks(setup.deckCount) / setup.playerCount)}{" "}
              each.
            </p>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-cream-100">CPU difficulty</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    sfx.click();
                    setSetup((s) => ({ ...s, difficulty: d.id }));
                  }}
                  aria-pressed={setup.difficulty === d.id}
                  className={`btn flex-col !min-h-16 !gap-0.5 !px-1 !text-xs ${
                    setup.difficulty === d.id ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  <span className="font-bold">{d.label}</span>
                  <span
                    className={`text-[0.6rem] leading-tight ${
                      setup.difficulty === d.id ? "text-ink-950/70" : "text-cream-400"
                    }`}
                  >
                    {d.hint}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-cream-100">Names</h2>
            <div className="space-y-2">
              {setup.names.slice(0, setup.playerCount).map((name, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-cream-400">
                    {i === 0 ? "You" : `CPU ${i}`}
                  </span>
                  <input
                    className="field"
                    value={name}
                    maxLength={20}
                    onChange={(e) =>
                      setSetup((s) => {
                        const names = [...s.names];
                        names[i] = e.target.value;
                        return { ...s, names };
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <button onClick={start} className="btn btn-primary mt-7 !min-h-14 w-full text-base">
            🎮 Chalo bhai, game shuru!
          </button>
          {!userId && (
            <p className="mt-2 text-center text-[0.7rem] text-cream-400/80">
              Playing signed out — your Bluff record is saved on this device.
            </p>
          )}
        </>
      )}
    </div>
  );
}
