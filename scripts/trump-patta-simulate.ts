/**
 * Trump-Patta, played headlessly, a great many times.
 *
 * Two things need proving and neither is obvious from reading the rules.
 *
 * The first is that the game *ends*. Cards leave only in pairs, and a pick
 * that doesn't make a pair just moves a card sideways — so a table could in
 * principle push the same cards round forever. It doesn't, and the reason is
 * worth writing down: every rank except the hidden card's has an even number
 * of copies in play, hands never keep a pair, so a pair is always split
 * across two hands waiting to be reunited.
 *
 * The second is that no card is ever lost or duplicated. `auditState` checks
 * all 52 after every single move, which is the check that would catch a card
 * being handed over without being taken away.
 */
import { chooseCard } from "../lib/trumpPatta/ai";
import {
  auditState,
  cardsInPlay,
  createGame,
  pickCard,
  redactFor,
  resolvePick,
  standings,
} from "../lib/trumpPatta/rules";
import { rankOf } from "../lib/engine/cards";
import type { TrumpPattaDifficulty } from "../lib/trumpPatta/types";

interface Report {
  games: number;
  stuck: number;
  illegal: number;
  audits: string[];
  wrongThief: number;
  noThief: number;
  maxTurns: number;
  totalTurns: number;
  thiefBySeat: Record<number, number>;
}

function playOne(count: number, difficulty: TrumpPattaDifficulty, seed: number, rep: Report) {
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    kind: "cpu" as const,
  }));

  let state = createGame({ players, config: { seed, difficulty, playerCount: count } });
  rep.games++;

  const opening = auditState(state);
  if (opening.length) rep.audits.push(`n=${count} seed=${seed} deal: ${opening.join("; ")}`);

  // 51 cards dealt, minus the pairs thrown away immediately.
  const dealtAndDiscarded = cardsInPlay(state) + state.discards.length * 2;
  if (dealtAndDiscarded !== 51) {
    rep.audits.push(`n=${count} seed=${seed}: ${dealtAndDiscarded} cards dealt, not 51`);
  }

  let guard = 0;
  const limit = 20_000;
  while (state.phase !== "finished" && guard++ < limit) {
    if (state.phase === "reveal") {
      state = resolvePick(state);
      const problems = auditState(state);
      if (problems.length) rep.audits.push(`n=${count} seed=${seed}: ${problems.join("; ")}`);
      continue;
    }

    // The CPU decides from the same redacted view a human would get.
    const view = redactFor(state, state.pickerSeat);
    const position = chooseCard(view, difficulty);
    const res = pickCard(state, state.pickerSeat, position);
    if (res.error) {
      rep.illegal++;
      break;
    }
    state = res.state;
    const problems = auditState(state);
    if (problems.length) rep.audits.push(`n=${count} seed=${seed}: ${problems.join("; ")}`);
  }

  if (state.phase !== "finished") {
    rep.stuck++;
    return;
  }

  rep.maxTurns = Math.max(rep.maxTurns, state.turnNumber);
  rep.totalTurns += state.turnNumber;

  if (state.thiefSeat === null) rep.noThief++;
  else {
    rep.thiefBySeat[state.thiefSeat] = (rep.thiefBySeat[state.thiefSeat] ?? 0) + 1;
    // The Thief must hold exactly one card, and it must be the partner of
    // the card pulled out before the deal.
    const thief = state.players[state.thiefSeat];
    if (
      thief.hand.length !== 1 ||
      rankOf(thief.hand[0]) !== rankOf(state.removedCard) ||
      state.remainingCard !== thief.hand[0]
    ) {
      rep.wrongThief++;
    }
  }

  // Everybody else got out, and the standings put the Thief last.
  const table = standings(state);
  if (table.length !== count) rep.audits.push(`n=${count} seed=${seed}: standings lost a player`);
  if (state.thiefSeat !== null && table[table.length - 1].seat !== state.thiefSeat) {
    rep.audits.push(`n=${count} seed=${seed}: the Thief isn't last in the standings`);
  }
}

function run(count: number, difficulty: TrumpPattaDifficulty, games: number): Report {
  const rep: Report = {
    games: 0,
    stuck: 0,
    illegal: 0,
    audits: [],
    wrongThief: 0,
    noThief: 0,
    maxTurns: 0,
    totalTurns: 0,
    thiefBySeat: {},
  };
  for (let seed = 1; seed <= games; seed++) playOne(count, difficulty, seed, rep);
  return rep;
}

let failed = false;
for (const difficulty of ["easy", "medium", "hard"] as TrumpPattaDifficulty[]) {
  for (const count of [2, 3, 4, 5, 6, 8]) {
    const rep = run(count, difficulty, 200);
    const spread = Object.entries(rep.thiefBySeat)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([s, n]) => `${s}:${n}`)
      .join(" ");
    const bad = rep.stuck || rep.illegal || rep.audits.length || rep.wrongThief || rep.noThief;
    if (bad) failed = true;
    console.log(
      `${difficulty.padEnd(6)} ${String(count).padStart(2)}p ` +
        `games=${rep.games} stuck=${rep.stuck} illegal=${rep.illegal} ` +
        `wrongThief=${rep.wrongThief} noThief=${rep.noThief} ` +
        `avgTurns=${(rep.totalTurns / rep.games).toFixed(1)} maxTurns=${rep.maxTurns} ` +
        `thiefBySeat[${spread}]`
    );
    rep.audits.slice(0, 5).forEach((a) => console.log(`   ! ${a}`));
  }
}

console.log(failed ? "\nTRUMP-PATTA CHECKS FAILED" : "\nALL TRUMP-PATTA CHECKS PASSED");
process.exit(failed ? 1 : 0);
