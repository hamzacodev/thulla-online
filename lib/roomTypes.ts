import type { GameState } from "./engine/types";
import type { SeriesState } from "./series/types";

export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomSeat {
  /** Supabase auth user id. */
  id: string;
  name: string;
  seat: number;
  connected: boolean;
}

/**
 * What's stored in `rooms.state`. The lobby and the game are kept separate:
 * `game` is exactly the same engine state a single-player game uses, so one
 * rule set and one renderer serve both modes.
 */
export interface RoomState {
  version: 3;
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  hostId: string;
  seats: RoomSeat[];
  game: GameState | null;
  /**
   * When a finished trick may be cleared. Clients show the completed pile
   * until this passes, then any of them can call resolve-trick — and a
   * later play-card resolves it anyway, so the room can't wedge if
   * everybody closes their tab.
   */
  trickEndsAt: number | null;
  /** Set once results have been written, so they're never written twice. */
  resultsRecorded: boolean;
  /**
   * User ids who've asked for another game once this one finished. The deal
   * happens on its own when everyone seated has asked, so a rematch doesn't
   * depend on the host still having the tab open. Optional so rooms created
   * before it existed still load.
   */
  rematchReady?: string[];
  /**
   * The match format the host has chosen. 1 is a single game. Editable in
   * the lobby, and read-only from the first deal onwards — once a series has
   * started, changing how long it is would change a result already earned.
   */
  bestOf?: number;
  /**
   * The running series, created with the first deal. Lives in the room's
   * state, which only the server's own API routes ever write, so the score
   * is authoritative — a client can't award itself a game.
   */
  series?: SeriesState;
  createdAt: number;
  updatedAt: number;
}

export const TRICK_LINGER_MS = 1800;

export function isRoomState(value: unknown): value is RoomState {
  return !!value && typeof value === "object" && (value as RoomState).version === 3;
}

/**
 * Where a player is sitting *at the table*, which is not their lobby chair.
 *
 * `seats` are lobby chairs: they're handed out in join order and never move.
 * The table order is shuffled on every deal, so that the same person doesn't
 * lead every game of a series. Those two numbers agree only by coincidence.
 *
 * Every screen already derives its view from `game.players`; this exists so
 * the server does the same, in one place. Reading `seats[].seat` and handing
 * it to the engine looks right and is wrong roughly five times in six at a
 * three-player table — it told the player holding the ace it wasn't their
 * turn, on the opening lead of a match.
 *
 * Returns -1 when there is no game, or the player isn't in it.
 */
export function tableSeatOf(state: RoomState, userId: string): number {
  if (!state.game) return -1;
  return state.game.players.findIndex((p) => p.id === userId);
}
