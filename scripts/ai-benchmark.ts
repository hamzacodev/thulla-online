import { createGame, applyPlay, resolveTrick, standings } from "../lib/engine/rules";
import { chooseCard } from "../lib/engine/ai";
import type { Difficulty, GameState } from "../lib/engine/types";

/** Seat i plays with difficulty mix[i]. Returns finishing place per seat. */
function play(mix: Difficulty[], seed: number): number[] {
  const players = mix.map((_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "cpu" as const }));
  let state: GameState = createGame({ players, config: { seed } });
  let guard = 0;
  while (state.phase !== "finished" && guard++ < 20000) {
    if (state.phase === "trickEnd") { state = resolveTrick(state); continue; }
    const seat = state.turnSeat;
    const card = chooseCard(state, seat, mix[seat]);
    if (!card) break;
    const r = applyPlay(state, seat, card);
    if (r.error) break;
    state = r.state;
  }
  const order = standings(state).map((p) => p.seat);
  return mix.map((_, seat) => order.indexOf(seat));
}

// Rotate the difficulty assignment through every seat so seat bias cancels out.
function headToHead(a: Difficulty, b: Difficulty, count: number, games: number) {
  let aThulla = 0, bThulla = 0, aAvg = 0, bAvg = 0, aN = 0, bN = 0;
  for (let g = 0; g < games; g++) {
    const mix: Difficulty[] = Array.from({ length: count }, (_, i) => ((i + g) % 2 === 0 ? a : b));
    const places = play(mix, g * 104729 + count);
    const last = count - 1;
    for (let s = 0; s < count; s++) {
      if (mix[s] === a) { aAvg += places[s]; aN++; if (places[s] === last) aThulla++; }
      else { bAvg += places[s]; bN++; if (places[s] === last) bThulla++; }
    }
  }
  const pct = (x: number, n: number) => ((x / n) * 100).toFixed(1);
  console.log(
    `${count}p  ${a.padEnd(6)} vs ${b.padEnd(6)}  ` +
    `thulla-rate ${a}=${pct(aThulla, aN)}%  ${b}=${pct(bThulla, bN)}%  ` +
    `| avg place ${a}=${(aAvg / aN).toFixed(2)} ${b}=${(bAvg / bN).toFixed(2)} (lower=better)`
  );
}

const GAMES = Number(process.argv[2] ?? 400);
for (const n of [2, 4, 6]) headToHead("hard", "easy", n, GAMES);
for (const n of [2, 4, 6]) headToHead("medium", "easy", n, GAMES);
for (const n of [2, 4, 6]) headToHead("hard", "medium", n, GAMES);
