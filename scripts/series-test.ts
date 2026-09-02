import {
  auditSeries,
  createSeries,
  formatLabel,
  isValidBestOf,
  recordGame,
  seriesStandings,
  winsRequired,
} from "../lib/series/rules";
import type { SeriesState } from "../lib/series/types";

let pass = 0;
let fail = 0;
function check(ok: boolean, what: string) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${what}`);
  }
}

function series(bestOf: number, names = ["Hamza", "Ahmed"]): SeriesState {
  return createSeries({
    game: "thulla",
    bestOf,
    players: names.map((n, i) => ({ id: `p${i}`, name: n })),
    now: 1_000,
  });
}

/** Plays a scripted run of winners and returns the series. */
function run(bestOf: number, winners: number[], names?: string[]) {
  let s = series(bestOf, names);
  winners.forEach((seat, i) => {
    const r = recordGame(s, {
      gameId: `g${i + 1}`,
      winnerId: `p${seat}`,
      winnerName: s.players[seat].name,
      now: 2_000 + i,
    });
    // A finished series refuses further results; that's the point of the test.
    if (!r.error) s = r.series;
  });
  return s;
}

/* ---------- wins required ---------- */
console.log("Format arithmetic");
for (const [bestOf, need] of [[1, 1], [3, 2], [5, 3], [7, 4], [9, 5], [11, 6], [13, 7], [99, 50]]) {
  check(winsRequired(bestOf) === need, `best of ${bestOf} needs ${need}, got ${winsRequired(bestOf)}`);
}
check(formatLabel(1) === "Single game", "best of 1 reads as a single game");
check(formatLabel(9) === "Best of 9 — first to 5", `best of 9 label: ${formatLabel(9)}`);
console.log(`  ${pass} passed`);

/* ---------- validation ---------- */
const before = pass;
console.log("Validation");
for (const n of [1, 3, 5, 7, 9, 11, 99]) check(isValidBestOf(n), `${n} is a valid format`);
for (const n of [0, 2, 4, 6, 8, 10, 100, 101, -3, 3.5]) {
  check(!isValidBestOf(n), `${n} is rejected`);
}
check(
  (() => {
    try {
      createSeries({ game: "bluff", bestOf: 4, players: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
      return false;
    } catch {
      return true;
    }
  })(),
  "an even best-of is refused at creation"
);
check(
  (() => {
    try {
      createSeries({ game: "bluff", bestOf: 3, players: [{ id: "a", name: "A" }, { id: "a", name: "A2" }] });
      return false;
    } catch {
      return true;
    }
  })(),
  "the same player twice is refused"
);
console.log(`  ${pass - before} passed`);

/* ---------- every scoreline that should end a series ---------- */
const b2 = pass;
console.log("Series completion");
const CASES: Array<{ bestOf: number; winners: number[]; score: [number, number]; games: number }> = [
  { bestOf: 3, winners: [0, 0], score: [2, 0], games: 2 },
  { bestOf: 3, winners: [0, 1, 0], score: [2, 1], games: 3 },
  { bestOf: 5, winners: [0, 0, 0], score: [3, 0], games: 3 },
  { bestOf: 5, winners: [0, 1, 0, 0], score: [3, 1], games: 4 },
  { bestOf: 5, winners: [0, 1, 0, 1, 0], score: [3, 2], games: 5 },
  { bestOf: 7, winners: [0, 0, 0, 0], score: [4, 0], games: 4 },
  { bestOf: 7, winners: [0, 1, 0, 0, 0], score: [4, 1], games: 5 },
  { bestOf: 7, winners: [0, 1, 0, 1, 0, 0], score: [4, 2], games: 6 },
  { bestOf: 7, winners: [0, 1, 0, 1, 0, 1, 0], score: [4, 3], games: 7 },
  { bestOf: 9, winners: [0, 0, 0, 0, 0], score: [5, 0], games: 5 },
  { bestOf: 11, winners: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0], score: [6, 4], games: 10 },
];
for (const c of CASES) {
  const s = run(c.bestOf, c.winners);
  const label = `best of ${c.bestOf} → ${c.score[0]}–${c.score[1]}`;
  check(s.status === "completed", `${label}: completed`);
  check(s.winnerId === "p0", `${label}: winner is p0`);
  check(s.players[0].wins === c.score[0], `${label}: winner has ${c.score[0]} wins`);
  check(s.players[1].wins === c.score[1], `${label}: loser has ${c.score[1]} wins`);
  check(s.gamesPlayed === c.games, `${label}: ${c.games} games played, got ${s.gamesPlayed}`);
  check(s.games.length === c.games, `${label}: ${c.games} game records kept`);
  check(auditSeries(s).length === 0, `${label}: audit clean — ${auditSeries(s).join("; ")}`);
}
console.log(`  ${pass - b2} passed`);

/* ---------- the series must NOT end early ---------- */
const b3 = pass;
console.log("Series continuation");
for (const [bestOf, winners, expectNext] of [
  [3, [0], 2],
  [5, [0, 1], 3],
  [5, [0, 1, 0], 4],
  [7, [0, 1, 0, 1, 0], 6],
] as Array<[number, number[], number]>) {
  const s = run(bestOf, winners);
  check(s.status === "active", `best of ${bestOf} after ${winners.length} games: still running`);
  check(s.currentGameNumber === expectNext, `…and the next game is #${expectNext}, got ${s.currentGameNumber}`);
  check(s.winnerId === null, "…with no winner yet");
}
console.log(`  ${pass - b3} passed`);

