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
