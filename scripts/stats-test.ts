import {
  computeStats,
  winRate,
  applyFilter,
  EMPTY_STATS,
  readLocalHistory,
  saveLocalRecord,
} from "../lib/statsMath";
import type { GameRecord } from "../lib/statsMath";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

let clock = Date.parse("2026-01-01T00:00:00Z");
function game(outcome: "win" | "loss" | "thulla", mode: "cpu" | "friends" = "cpu"): GameRecord {
  clock += 60_000; // each game is later than the last
  return {
    id: `g${clock}`,
    gameId: `g${clock}`,
    mode,
    playerCount: 4,
    cpuDifficulty: "medium",
    players: [],
    winnerName: "W",
    thullaName: "B",
    myPosition: outcome === "win" ? 0 : outcome === "thulla" ? 3 : 1,
    isWin: outcome === "win",
    isThulla: outcome === "thulla",
    durationMs: 1000,
    startedAt: null,
    completedAt: new Date(clock).toISOString(),
  };
}

/* --- New user --- */
const empty = computeStats([]);
check("new user stats", empty, EMPTY_STATS);
check("new user win rate is null (not NaN/0)", winRate(empty), null);

/* --- A single win --- */
const oneWin = computeStats([game("win")]);
check("1 win: games", oneWin.games, 1);
check("1 win: wins", oneWin.wins, 1);
check("1 win: losses", oneWin.losses, 0);
check("1 win: rate", winRate(oneWin), 100);
check("1 win: current streak", oneWin.currentWinStreak, 1);
check("1 win: best streak", oneWin.bestWinStreak, 1);

/* --- Win then loss: streak resets, best is kept --- */
const winThenLoss = computeStats([game("win"), game("loss")]);
check("win,loss: games", winThenLoss.games, 2);
check("win,loss: losses", winThenLoss.losses, 1);
check("win,loss: current win streak resets", winThenLoss.currentWinStreak, 0);
check("win,loss: current loss streak", winThenLoss.currentLossStreak, 1);
check("win,loss: best streak survives", winThenLoss.bestWinStreak, 1);

/* --- Thulla counts as a loss and resets the streak --- */
const withThulla = computeStats([game("win"), game("thulla")]);
check("thulla: counted", withThulla.thulla, 1);
check("thulla: is a loss", withThulla.losses, 1);
check("thulla: resets win streak", withThulla.currentWinStreak, 0);

/* --- Streak arithmetic over a longer record --- */
const seq = ["win", "win", "win", "loss", "win", "win", "thulla", "win"] as const;
const long = computeStats(seq.map((o) => game(o)));
check("long: games", long.games, 8);
check("long: wins", long.wins, 6);
check("long: losses", long.losses, 2);
check("long: thulla", long.thulla, 1);
check("long: best win streak", long.bestWinStreak, 3);
check("long: current win streak (last game was a win)", long.currentWinStreak, 1);
check("long: win rate 1dp", winRate(long), 75);

/* --- Best streak never decreases as games are added --- */
let running = [game("win"), game("win"), game("win"), game("win")];
const peak = computeStats(running).bestWinStreak;
running = [...running, game("loss"), game("loss")];
check("best streak never decreases", computeStats(running).bestWinStreak, peak);

/* --- Win rate rounding to one decimal --- */
const mixed = computeStats([...Array(29).fill(0).map(() => game("win")), ...Array(18).fill(0).map(() => game("loss"))]);
check("47 games / 29 wins", mixed.games, 47);
check("win rate rounds to 1dp", winRate(mixed), 61.7);

/* --- Mode split --- */
const modes = computeStats([game("win", "cpu"), game("loss", "friends"), game("win", "friends")]);
check("cpu games", modes.cpuGames, 1);
check("friend games", modes.friendGames, 2);

/* --- Filters --- */
const records = [game("win", "cpu"), game("loss", "friends"), game("thulla", "cpu")];
check("filter all", applyFilter(records, "all").length, 3);
check("filter wins", applyFilter(records, "wins").length, 1);
check("filter losses", applyFilter(records, "losses").length, 2);
check("filter thulla", applyFilter(records, "thulla").length, 1);
check("filter cpu", applyFilter(records, "cpu").length, 2);
check("filter friends", applyFilter(records, "friends").length, 1);

/* --- Order independence: input order must not change the answer --- */
const shuffled = [...records].reverse();
check("filters are order-independent", applyFilter(shuffled, "wins").length, 1);
const a = computeStats(records);
const b = computeStats([...records].reverse());
check("computeStats sorts by date, not array order", JSON.stringify(a), JSON.stringify(b));

/* --- Idempotent recording: the guard against duplicate results --- */
// Minimal localStorage stand-in so the real store code runs under Node.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

const payload = {
  gameId: "dup-check-1",
  mode: "cpu" as const,
  playerCount: 4,
  cpuDifficulty: "medium" as const,
  players: [],
  winnerName: "You",
  thullaName: "Chacha",
  myPosition: 0,
  isWin: true,
  isThulla: false,
  durationMs: 1234,
  startedAt: null,
};

saveLocalRecord(payload);
check("recording once stores one record", readLocalHistory().length, 1);
saveLocalRecord(payload);
saveLocalRecord(payload);
check("re-recording the same gameId is a no-op", readLocalHistory().length, 1);
check("stats see exactly one game", computeStats(readLocalHistory()).games, 1);

// A rematch is a different gameId, so it must add a row.
saveLocalRecord({ ...payload, gameId: "dup-check-2", isWin: false });
check("a new gameId adds a record", readLocalHistory().length, 2);
const s2 = computeStats(readLocalHistory());
check("rematch counted separately", [s2.games, s2.wins, s2.losses], [2, 1, 1]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
