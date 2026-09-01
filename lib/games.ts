import type { Card } from "./engine/cards";

/**
 * The catalogue.
 *
 * One list, and the Games page renders whatever is in it — adding a game is
 * an entry here plus its own pages, not a redesign. Everything that is only
 * true of one game (its rules, its table, its statistics) lives under that
 * game's own route; this file holds only what the platform needs in order to
 * list it and link to it.
 *
 * Deliberately not a plugin system. There is one playable game today and a
 * couple of ideas; a registry of data is the right size for that, and the
 * shape can grow when a second game actually arrives.
 */

export type GameId = "thulla" | "bluff" | "teen-patti";

export type GameStatus = "available" | "coming-soon";

export interface GameDefinition {
  id: GameId;
  /** What the game is called on a card and in a heading. */
  name: string;
  /** The other name people know it by, shown underneath. */
  subtitle: string;
  /** One sentence, for the games list. */
  blurb: string;
  /** A line of desi flavour, used on the game's own hub. */
  hook: string;
  emoji: string;
  /** e.g. "Trick-taking" — the shelf it belongs on. */
  kind: string;
  minPlayers: number;
  maxPlayers: number;
  status: GameStatus;
  /** The game's hub. Only present once a game is playable. */
  href?: string;
  /** Three cards, fanned as the artwork on its card. */
  art: [Card, Card, Card];
  /**
   * Ways straight into this game from the shelf, skipping the hub. Whatever
   * modes a game has are its own business, so they ride in the registry
   * rather than being hard-coded into the row that renders them.
   */
  quickPlay?: Array<{ href: string; label: string; icon: string }>;
}

export const GAMES: GameDefinition[] = [
  {
    id: "thulla",
    name: "Thulla",
    subtitle: "Thulla",
    blurb:
      "Follow the suit, dodge the pile. Last one holding cards is the Thulla.",
    hook: "Dekhte hain aaj Thulla kis ko parta hai!",
    emoji: "🃏",
    kind: "Trick-taking",
    minPlayers: 2,
    maxPlayers: 8,
    status: "available",
    href: "/games/thulla",
    art: ["AS", "KH", "QD"],
    quickPlay: [
      { href: "/games/thulla/play?mode=cpu", label: "vs Computer", icon: "🤖" },
      {
        href: "/games/thulla/play?mode=friends",
        label: "With Friends",
        icon: "👥",
      },
    ],
  },
  {
    id: "bluff",
    name: "Bluff",
    subtitle: "Jhoot / Bluff",
    blurb: "Say what you played. Nobody has to believe you.",
    hook: "Sach bolo ya jhoot — pakre gaye to gaye.",
    emoji: "🎭",
    kind: "Bluffing",
    minPlayers: 3,
    maxPlayers: 8,
    status: "coming-soon",
    art: ["7C", "7D", "2S"],
  },
  {
    id: "teen-patti",
    name: "3 Patti",
    subtitle: "Teen Patti",
    blurb: "Three cards each, and a lot of nerve.",
    hook: "Teen patte, poora drama.",
    emoji: "♠️",
    kind: "Betting",
    minPlayers: 3,
    maxPlayers: 6,
    status: "coming-soon",
    art: ["AH", "AC", "AD"],
  },
];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export const playableGames = () =>
  GAMES.filter((g) => g.status === "available");

/** How a game is described in one line: "Trick-taking · 2–8 players". */
export function gameMeta(game: GameDefinition): string {
  const players =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}–${game.maxPlayers} players`;
  return `${game.kind} · ${players}`;
}

/**
 * The game a stored result belongs to.
 *
 * Every result recorded so far is a Thulla result, and `game_results` has no
 * game column yet, so this is where that assumption is written down once
 * rather than being scattered through the stats and history screens. When a
 * second game ships, this reads the column instead and nothing above it has
 * to change.
 */
export const DEFAULT_GAME_ID: GameId = "thulla";
