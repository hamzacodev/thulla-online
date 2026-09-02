import type { SeriesGameId, SeriesPlayer, SeriesResult, SeriesState } from "./types";

/** A single game is modelled as best-of-1, so one code path serves both. */
export const SINGLE_GAME = 1;
export const MIN_BEST_OF = 3;
export const MAX_BEST_OF = 99;

/** The preset formats, plus whatever odd number the host types. */
export const SERIES_PRESETS = [1, 3, 5, 7] as const;

/**
 * How many wins take the series.
 *
 * Best of 5 is first to 3, and the series ends the moment somebody gets
 * there — 3–1 finishes it, game five is never created. That is the whole
 * point of storing this rather than counting games played.
 */
export function winsRequired(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/**
 * Odd only. An even best-of can end level, which would need a tie-break
 * rule that neither game has, so it's rejected rather than half-handled.
 */
export function isValidBestOf(n: number): boolean {
  if (!Number.isInteger(n)) return false;
  if (n === SINGLE_GAME) return true;
  return n % 2 === 1 && n >= MIN_BEST_OF && n <= MAX_BEST_OF;
}

export function isSeries(bestOf: number): boolean {
  return isValidBestOf(bestOf) && bestOf > SINGLE_GAME;
}

/** "Best of 5 — first to 3". */
export function formatLabel(bestOf: number): string {
  if (bestOf === SINGLE_GAME) return "Single game";
  return `Best of ${bestOf} — first to ${winsRequired(bestOf)}`;
}

export function newSeriesId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSeries(opts: {
  game: SeriesGameId;
  bestOf: number;
  players: Array<Pick<SeriesPlayer, "id" | "name">>;
  id?: string;
  now?: number;
}): SeriesState {
  const { game, bestOf, players, now = Date.now() } = opts;
  if (!isValidBestOf(bestOf)) throw new Error(`Best of ${bestOf} isn't a valid format.`);
  if (players.length < 2) throw new Error("A series needs at least two players.");
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error("A player can't appear twice in a series.");
  }

  return {
    version: 1,
    id: opts.id ?? newSeriesId(),
    game,
    bestOf,
    winsRequired: winsRequired(bestOf),
    status: "active",
    currentGameNumber: 1,
    gamesPlayed: 0,
    players: players.map((p) => ({ ...p, wins: 0 })),
    games: [],
    winnerId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Records one finished game against the series.
 *
 * Idempotent on the individual game's id, which is what stops a result
 * being counted twice — a re-render, a refresh on the result screen, or two
 * clients reporting the same finish all land on the same series. Refuses
 * outright once the series is over, so a late result can't resurrect it or
 * push the score past what won it.
 */
export function recordGame(
  seriesIn: SeriesState,
  result: { gameId: string; winnerId: string | null; winnerName: string | null; now?: number }
): SeriesResult {
  const { gameId, winnerId, winnerName, now = Date.now() } = result;

  if (seriesIn.games.some((g) => g.gameId === gameId)) {
    // Already counted. Not an error — the caller is allowed to be careless.
    return { series: seriesIn };
  }
  if (seriesIn.status === "completed") {
    return { series: seriesIn, error: "That series is already finished." };
  }

  const series: SeriesState = {
    ...seriesIn,
    players: seriesIn.players.map((p) => ({ ...p })),
    games: [...seriesIn.games],
  };

  const gameNumber = series.gamesPlayed + 1;
  series.games.push({ gameNumber, gameId, winnerId, winnerName, completedAt: now });
  series.gamesPlayed = gameNumber;

  const winner = winnerId ? series.players.find((p) => p.id === winnerId) : undefined;
  if (winner) winner.wins += 1;

  if (winner && winner.wins >= series.winsRequired) {
    series.status = "completed";
    series.winnerId = winner.id;
  } else if (series.gamesPlayed >= series.bestOf) {
    // Can't happen with an odd best-of and a winner every game, but a series
    // must never sit "active" with no games left to play.
    series.status = "completed";
    series.winnerId = seriesStandings(series)[0]?.id ?? null;
  } else {
    series.currentGameNumber = gameNumber + 1;
  }

  series.updatedAt = now;
  return { series };
}

/** Best first, then by name so the order is stable between renders. */
export function seriesStandings(series: SeriesState): SeriesPlayer[] {
  return [...series.players].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
}

/** How many more wins this player needs. */
export function winsToGo(series: SeriesState, playerId: string): number {
  const p = series.players.find((x) => x.id === playerId);
  return p ? Math.max(0, series.winsRequired - p.wins) : series.winsRequired;
}

/** "3 — 1", in standings order. */
export function scoreLine(series: SeriesState): string {
  return seriesStandings(series)
    .map((p) => p.wins)
    .join(" — ");
}

export function seriesWinner(series: SeriesState): SeriesPlayer | null {
  if (series.status !== "completed" || !series.winnerId) return null;
  return series.players.find((p) => p.id === series.winnerId) ?? null;
}

/** Guards against a series that has drifted — used by the tests. */
export function auditSeries(series: SeriesState): string[] {
  const problems: string[] = [];

  if (!isValidBestOf(series.bestOf)) problems.push(`bestOf ${series.bestOf} is not a valid format`);
  if (series.winsRequired !== winsRequired(series.bestOf)) {
    problems.push(`winsRequired ${series.winsRequired} doesn't match best of ${series.bestOf}`);
  }
  if (series.gamesPlayed > series.bestOf) {
    problems.push(`${series.gamesPlayed} games played in a best of ${series.bestOf}`);
  }
  if (series.games.length !== series.gamesPlayed) {
    problems.push(`${series.games.length} game records for ${series.gamesPlayed} played`);
  }

  const numbers = series.games.map((g) => g.gameNumber);
  if (new Set(numbers).size !== numbers.length) problems.push("duplicate game number");
  if (numbers.some((n) => n < 1)) problems.push("game number below 1");
  const ids = series.games.map((g) => g.gameId);
  if (new Set(ids).size !== ids.length) problems.push("the same game counted twice");

  const tallied = new Map<string, number>();
  for (const g of series.games) {
    if (g.winnerId) tallied.set(g.winnerId, (tallied.get(g.winnerId) ?? 0) + 1);
  }
  for (const p of series.players) {
    if ((tallied.get(p.id) ?? 0) !== p.wins) {
      problems.push(`${p.name} has ${p.wins} wins but won ${tallied.get(p.id) ?? 0} games`);
    }
    if (p.wins > series.winsRequired) problems.push(`${p.name} has more wins than the series needs`);
  }

  if (series.status === "completed") {
    if (!series.winnerId) problems.push("completed with no winner");
    const w = series.players.find((p) => p.id === series.winnerId);
    if (w && w.wins < series.winsRequired && series.gamesPlayed < series.bestOf) {
      problems.push("completed before anyone reached the required wins");
    }
  } else if (series.players.some((p) => p.wins >= series.winsRequired)) {
    problems.push("still active despite somebody reaching the required wins");
  }

  return problems;
}
