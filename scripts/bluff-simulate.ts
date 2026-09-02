import {
  applyClaim,
  auditBluff,
  bluffStandings,
  callBluff,
  challengers,
  concedeBluff,
  createBluffGame,
  passChallenge,
  resolveReveal,
} from "../lib/bluff/rules";
import { chooseClaim, shouldCallBluff } from "../lib/bluff/ai";
import { buildShoe, cardsForDecks } from "../lib/bluff/cards";
import type { BluffDifficulty, BluffState } from "../lib/bluff/types";

interface Report {
  games: number;
  stuck: number;
  illegal: number;
  audits: string[];
  noWinner: number;
  badRanking: number;
  maxTurns: number;
  challenges: number;
  caught: number;
}

/** Plays one game out with every seat driven by the CPU. */
function playOne(players: number, decks: number, difficulty: BluffDifficulty, seed: number, rep: Report) {
  let state = createBluffGame({
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      kind: "cpu" as const,
    })),
    config: { deckCount: decks, difficulty, seed },
  });

  const dealt = state.players.reduce((n, p) => n + p.hand.length, 0);
  if (dealt !== cardsForDecks(decks)) {
    rep.audits.push(`${players}p/${decks}d seed ${seed}: dealt ${dealt}, expected ${cardsForDecks(decks)}`);
  }

  let turns = 0;
  const LIMIT = 6000;
  while (state.phase !== "finished" && turns++ < LIMIT) {
    const problems = auditBluff(state);
    if (problems.length) {
      rep.audits.push(`${players}p/${decks}d seed ${seed}: ${problems[0]}`);
      break;
    }

    if (state.phase === "reveal") {
      state = resolveReveal(state);
      continue;
    }

    if (state.phase === "challenge") {
      const waiting = challengers(state).filter((s) => !state.claim!.passed.includes(s));
      if (waiting.length === 0) {
        rep.stuck++;
        break;
      }
      const seat = waiting[0];
      if (shouldCallBluff(state, seat, difficulty)) {
        rep.challenges++;
        const res = callBluff(state, seat);
        if (res.error) {
          rep.illegal++;
          break;
        }
        if (res.state.outcome?.caught) rep.caught++;
        state = res.state;
      } else {
        const res = passChallenge(state, seat);
        if (res.error) {
          rep.illegal++;
          break;
        }
        state = res.state;
      }
      continue;
    }

    // claiming
    const decision = chooseClaim(state, state.turnSeat, difficulty);
    if (!decision) {
      rep.stuck++;
      break;
    }
    const res = applyClaim(state, state.turnSeat, decision.cardIds, decision.rank);
    if (res.error) {
      rep.illegal++;
      rep.audits.push(`${players}p/${decks}d seed ${seed}: illegal claim — ${res.error}`);
      break;
    }
    state = res.state;
  }

  rep.games++;
  rep.maxTurns = Math.max(rep.maxTurns, turns);
  if (turns >= LIMIT) rep.stuck++;

  if (state.phase === "finished") {
    if (state.winnerSeat === null) rep.noWinner++;
    const table = bluffStandings(state);
    if (table.length !== players || new Set(state.finishOrder).size !== players) rep.badRanking++;
    const final = auditBluff(state);
    if (final.length) rep.audits.push(`${players}p/${decks}d seed ${seed}: final — ${final[0]}`);
  }
}

let failures = 0;

/* ---------- deck construction ---------- */
console.log("Deck sizes");
for (const decks of [1, 2, 3]) {
  const shoe = buildShoe(decks);
  const ids = new Set(shoe.map((c) => c.id));
  const expected = cardsForDecks(decks);
  const uniqueIds = ids.size === shoe.length;
  const aces = shoe.filter((c) => c.rank === "A" && c.suit === "S").length;
  const ok = shoe.length === expected && uniqueIds && aces === decks;
  if (!ok) failures++;
  console.log(
    `  ${decks} deck${decks > 1 ? "s" : ""}: ${shoe.length} cards (expected ${expected}) · ` +
      `unique ids: ${uniqueIds} · A♠ copies: ${aces} ${ok ? "✓" : "✗"}`
  );
}

