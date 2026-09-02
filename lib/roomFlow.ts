import { supabaseAdmin } from "./supabaseAdmin";
import { createGame, resolveTrick, standings } from "./engine/rules";
import { writeResult, type HistoryPlayerInput } from "./recordResult";
import { TRICK_LINGER_MS, type RoomState } from "./roomTypes";
import { createSeries, isSeries, isValidBestOf, recordGame } from "./series/rules";

/**
 * Deals a fresh game into an existing room: same seats, new shuffle, new
 * gameId. Shared by the first deal and every rematch, so a rematch can't
 * drift away from what starting a game does.
 */
export function dealNewGame(state: RoomState, now = Date.now()): void {
  // Open the series on the first deal, once the seats are actually known.
  // Later deals reuse it — that is what makes them games 2, 3, 4 of one
  // match rather than a string of unrelated rematches.
  const bestOf = state.bestOf ?? 1;
  if (isSeries(bestOf) && !state.series) {
    state.series = createSeries({
      game: "thulla",
      bestOf,
      players: state.seats.map((seat) => ({ id: seat.id, name: seat.name })),
      now,
    });
  }

  state.game = createGame({
    players: state.seats.map((s) => ({ id: s.id, name: s.name, kind: "remote" as const })),
    config: { mode: "friends", mustLeadAceOfSpades: true },
  });
  state.status = "playing";
  state.trickEndsAt = null;
  state.resultsRecorded = false;
  state.rematchReady = [];
  state.updatedAt = now;
}

/** True when a series is running and still needs at least one more game. */
export function seriesWantsAnotherGame(state: RoomState): boolean {
  return !!state.series && state.series.status === "active";
}

/** True when the match is over — either a finished series or a single game. */
export function matchIsOver(state: RoomState): boolean {
  if (state.series) return state.series.status === "completed";
  return state.game?.phase === "finished";
}

/**
 * Locks the format in. Refused once a game has been dealt, because by then
 * the number is part of a result somebody has already played for.
 */
export function setRoomFormat(state: RoomState, bestOf: number, now = Date.now()): string | null {
  if (state.status !== "waiting" || state.series) {
    return "The format is locked once the first game is dealt.";
  }
  if (!isValidBestOf(bestOf)) {
    return "A series has to be an odd number of games — an even one can finish level.";
  }
  state.bestOf = bestOf;
  state.updatedAt = now;
  return null;
}

/**
 * Clears a finished trick once its display window has elapsed. Idempotent,
 * and safe to call from anywhere — several clients racing to resolve the
 * same trick all end up with the same state.
 */
export function maybeResolveTrick(state: RoomState, now = Date.now()): boolean {
  if (!state.game || state.game.phase !== "trickEnd") return false;
  if (state.trickEndsAt !== null && now < state.trickEndsAt) return false;

  state.game = resolveTrick(state.game);
  state.trickEndsAt = state.game.phase === "trickEnd" ? now + TRICK_LINGER_MS : null;
  if (state.game.phase === "finished") state.status = "finished";
  state.updatedAt = now;
  return true;
}

/** Marks a newly finished trick so clients know how long to hold the pile. */
export function markTrickEnd(state: RoomState, now = Date.now()) {
  if (state.game?.phase === "trickEnd") state.trickEndsAt = now + TRICK_LINGER_MS;
  else state.trickEndsAt = null;
}

/**
 * Writes one result row per human player when an online game finishes.
 *
 * This runs on the server against the room's own authoritative state — the
 * browser never submits an online result, so there is nothing to forge. The
 * unique (owner_id, game_id) constraint keeps it idempotent on top of the
 * `resultsRecorded` flag.
 */
export async function recordRoomResults(state: RoomState): Promise<void> {
  const game = state.game;
  if (!game || game.phase !== "finished" || state.resultsRecorded) return;

  const table = standings(game);
  const players: HistoryPlayerInput[] = table.map((p, position) => ({
    playerId: p.kind === "cpu" ? null : p.id,
    name: p.name,
    type: p.kind,
    position,
    result: position === 0 ? "win" : p.seat === game.thullaSeat ? "thulla" : "placed",
  }));

  const winner = table[0];
  const thulla = game.thullaSeat !== null ? game.players[game.thullaSeat] : null;
  const durationMs = Math.max(0, game.updatedAt - game.startedAt);
  const startedAt = new Date(game.startedAt).toISOString();

  await Promise.all(
    table.map((player, position) => {
      if (player.kind === "cpu") return Promise.resolve();
      return writeResult({
        gameId: game.gameId,
        ownerId: player.id,
        mode: "friends",
        playerCount: game.players.length,
        cpuDifficulty: null,
        players,
        winnerName: winner?.name ?? null,
        thullaName: thulla?.name ?? null,
        winnerId: winner && winner.kind !== "cpu" ? winner.id : null,
        thullaId: thulla && thulla.kind !== "cpu" ? thulla.id : null,
        myPosition: position,
        isWin: position === 0,
        isThulla: player.seat === game.thullaSeat,
        durationMs,
        startedAt,
      });
    })
  );

  state.resultsRecorded = true;

  // Score the game into the series from the room's own state. recordGame is
  // keyed on the game's id, so two clients reporting the same finish, or a
  // retry of this whole function, still add exactly one win.
  if (state.series) {
    const winner = table[0];
    const next = recordGame(state.series, {
      gameId: game.gameId,
      winnerId: winner ? winner.id : null,
      winnerName: winner?.name ?? null,
    });
    if (!next.error) state.series = next.series;
  }
}

export async function loadRoom(code: string): Promise<RoomState | null> {
  const { data, error } = await supabaseAdmin.from("rooms").select("state").eq("code", code).single();
  if (error || !data) return null;
  const state = data.state as RoomState;
  return state?.version === 3 ? state : null;
}

export async function saveRoom(code: string, state: RoomState): Promise<boolean> {
  const { error } = await supabaseAdmin.from("rooms").update({ state }).eq("code", code);
  return !error;
}
