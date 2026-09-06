import type { SeriesGame, SeriesGameId, SeriesPlayer, SeriesResult, SeriesState } from "./types";

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
 * The formats a running series could be cut down to.
 *
 * Only shorter ones, and never shorter than the games already played — a
 * best of 7 that is 3–1 down can become a best of 5, but not a best of 3,
 * because game 4 has been played and a best of 3 has no game 4 to put it in.
 */
export function shorterFormats(series: SeriesState): number[] {
  if (series.status !== "active") return [];
  const out: number[] = [];
  for (let n = MIN_BEST_OF; n < series.bestOf; n += 2) {
    if (n >= series.gamesPlayed) out.push(n);
  }
  return out;
}

/** Why this series can't be cut to that length, or null if it can. */
export function shortenProblem(series: SeriesState, bestOf: number): string | null {
  if (series.status !== "active") return "That series is already finished.";
  if (!isValidBestOf(bestOf)) {
    return "A series has to be an odd number of games — an even one can finish level.";
  }
  if (bestOf >= series.bestOf) return "A series can only be made shorter, not longer.";
  if (bestOf < series.gamesPlayed) {
    return `${series.gamesPlayed} games have already been played, so it can't be cut to ${bestOf}.`;
  }
  return null;
}

/**
 * What cutting to this length would actually do.
 *
 * Lowering the target can finish the series on the spot — best of 7 needs 4
 * wins, best of 5 needs 3, so somebody on 3 has already done enough. That
 * is correct by the rules and still a shock if it happens on one tap, so
 * callers can ask first and say so.
 */
export function shortenOutcome(
  series: SeriesState,
  bestOf: number
): { endsNow: boolean; winnerName: string | null } {
  if (shortenProblem(series, bestOf)) return { endsNow: false, winnerName: null };
  const target = winsRequired(bestOf);
  const leader = seriesStandings(series)[0];
  const endsNow = (!!leader && leader.wins >= target) || series.gamesPlayed >= bestOf;
  return { endsNow, winnerName: endsNow ? leader?.name ?? null : null };
}

/**
 * Cuts a running series short.
 *
 * People misjudge how long they want to play, and a best of 7 at 11pm is a
 * different proposition from a best of 7 at 8pm. Shortening lowers the
 * target — best of 7 needs 4 wins, best of 5 needs 3 — so it can end the
 * series immediately, and that is the point rather than an edge case:
 * someone on 3 wins has already done enough for a best of 5.
 *
 * Nothing already played is touched. Games keep their numbers and their
 * results; only the finish line moves.
 */
