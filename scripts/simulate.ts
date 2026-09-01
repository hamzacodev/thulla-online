import { createGame, applyPlay, resolveTrick, legalMoves, auditState, standings } from "../lib/engine/rules";
import { chooseCard } from "../lib/engine/ai";
import { ACE_OF_SPADES } from "../lib/engine/cards";
import type { Difficulty, GameState } from "../lib/engine/types";

interface Report {
  games: number;
  stuck: number;
  audits: string[];
  illegal: number;
  noThulla: number;
  aceStartWrong: number;
  cardsLost: number;
  firstTrickThulla: number;
  maxTricks: number;
  winsBySeat: Record<number, number>;
  thullaBySeat: Record<number, number>;
}

function playOne(count: number, difficulty: Difficulty, seed: number, rep: Report): void {
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    kind: "cpu" as const,
  }));
  let state: GameState = createGame({ players, config: { seed, difficulty } });

  // The A♠ holder must be the opening leader, and must be forced to lead it.
  const aceHolder = state.players.findIndex((p) => p.hand.includes(ACE_OF_SPADES));
  if (state.turnSeat !== aceHolder || state.mustPlay !== ACE_OF_SPADES) rep.aceStartWrong++;

  // Every one of the 52 cards must be dealt exactly once.
  const dealt = state.players.flatMap((p) => p.hand);
  if (new Set(dealt).size !== 52 || dealt.length !== 52) rep.cardsLost++;

  let guard = 0;
  const limit = 20000;
  while (state.phase !== "finished" && guard++ < limit) {
    if (state.phase === "trickEnd") {
      state = resolveTrick(state);
      const problems = auditState(state);
      if (problems.length) rep.audits.push(`n=${count} seed=${seed}: ${problems.join("; ")}`);
      continue;
    }
    const seat = state.turnSeat;
    const legal = legalMoves(state, seat);
    if (legal.length === 0) {
      rep.audits.push(`n=${count} seed=${seed}: no legal moves for seat ${seat}`);
      break;
    }
    const card = chooseCard(state, seat, difficulty);
    if (!card || !legal.includes(card)) {
      rep.illegal++;
      break;
    }
    const res = applyPlay(state, seat, card);
    if (res.error) {
      rep.illegal++;
      rep.audits.push(`n=${count} seed=${seed}: engine rejected AI move ${card}: ${res.error}`);
      break;
    }
    state = res.state;

    // House rule: the opening trick is a free round, so it must never
    // produce a pickup no matter who turns out to be void in spades.
    if (state.trickNumber === 1 && state.trickOutcome?.kind === "pickup") {
      rep.firstTrickThulla++;
    }
  }

  rep.games++;
  rep.maxTricks = Math.max(rep.maxTricks, state.trickNumber);
  if (state.phase !== "finished") {
    rep.stuck++;
    rep.audits.push(`n=${count} seed=${seed}: STUCK after ${guard} steps at trick ${state.trickNumber}`);
    return;
  }
  if (state.thullaSeat === null) rep.noThulla++;

  const table = standings(state);
  if (table.length !== count) rep.audits.push(`n=${count} seed=${seed}: standings had ${table.length} of ${count}`);
  if (new Set(state.finishOrder).size !== state.finishOrder.length) {
    rep.audits.push(`n=${count} seed=${seed}: duplicate seat in finishOrder`);
  }
  const winner = table[0].seat;
  rep.winsBySeat[winner] = (rep.winsBySeat[winner] ?? 0) + 1;
  if (state.thullaSeat !== null) {
    rep.thullaBySeat[state.thullaSeat] = (rep.thullaBySeat[state.thullaSeat] ?? 0) + 1;
  }
}

const GAMES_PER = Number(process.argv[2] ?? 300);
let totalFail = 0;

for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
  for (let count = 2; count <= 8; count++) {
    const rep: Report = {
      games: 0, stuck: 0, audits: [], illegal: 0, noThulla: 0,
      aceStartWrong: 0, cardsLost: 0, firstTrickThulla: 0, maxTricks: 0, winsBySeat: {}, thullaBySeat: {},
    };
    for (let s = 0; s < GAMES_PER; s++) playOne(count, difficulty, s * 7919 + count * 13 + 1, rep);
    const bad =
      rep.stuck + rep.illegal + rep.aceStartWrong + rep.cardsLost + rep.firstTrickThulla + rep.audits.length;
    totalFail += bad;
    const spread = Object.entries(rep.thullaBySeat).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(
      `${difficulty.padEnd(6)} ${count}p  games=${rep.games} stuck=${rep.stuck} illegal=${rep.illegal} ` +
      `aceBad=${rep.aceStartWrong} dealBad=${rep.cardsLost} t1thulla=${rep.firstTrickThulla} noThulla=${rep.noThulla} ` +
      `maxTricks=${rep.maxTricks}  thullaBySeat[${spread}]`
    );
    for (const a of rep.audits.slice(0, 3)) console.log(`   ! ${a}`);
  }
}
console.log(totalFail === 0 ? "\nALL CHECKS PASSED" : `\n${totalFail} FAILURES`);
process.exit(totalFail === 0 ? 0 : 1);
