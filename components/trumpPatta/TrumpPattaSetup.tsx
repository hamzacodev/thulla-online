"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useSettings } from "@/lib/settings";
import { DEALT_CARDS, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/trumpPatta/rules";
import { clearSavedTrumpPattaGame } from "@/lib/trumpPatta/useTrumpPattaGame";
import { trumpPattaCpuName } from "@/lib/trumpPatta/ai";
import {
  loadTrumpPattaSetup,
  saveTrumpPattaSetup,
  type TrumpPattaTableSetup,
} from "@/lib/trumpPatta/setup";
import type { TrumpPattaDifficulty } from "@/lib/trumpPatta/types";
import { primeAudio, sfx } from "@/lib/sound";
import { SeriesFormatPicker } from "@/components/SeriesFormatPicker";
import { clearSeries } from "@/lib/series/store";

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

/**
 * Every CPU picks blind, because everybody does — the cards are face-down.
 * What difficulty changes is how it arranges its own hand before holding it
 * out, which is the only decision this game has.
 */
const DIFFICULTIES: Array<{ id: TrumpPattaDifficulty; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Shuffles its hand" },
  { id: "medium", label: "Medium", hint: "Shuffles its hand" },
  { id: "hard", label: "Hard", hint: "Hides its riskiest card mid-fan" },
];

/** "13, 13, 13, 12" — how 51 actually splits, which is never quite evenly. */
function split(count: number): string {
  const base = Math.floor(DEALT_CARDS / count);
  const extra = DEALT_CARDS % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)).join(", ");
}

/**
 * Setting up a Trump-Patta table.
 *
 * The same shape as the other two games' setups. The series format belongs
 * to the match rather than the player, so it is chosen here per table and
 * never remembered as an account preference.
 */
export function TrumpPattaSetup({ basePath = "/games/trump-patta/play" }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "friends" ? "friends" : "cpu";
  const { userId, username } = useAuth();
  const { settings } = useSettings();

  const [setup, setSetup] = useState<TrumpPattaTableSetup>({
    playerCount: 4,
    difficulty: settings.difficulty as TrumpPattaDifficulty,
    names: ["You", trumpPattaCpuName(0), trumpPattaCpuName(1), trumpPattaCpuName(2)],
    bestOf: 1,
  });

  useEffect(() => {
    const saved = loadTrumpPattaSetup();
    const human = username ?? saved?.names[0] ?? "You";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the last table from localStorage, unavailable during render
    if (saved) setSetup({ ...saved, names: [human, ...saved.names.slice(1)] });
    else setSetup((s) => ({ ...s, names: [human, ...s.names.slice(1)] }));
  }, [username]);

  function setCount(n: number) {
    sfx.click();
    setSetup((s) => {
      const names = Array.from({ length: n }, (_, i) =>
        i === 0 ? s.names[0] ?? "You" : s.names[i] ?? trumpPattaCpuName(i - 1)
      );
      return { ...s, playerCount: n, names };
    });
  }

  function start() {
    primeAudio();
    const cleaned: TrumpPattaTableSetup = {
      ...setup,
      names: setup.names.map((n, i) => n.trim() || (i === 0 ? "You" : trumpPattaCpuName(i - 1))),
    };
    saveTrumpPattaSetup(cleaned);
    clearSavedTrumpPattaGame(); // a new table makes the old save stale
    clearSeries("trump_patta"); // and starts a brand new series, never reusing one
    router.push("/games/trump-patta/table");
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
            Online Trump-Patta rooms aren&apos;t built yet
          </p>
          <p className="mt-1.5 text-sm text-cream-400">
            The engine, the CPU and the whole table are done. What&apos;s missing is bigger than a
            room screen: this game only works if your hand stays secret, and the current online
            rooms send the whole table&apos;s state to every browser. That has to change first.
            Thulla&apos;s online rooms are unaffected.
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
              One card is hidden, so {DEALT_CARDS} are dealt: {split(setup.playerCount)}.
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

          <div className="mt-6">
            <SeriesFormatPicker
              bestOf={setup.bestOf ?? 1}
              onChange={(bestOf) => setSetup((s) => ({ ...s, bestOf }))}
            />
          </div>

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
            🥷 Chalo, Trump-Patta shuru!
          </button>
          {!userId && (
            <p className="mt-2 text-center text-[0.7rem] text-cream-400/80">
              Playing signed out — your Trump-Patta record is saved on this device.
            </p>
          )}
        </>
      )}
    </div>
  );
}