export function shortenSeries(
  seriesIn: SeriesState,
  bestOf: number,
  now: number = Date.now()
): SeriesResult {
  const problem = shortenProblem(seriesIn, bestOf);
  if (problem) return { series: seriesIn, error: problem };

  const series: SeriesState = {
    ...seriesIn,
    bestOf,
    winsRequired: winsRequired(bestOf),
    players: seriesIn.players.map((p) => ({ ...p })),
    games: [...seriesIn.games],
    updatedAt: now,
  };

  const leader = seriesStandings(series)[0];
  if (leader && leader.wins >= series.winsRequired) {
    series.status = "completed";
    series.winnerId = leader.id;
  } else if (series.gamesPlayed >= series.bestOf) {
    series.status = "completed";
    series.winnerId = leader?.id ?? null;
  } else {
    series.currentGameNumber = series.gamesPlayed + 1;
  }

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

/**
 * Who came last in one game.
 *
 * The finishing order is stored best-first, so the loser is simply the tail
 * of it — no separate field to keep in step, and it works for every game in
 * the platform because none of them can end without a full order.
 */
export function gameLoserId(game: SeriesGame): string | null {
  return game.order.length > 1 ? game.order[game.order.length - 1] : null;
}

/** Their name, when we can still find them in the series. */
export function gameLoserName(series: SeriesState, game: SeriesGame): string | null {
  const id = gameLoserId(game);
  if (!id) return null;
  return series.players.find((p) => p.id === id)?.name ?? null;
}

/** Which game this player first appeared in. */
export function joinedAt(player: SeriesPlayer): number {
  return player.joinedAtGame ?? 1;
}

/** How many games this player was actually in. */
export function playedIn(series: SeriesState, player: SeriesPlayer): number {
  return Math.max(0, series.gamesPlayed - joinedAt(player) + 1);
}

/**
 * How many games this player finished last.
 *
 * Counted from the games themselves rather than read out of `placings`,
 * because the slot that means "last" moves when the table size changes: in
 * a three-player game last is index 2, and after somebody joins it's index
 * 3. Counting losers directly is right whatever the table did.
 */
export function lossesOf(series: SeriesState, player: SeriesPlayer): number {
  return series.games.reduce((n, g) => n + (gameLoserId(g) === player.id ? 1 : 0), 0);
}

/**
 * Sits new players down in a running series.
 *
 * They start on nothing and are marked as joining for the next game, so the
 * standings never imply they played the earlier ones. Everybody's existing
 * results are untouched: joining late changes who is at the table from here
 * on, not what already happened.
 */
export function addPlayers(
  seriesIn: SeriesState,
  incoming: Array<Pick<SeriesPlayer, "id" | "name">>,
  now: number = Date.now()
): SeriesResult {
  if (seriesIn.status !== "active") {
    return { series: seriesIn, error: "That series is already finished." };
  }
  const known = new Set(seriesIn.players.map((p) => p.id));
  const fresh = incoming.filter((p) => !known.has(p.id));
  if (fresh.length === 0) return { series: seriesIn };
  if (new Set(fresh.map((p) => p.id)).size !== fresh.length) {
    return { series: seriesIn, error: "A player can't join a series twice." };
  }

  const joinedAtGame = seriesIn.gamesPlayed + 1;
  const size = seriesIn.players.length + fresh.length;
  const players = [
    ...seriesIn.players.map((p) => ({ ...p, placings: [...p.placings] })),
    ...fresh.map((p) => ({ ...p, wins: 0, placings: new Array(size).fill(0), joinedAtGame })),
  ];
  // Everyone's tally needs a slot for the new last place.
  players.forEach((p) => {
    while (p.placings.length < size) p.placings.push(0);
  });

  return { series: { ...seriesIn, players, games: [...seriesIn.games], updatedAt: now } };
}

/**
 * Who lost the series: whoever came last most often.
 *
 * Deliberately not "whoever won fewest games". In a five-player series
 * plenty of people win nothing, and calling all four of them the loser
 * tells you nothing — coming last is the thing everyone actually remembers.
 *
 * Ties are broken the same way the standings are, from the bottom: level on
 * last places, whoever was also second-to-last more often is the loser.
 * Null until at least one game has been played.
 */
export function seriesLoser(series: SeriesState): SeriesPlayer | null {
  if (series.gamesPlayed === 0 || series.players.length < 2) return null;
  const ranked = [...series.players].sort((a, b) => {
    const diff = lossesOf(series, b) - lossesOf(series, a);
    if (diff !== 0) return diff;
    // Walk back up the table: worse finishes count against you first.
    for (let place = series.players.length - 2; place >= 1; place--) {
      const d = (b.placings[place] ?? 0) - (a.placings[place] ?? 0);
      if (d !== 0) return d;
    }
    if (a.wins !== b.wins) return a.wins - b.wins;
    return a.name.localeCompare(b.name);
  });
  const worst = ranked[0];
  return worst && lossesOf(series, worst) > 0 ? worst : null;
}

/** Everyone tied on last places, when the wooden spoon is shared. */
export function seriesLosers(series: SeriesState): SeriesPlayer[] {
  const worst = seriesLoser(series);
  if (!worst) return [];
  const n = lossesOf(series, worst);
  return series.players.filter((p) => lossesOf(series, p) === n);
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
    const expected = playedIn(series, p);
    if (placed !== expected) {
      problems.push(
        `${p.name} is placed in ${placed} games but was at the table for ${expected}`
      );
    }
    if (joinedAt(p) < 1 || joinedAt(p) > series.gamesPlayed + 1) {
      problems.push(`${p.name} joined at game ${joinedAt(p)}, which never existed`);
    }
  }
  for (const g of series.games) {
    if (new Set(g.order).size !== g.order.length) problems.push(`game ${g.gameNumber} places a player twice`);
    // How many people were at the table *then*, not now.
    const thereThen = series.players.filter((p) => joinedAt(p) <= g.gameNumber).length;
    if (g.order.length !== thereThen) {
      problems.push(`game ${g.gameNumber} placed ${g.order.length} of ${thereThen} players`);
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