/* ---------- full games ---------- */
const GAMES = Number(process.argv[2] ?? 60);
console.log("\nGames");
for (const difficulty of ["easy", "medium", "hard"] as BluffDifficulty[]) {
  for (const decks of [1, 2, 3]) {
    for (const players of [2, 3, 4, 6, 8]) {
      const rep: Report = {
        games: 0, stuck: 0, illegal: 0, audits: [], noWinner: 0,
        badRanking: 0, maxTurns: 0, challenges: 0, caught: 0,
      };
      for (let s = 0; s < GAMES; s++) {
        playOne(players, decks, difficulty, s * 7919 + players * 31 + decks * 7 + 1, rep);
      }
      const bad = rep.stuck + rep.illegal + rep.noWinner + rep.badRanking + rep.audits.length;
      failures += bad;
      console.log(
        `  ${difficulty.padEnd(6)} ${players}p ${decks}d  games=${rep.games} stuck=${rep.stuck} ` +
          `illegal=${rep.illegal} noWinner=${rep.noWinner} badRank=${rep.badRanking} ` +
          `maxTurns=${rep.maxTurns} challenges=${rep.challenges} caught=${rep.caught}`
      );
      for (const a of rep.audits.slice(0, 2)) console.log(`     ! ${a}`);
    }
  }
}

/* ---------- one challenge per play, and it belongs to the next player ---------- */
console.log("\nChallenge rule");
let ruleBad = 0;
const rule = (ok: boolean, why: string) => {
  if (!ok) {
    ruleBad++;
    if (ruleBad <= 6) console.log(`   ! ${why}`);
  }
};

for (const players of [2, 3, 4, 6, 8]) {
  for (let seed = 0; seed < 30; seed++) {
    let s = createBluffGame({
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "cpu" as const })),
      config: { deckCount: (seed % 3) + 1, seed: seed * 17 + players },
    });
    const claimer = s.turnSeat;
    const d = chooseClaim(s, claimer, "medium");
    if (!d) continue;
    const played = applyClaim(s, claimer, d.cardIds, d.rank);
    if (played.error) continue;
    s = played.state;
    if (s.phase !== "challenge") continue;

    const next = (claimer + 1) % players;
    rule(challengers(s).length === 1, `${players}p/${seed}: ${challengers(s).length} players could challenge, expected 1`);
    rule(challengers(s)[0] === next, `${players}p/${seed}: challenger is ${challengers(s)[0]}, expected ${next}`);

    // Everybody else must be refused, in both directions.
    for (let k = 2; k < players; k++) {
      const other = (claimer + k) % players;
      rule(!!callBluff(s, other).error, `${players}p/${seed}: seat ${other} was allowed to call BLUFF`);
      rule(!!passChallenge(s, other).error, `${players}p/${seed}: seat ${other} was allowed to pass`);
    }

    const after = passChallenge(s, next);
    rule(!after.error, `${players}p/${seed}: the next player couldn't pass`);
    rule(after.state.phase !== "challenge", `${players}p/${seed}: passing didn't settle the claim`);
    if (after.state.phase === "claiming") {
      rule(after.state.turnSeat === next, `${players}p/${seed}: the passer didn't get the turn`);
    }
    // And it can never be reopened.
    for (let k = 2; k < players; k++) {
      const other = (claimer + k) % players;
      rule(!!callBluff(after.state, other).error, `${players}p/${seed}: seat ${other} challenged an accepted play`);
    }
  }
}
failures += ruleBad;
console.log(`  150 claims across 2/3/4/6/8 players — ${ruleBad} failures`);

/* ---------- conceding ---------- */
console.log("\nConceding");
let concedeBad = 0;
for (const players of [2, 4, 6]) {
  for (let trial = 0; trial < 60; trial++) {
    let state: BluffState = createBluffGame({
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "cpu" as const })),
      config: { deckCount: (trial % 3) + 1, seed: trial * 13 + players },
    });
    for (let step = 0; step < trial % 25 && state.phase !== "finished"; step++) {
      if (state.phase === "reveal") { state = resolveReveal(state); continue; }
      if (state.phase === "challenge") {
        const waiting = challengers(state).filter((s) => !state.claim!.passed.includes(s));
        if (!waiting.length) break;
        state = passChallenge(state, waiting[0]).state;
        continue;
      }
      const d = chooseClaim(state, state.turnSeat, "medium");
      if (!d) break;
      const r = applyClaim(state, state.turnSeat, d.cardIds, d.rank);
      if (r.error) break;
      state = r.state;
    }
    if (state.phase === "finished") continue;
    const quitter = state.players.find((p) => p.hand.length > 0)!.seat;
    const after = concedeBluff(state, quitter);
    const table = bluffStandings(after);
    if (after.phase !== "finished") concedeBad++;
    if (table[table.length - 1].seat !== quitter) concedeBad++;
    if (new Set(after.finishOrder).size !== players) concedeBad++;
  }
}
failures += concedeBad;
console.log(`  180 concessions across 2/4/6 players — ${concedeBad} failures`);

console.log(failures === 0 ? "\nALL BLUFF CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