/* ---------- no game is created past the win ---------- */
const b4 = pass;
console.log("No games past the decider");
{
  const s = run(5, [0, 0, 0]); // 3–0, decided at game 3
  check(s.gamesPlayed === 3, "best of 5 decided 3–0 stops at 3 games");
  const late = recordGame(s, { gameId: "g4", winnerId: "p1", winnerName: "Ahmed" });
  check(!!late.error, `a fourth result is refused — "${late.error}"`);
  check(late.series.gamesPlayed === 3, "…and the series is unchanged");
  check(late.series.players[1].wins === 0, "…the loser gains nothing");
}
console.log(`  ${pass - b4} passed`);

/* ---------- double submission ---------- */
const b5 = pass;
console.log("Duplicate protection");
{
  let s = series(5);
  s = recordGame(s, { gameId: "g1", winnerId: "p0", winnerName: "Hamza" }).series;
  const again = recordGame(s, { gameId: "g1", winnerId: "p0", winnerName: "Hamza" });
  check(!again.error, "re-reporting the same game isn't an error");
  check(again.series.gamesPlayed === 1, "…and doesn't count twice");
  check(again.series.players[0].wins === 1, "…the win isn't doubled");

  // Two clients reporting the same finish at once.
  const a = recordGame(s, { gameId: "g2", winnerId: "p1", winnerName: "Ahmed" }).series;
  const b = recordGame(a, { gameId: "g2", winnerId: "p1", winnerName: "Ahmed" }).series;
  check(b.gamesPlayed === 2, "a concurrent duplicate lands once");
  check(b.games.filter((g) => g.gameId === "g2").length === 1, "…one record for that game");
  check(auditSeries(b).length === 0, "…audit clean");
}
console.log(`  ${pass - b5} passed`);

/* ---------- more than two players ---------- */
const b6 = pass;
console.log("Multiplayer");
{
  const names = ["Hamza", "Ahmed", "Ali", "Usman"];
  // 4 wins for Hamza, 2 Ahmed, 1 Ali — best of 7, first to 4.
  const s = run(7, [0, 1, 2, 0, 1, 0, 0], names);
  check(s.status === "completed", "4-player best of 7 completes");
  check(s.winnerId === "p0", "the first to four wins it");
  const table = seriesStandings(s);
  check(table[0].name === "Hamza" && table[0].wins === 4, "standings put Hamza first on 4");
  check(table[3].wins === 0, "and a player who won nothing is last");
  check(s.players.reduce((n, p) => n + p.wins, 0) === s.gamesPlayed, "wins total equals games played");
  check(auditSeries(s).length === 0, `audit clean — ${auditSeries(s).join("; ")}`);
}
console.log(`  ${pass - b6} passed`);

/* ---------- single game ---------- */
const b7 = pass;
console.log("Single game");
{
  const s = run(1, [0]);
  check(s.status === "completed", "a single game completes after one game");
  check(s.winnerId === "p0", "and its winner is the series winner");
  check(s.gamesPlayed === 1, "one game played");
  check(auditSeries(s).length === 0, "audit clean");
}
console.log(`  ${pass - b7} passed`);

/* ---------- a full record survives for history ---------- */
const b8 = pass;
console.log("History reconstruction");
{
  const s = run(5, [0, 1, 0, 0]);
  check(s.games.length === 4, "every game is kept");
  check(
    s.games.map((g) => g.gameNumber).join(",") === "1,2,3,4",
    "numbered 1..4 in order"
  );
  check(
    s.games.map((g) => g.winnerName).join(",") === "Hamza,Ahmed,Hamza,Hamza",
    "each game keeps its own winner"
  );
  const revived = JSON.parse(JSON.stringify(s)) as SeriesState;
  check(auditSeries(revived).length === 0, "survives a round trip through JSON");
  check(revived.winnerId === "p0" && revived.gamesPlayed === 4, "…with the final result intact");
}
console.log(`  ${pass - b8} passed`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
