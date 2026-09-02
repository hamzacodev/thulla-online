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
    version: 2,
    id: opts.id ?? newSeriesId(),
    game,
    bestOf,
    winsRequired: winsRequired(bestOf),
    status: "active",
    currentGameNumber: 1,
    gamesPlayed: 0,
    players: players.map((p) => ({ ...p, wins: 0, placings: new Array(players.length).fill(0) })),
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
  result: {
    gameId: string;
    /**
     * Everyone, best first. The whole finishing order rather than just the
     * winner, because coming second four times running is a real result and
     * a series that only counts firsts can't tell you that.
     */
    order: string[];
    winnerName?: string | null;
    now?: number;
  }
): SeriesResult {
  const { gameId, order, now = Date.now() } = result;
  const winnerId = order[0] ?? null;

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
  const winner = winnerId ? series.players.find((p) => p.id === winnerId) : undefined;

  series.games.push({
    gameNumber,
    gameId,
    order: [...order],
    winnerId,
    winnerName: result.winnerName ?? winner?.name ?? null,
    completedAt: now,
  });
  series.gamesPlayed = gameNumber;

  // Every place, not only the first.
  order.forEach((playerId, place) => {
    const p = series.players.find((x) => x.id === playerId);
    if (!p) return;
    while (p.placings.length < series.players.length) p.placings.push(0);
    if (place < p.placings.length) p.placings[place] += 1;
  });
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

/**
 * Best first. Wins decide it; after that, whoever came second more often is
 * ahead of whoever came last more often, and so on down the table — so two
 * players level on wins are separated by how they actually finished rather
 * than alphabetically.
 */
export function seriesStandings(series: SeriesState): SeriesPlayer[] {
  return [...series.players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const depth = Math.max(a.placings.length, b.placings.length);
    for (let place = 1; place < depth; place++) {
      const diff = (b.placings[place] ?? 0) - (a.placings[place] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name);
  });
}

/** "1st ×3 · 2nd ×2 · 4th ×1" — how somebody's series actually went. */
export function placingSummary(player: SeriesPlayer): string {
  const suffix = (n: number) => {
    const k = n + 1;
    return `${k}${k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"}`;
  };
  return player.placings
    .map((count, place) => ({ count, place }))
    .filter((x) => x.count > 0)
    .map((x) => `${suffix(x.place)} ×${x.count}`)
    .join(" · ");
}

/** Who came Nth most often. Empty when nobody has finished there. */
export function mostOften(series: SeriesState, place: number): SeriesPlayer[] {
  const best = Math.max(0, ...series.players.map((p) => p.placings[place] ?? 0));
  if (best === 0) return [];
  return series.players.filter((p) => (p.placings[place] ?? 0) === best);
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
    if ((p.placings[0] ?? 0) !== p.wins) {
      problems.push(`${p.name}'s firsts (${p.placings[0] ?? 0}) don't match their wins (${p.wins})`);
    }
    const placed = p.placings.reduce((n, c) => n + c, 0);
    if (placed !== series.gamesPlayed) {
      problems.push(`${p.name} is placed in ${placed} games but ${series.gamesPlayed} were played`);
    }
  }
  for (const g of series.games) {
    if (new Set(g.order).size !== g.order.length) problems.push(`game ${g.gameNumber} places a player twice`);
    if (g.order.length !== series.players.length) {
      problems.push(`game ${g.gameNumber} placed ${g.order.length} of ${series.players.length} players`);
    }
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
