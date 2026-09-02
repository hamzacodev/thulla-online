"use client";

import Link from "next/link";
import { Avatar } from "./Avatar";
import { formatLabel, mostOften, placingSummary, seriesStandings, seriesWinner } from "@/lib/series/rules";
import type { SeriesState } from "@/lib/series/types";

const PLACE = ["🥇", "🥈", "🥉"];

/**
 * The series, stated plainly across the top of the table so everyone at it
 * knows where they are: the format, which game this is out of how many, and
 * what the score is.
 *
 * A strip rather than a pill in the header, because the header is already
 * carrying a menu, the room code, chat and voice — and because this is
 * information every player needs, not a control one player uses.
 *
 * "Game 3 / 5" is the maximum, not a promise: a series that gets to 3–0
 * stops there, which is what the "first to N" says.
 */
export function SeriesTableStrip({ series, meId }: { series: SeriesState; meId?: string }) {
  if (series.bestOf <= 1) return null;
  const table = seriesStandings(series);
  const gameNumber = Math.min(series.currentGameNumber, series.bestOf);

  return (
    <div className="shrink-0 border-b border-white/[0.07] bg-ink-950/60 px-3 py-1.5 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center">
        <span className="tabular text-[0.68rem] font-semibold uppercase tracking-wider text-brass-300">
          🏆 Best of {series.bestOf}
        </span>
        <span className="tabular text-[0.68rem] text-cream-400">
          Game {gameNumber} of {series.bestOf}
        </span>
        <span className="tabular hidden text-[0.68rem] text-cream-400/70 sm:inline">
          first to {series.winsRequired}
        </span>

        <span className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
          {table.map((p) => (
            <span key={p.id} className="tabular text-xs">
              <span className={p.id === meId ? "font-bold text-cream-50" : "text-cream-400"}>
                {p.name}
              </span>{" "}
              <span
                className={`font-display font-bold ${
                  p.wins >= series.winsRequired ? "text-mint-300" : "text-cream-100"
                }`}
              >
                {p.wins}
              </span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * The running score, small enough to sit in a game header without getting
 * in the way of the table.
 */
export function SeriesScoreBar({
  series,
  meId,
  compact,
}: {
  series: SeriesState;
  meId?: string;
  compact?: boolean;
}) {
  if (series.bestOf <= 1) return null;
  const table = seriesStandings(series);

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-brass-400/25 bg-ink-900/70 px-2.5 py-1"
      title={formatLabel(series.bestOf)}
    >
      <span className="tabular hidden text-[0.62rem] font-semibold uppercase tracking-wider text-brass-300 sm:inline">
        Bo{series.bestOf}
      </span>
      <span className="flex items-center gap-1.5">
        {table.slice(0, compact ? 3 : table.length).map((p) => (
          <span
            key={p.id}
            className={`tabular text-xs ${p.id === meId ? "font-bold text-cream-50" : "text-cream-400"}`}
          >
            <span className="hidden sm:inline">{p.name.split(" ")[0]} </span>
            {p.wins}
          </span>
        ))}
      </span>
      <span className="tabular text-[0.62rem] text-cream-400/70">
        G{Math.min(series.currentGameNumber, series.bestOf)}
      </span>
    </div>
  );
}

/**
 * Between games. Deliberately never says "series complete" — that screen is
 * a different component, shown only once somebody has actually won.
 */
export function SeriesInterval({
  series,
  meId,
  avatars,
  onNextGame,
  busy,
}: {
  series: SeriesState;
  meId?: string;
  avatars?: Record<string, string>;
  onNextGame: () => void;
  busy?: boolean;
}) {
  const table = seriesStandings(series);
  const last = series.games[series.games.length - 1];

  return (
    <div className="panel anim-rise mt-3 p-4 text-left">
      <p className="text-[0.7rem] uppercase tracking-wider text-brass-300">
        {formatLabel(series.bestOf)}
      </p>
      <p className="font-display mt-0.5 text-lg font-bold text-cream-50">
        Game {last?.gameNumber ?? series.gamesPlayed} complete
        {last?.winnerName ? ` — ${last.winnerName} won it` : ""}
      </p>

      <ul className="mt-3 space-y-1.5">
        {table.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
              p.id === meId ? "bg-white/[0.06] ring-1 ring-brass-300/40" : "bg-white/[0.04]"
            }`}
          >
            <Avatar src={avatars?.[p.id]} name={p.name} size={20} />
            <span className="min-w-0 flex-1 truncate text-cream-50">{p.name}</span>
            <span className="tabular font-display font-bold text-cream-50">{p.wins}</span>
          </li>
        ))}
      </ul>

      <p className="tabular mt-3 text-xs text-cream-400">
        Next: game {series.currentGameNumber} · first to {series.winsRequired} takes it
      </p>

      <button onClick={onNextGame} disabled={busy} className="btn btn-primary mt-3 !min-h-12 w-full">
        {busy ? "Dealing…" : `▶ Play game ${series.currentGameNumber}`}
      </button>
    </div>
  );
}

/**
 * The end of the whole thing.
 *
 * Two columns from `lg` up, one below it. A single tall column meant a
 * desktop had to scroll past the result to reach the buttons — the widest
 * screens got the worst version of the screen, which is backwards. The
 * phone layout is the stacked one and is unchanged.
 */
export function SeriesComplete({
  series,
  meId,
  avatars,
  onPlayAgain,
  historyHref,
}: {
  series: SeriesState;
  meId?: string;
  avatars?: Record<string, string>;
  onPlayAgain?: () => void;
  historyHref: string;
}) {
  const table = seriesStandings(series);
  const winner = seriesWinner(series);
  const iWon = !!meId && winner?.id === meId;

  // "Who came 2nd most often", and so on down the table. Only places
  // somebody actually finished in, so a 4-player series doesn't list 8.
  const places = Array.from({ length: series.players.length }, (_, i) => i)
    .slice(1)
    .map((place) => ({ place, players: mostOften(series, place) }))
    .filter((row) => row.players.length > 0);

  const ordinal = (n: number) => {
    const k = n + 1;
    return `${k}${k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"}`;
  };

  return (
    <div className="panel anim-pop w-full max-w-md p-6 lg:max-w-5xl lg:p-8">
      {/* Header spans both columns. */}
      <div className="text-center">
        <p className="text-[0.7rem] uppercase tracking-wider text-brass-300">
          {formatLabel(series.bestOf)}
        </p>
        <p className="font-display mt-1 text-3xl font-bold text-cream-50 lg:text-4xl">
          Series complete 🏆
        </p>
        <p className="mt-2 text-base font-semibold text-cream-100">
          {winner ? `🏆 ${winner.name} won the series` : "Series finished"}
        </p>
        {iWon && <p className="mt-1 text-sm text-mint-300">Wah bhai! Poori series jeet li 🔥</p>}
        <p className="font-display tabular mt-4 text-4xl font-bold text-cream-50 lg:text-5xl">
          {table.map((p) => p.wins).join(" – ")}
        </p>
        <p className="tabular mt-1 text-xs text-cream-400">
          {series.gamesPlayed} of {series.bestOf} games played
          {series.gamesPlayed < series.bestOf ? " — decided early" : ""}
        </p>
      </div>

      <div className="brass-rule my-5" />

      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        {/* Standings, with how each player actually finished. */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-[0.7rem] uppercase tracking-wider text-brass-300">
            Final standings
          </h2>
          <ol className="space-y-1.5">
            {table.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  p.id === winner?.id ? "bg-brass-400/10 ring-1 ring-brass-300/40" : "bg-white/[0.04]"
                }`}
              >
                <span className="w-6 shrink-0 text-center">{PLACE[i] ?? `${i + 1}️⃣`}</span>
                <Avatar src={avatars?.[p.id]} name={p.name} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-cream-50">
                    {p.name}
                    {p.id === meId && (
                      <span className="ml-1 text-[0.65rem] text-brass-300">(you)</span>
                    )}
                  </span>
                  <span className="tabular block truncate text-[0.68rem] text-cream-400">
                    {placingSummary(p) || "—"}
                  </span>
                </span>
                <span className="tabular font-display shrink-0 font-bold text-cream-50">
                  {p.wins} {p.wins === 1 ? "win" : "wins"}
                </span>
              </li>
            ))}
          </ol>

          {places.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <h3 className="mb-2 text-[0.7rem] uppercase tracking-wider text-brass-300">
                Most often…
              </h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {places.map((row) => (
                  <li key={row.place} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-cream-400">{ordinal(row.place)} place</span>
                    <span className="min-w-0 truncate text-cream-100">
                      {row.players.map((p) => p.name).join(", ")}{" "}
                      <span className="tabular text-cream-400">
                        ×{row.players[0].placings[row.place]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Game by game, and the way out. */}
        <section className="flex flex-col">
          <h2 className="mb-2 text-[0.7rem] uppercase tracking-wider text-brass-300">Game by game</h2>
          <ul className="space-y-1 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            {series.games.map((g) => (
              <li key={g.gameNumber} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="tabular text-cream-400">Game {g.gameNumber}</span>
                <span className="min-w-0 truncate text-cream-100">
                  {g.winnerName ? `${g.winnerName} won` : "no winner"}
                </span>
              </li>
            ))}
            {series.gamesPlayed < series.bestOf && (
              <li className="pt-1 text-[0.7rem] leading-snug text-cream-400/70">
                Games {series.gamesPlayed + 1}–{series.bestOf} weren&apos;t played — the series was
                already won.
              </li>
            )}
          </ul>

          <div className="mt-4 flex flex-col gap-2 lg:mt-auto">
            {onPlayAgain && (
              <button className="btn btn-primary !min-h-12" onClick={onPlayAgain}>
                🔄 Play again — new series
              </button>
            )}
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link href={historyHref} className="btn btn-secondary flex-1">
                🕘 Series history
              </Link>
              <Link href="/games" className="btn btn-secondary flex-1">
                🃏 Back to games
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
