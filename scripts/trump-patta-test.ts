/**
 * Trump-Patta — rules, and the things a client must never be able to do.
 *
 * The second half is the point. Trump-Patta is the first game here whose
 * rules depend on secrecy: if the player picking from you can be spoofed, or
 * a spectator can read your hand out of a payload, the game doesn't work.
 * So the privacy checks below are written as attacks — "player C tries to
 * read A's hand", "a client claims a pick that isn't its turn" — and a
 * passing run means the attack failed.
 */
import "./_env";

import {
  auditState,
  cardsInPlay,
  createGame,
  extractPairs,
  MAX_PLAYERS,
  MIN_PLAYERS,
  nextActiveSeat,
  pickCard,
  redactFor,
  reorderHand,
  resolvePick,
  standings,
} from "../lib/trumpPatta/rules";
import { arrangeHand, chooseCard } from "../lib/trumpPatta/ai";
import { freshDeck, rankOf, type Card } from "../lib/engine/cards";
import { createSeries, recordGame, winsRequired } from "../lib/series/rules";
import type { TrumpPattaState } from "../lib/trumpPatta/types";

let pass = 0;
let fail = 0;
function check(ok: boolean, what: string) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${what}`);
  }
}

function deal(count = 4, seed = 7): TrumpPattaState {
  return createGame({
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      kind: i === 0 ? ("human" as const) : ("cpu" as const),
    })),
    config: { seed, difficulty: "medium", playerCount: count },
  });
}

// ---- deck ---------------------------------------------------------------

{
  const deck = freshDeck();
  check(deck.length === 52, "a deck is 52 cards");
  check(new Set(deck).size === 52, "every card in the deck is unique");
}

for (let seed = 1; seed <= 60; seed++) {
  const s = deal(4, seed);
  const held = s.players.flatMap((p) => p.hand);
  const discarded = s.discards.flat();
  const all = [...held, ...discarded, s.removedCard];
  check(all.length === 52, `seed ${seed}: 51 dealt + 1 removed = 52`);
  check(new Set(all).size === 52, `seed ${seed}: no card is dealt twice`);
  check(!held.includes(s.removedCard), `seed ${seed}: the removed card is dealt to nobody`);
  check(!discarded.includes(s.removedCard), `seed ${seed}: the removed card is never discarded`);
  check(held.length + discarded.length === 51, `seed ${seed}: all 51 cards are distributed`);
}

// ---- pairs --------------------------------------------------------------

{
  const cases: Array<[Card[], number, string]> = [
    [["7S", "7H"], 1, "7♠ + 7♥ is a pair"],
    [["QC", "QD"], 1, "Q♣ + Q♦ is a pair"],
    [["AS", "AH"], 1, "A♠ + A♥ is a pair"],
    [["7S", "8H"], 0, "7♠ + 8♥ is not a pair"],
    [["QC", "KD"], 0, "Q♣ + K♦ is not a pair"],
    [["7S", "7H", "7D"], 1, "three of a rank makes one pair and keeps the odd card"],
    [["7S", "7H", "7D", "7C"], 2, "four of a rank makes two pairs"],
  ];
  for (const [hand, pairs, what] of cases) {
    check(extractPairs(hand).pairs.length === pairs, what);
  }
  check(extractPairs(["7S", "7H"]).hand.length === 0, "both cards of a pair leave the hand");
  check(
    extractPairs(["7S", "7H", "7D"]).hand.length === 1,
    "the odd third card stays behind"
  );
}

// Pair removal must not quietly re-sort what's left.
{
  const hand: Card[] = ["9C", "7S", "KD", "7H", "2S"];
  const { hand: left } = extractPairs(hand);
  check(left.join(",") === "9C,KD,2S", "the survivors keep the player's order");
}

// ---- ordering -----------------------------------------------------------

{
  const s = deal(4, 11);
  const mine = [...s.players[0].hand];
  const reversed = [...mine].reverse();
  const r = reorderHand(s, 0, reversed);
  check(!r.error, "a player may rearrange their own hand");
  check(r.state.players[0].hand.join(",") === reversed.join(","), "the new order is kept exactly");

  // Attacks on the reorder endpoint.
  check(!!reorderHand(s, 0, [...mine, "AS"]).error, "a client cannot add a card by 'reordering'");
  check(!!reorderHand(s, 0, mine.slice(1)).error, "a client cannot drop a card by 'reordering'");
  const swapped = [...mine];
  swapped[0] = s.players[1].hand[0];
  check(
    !!reorderHand(s, 0, swapped).error,
    "a client cannot swap in a card from somebody else's hand"
  );
}

// The order survives everything the game does to a hand.
{
  let s = deal(4, 13);
  const picker = s.pickerSeat;
  const chosen: Card[] = [...s.players[picker].hand].reverse();
  s = reorderHand(s, picker, chosen).state;
  const before = s.players[picker].hand.join(",");

  const donorHand = [...s.players[s.donorSeat].hand];
  const r = pickCard(s, picker, 1);
  check(!r.error, "the picker may take a card");
  s = r.state;

  const after = s.players[picker].hand;
  const kept = after.filter((c) => chosen.includes(c));
  const survived = chosen.filter((c) => after.includes(c));
  check(kept.join(",") === survived.join(","), "receiving a card leaves the arrangement alone");
  check(before !== "" && donorHand.length > 0, "the donor had a hand to show");

  const taken = donorHand[0];
  check(!s.players[s.outcome!.donorSeat].hand.includes(taken), "the card leaves the donor");
  const wentToPicker = after.includes(taken) || s.outcome!.paired !== null;
  check(wentToPicker, "the card arrives with the picker, or leaves as a pair");
}

// ---- turn order and empty hands ----------------------------------------

{
  const s = deal(4, 17);
  check(s.donorSeat !== s.pickerSeat, "nobody picks from themselves");
  check(s.players[s.donorSeat].hand.length > 0, "the opening donor has cards");

  const empty = deal(4, 19);
  empty.players[1].hand = [];
  check(nextActiveSeat(empty, 0) === 2, "an empty hand is skipped when finding the next player");
  empty.players[2].hand = [];
  empty.players[3].hand = [];
  check(nextActiveSeat(empty, 0) === null, "with nobody else holding cards there is no next player");
}

// ---- privacy: the whole point ------------------------------------------

{
  const s = deal(5, 23);
  const donor = s.donorSeat;
  const picker = s.pickerSeat;
  const bystander = s.players.find((p) => p.seat !== donor && p.seat !== picker)!.seat;

  const asPicker = redactFor(s, picker);
  check(
    asPicker.players[donor].hand === undefined,
    "even the picker is not sent the donor's cards — the pick is blind"
  );
  check(
    asPicker.players[donor].cardCount === s.players[donor].hand.length,
    "the picker is told how many cards there are, which is all they need"
  );
  check(!!asPicker.players[picker].hand, "the picker can see their own hand");

  const asBystander = redactFor(s, bystander);
  check(
    asBystander.players[donor].hand === undefined,
    "a bystander is not sent the donor's hand"
  );
  check(
    asBystander.players[picker].hand === undefined,
    "a bystander is not sent the picker's hand"
  );
  check(!!asBystander.players[bystander].hand, "a bystander can still see their own hand");
  check(
    asBystander.players[donor].cardCount === s.players[donor].hand.length,
    "a bystander is told how many cards, which is public"
  );

  const asDonor = redactFor(s, donor);
  check(!!asDonor.players[donor].hand, "the donor can see their own hand");
  check(
    asDonor.players[picker].hand === undefined,
    "the donor cannot see the hand of the player picking from them"
  );

  // The whole rule, stated once: your own hand and nobody else's.
  for (const seat of s.players.map((p) => p.seat)) {
    const view = redactFor(s, seat);
    const visible = view.players.filter((p) => p.hand !== undefined).map((p) => p.seat);
    check(
      visible.length === 1 && visible[0] === seat,
      `seat ${seat} is sent exactly one hand — their own`
    );
  }

  const spectator = redactFor(s, -1);
  check(
    spectator.players.every((p) => p.hand === undefined),
    "a spectator gets no hands at all"
  );

  // The hidden card, and the serialised payload as a whole.
  for (const seat of [donor, picker, bystander, -1]) {
    const view = redactFor(s, seat);
    check(view.removedCard === null, `seat ${seat} is not told the hidden card`);
    check(view.remainingCard === null, `seat ${seat} is not told the last card early`);
    const wire = JSON.stringify(view);
    check(!wire.includes(s.removedCard) || s.players.some((p) => p.hand.includes(s.removedCard)),
      `the hidden card does not appear anywhere in seat ${seat}'s payload`);
  }

  // No payload may contain a card belonging to somebody else — not in a
  // field we forgot, not in the outcome, not in a stray copy. Checked for
  // every seat against every other seat's hand.
  for (const viewer of s.players.map((p) => p.seat)) {
    const wire = JSON.stringify(redactFor(s, viewer));
    const others = s.players.filter((p) => p.seat !== viewer).flatMap((p) => p.hand);
    const leaked = others.filter((c) => wire.includes(`"${c}"`));
    check(leaked.length === 0, `seat ${viewer}'s payload leaks nobody else's cards (${leaked})`);
  }
}

// Once the game is over there is nothing left to hide.
{
  let s = deal(3, 29);
  let guard = 0;
  while (s.phase !== "finished" && guard++ < 5000) {
    if (s.phase === "reveal") { s = resolvePick(s); continue; }
    s = pickCard(s, s.pickerSeat, chooseCard(redactFor(s, s.pickerSeat), "medium")).state;
  }
  check(s.phase === "finished", "the game finishes");
  const view = redactFor(s, 2);
  check(view.removedCard === s.removedCard, "the hidden card is revealed at the end");
  check(view.remainingCard === s.remainingCard, "the last card is revealed at the end");
  check(
    rankOf(s.remainingCard!) === rankOf(s.removedCard),
    "the last card matches the rank of the removed one"
  );
  check(s.thiefSeat !== null, "somebody is the Thief");
  check(standings(s)[standings(s).length - 1].seat === s.thiefSeat, "the Thief comes last");
}

// A pick between two other players must not tell you what changed hands.
//
// This is the case the leak checks above missed for a while: they all ran on
// a freshly dealt game, where there is no outcome to leak. The card was
// being handed to every seat in `outcome`, so watching two CPUs trade told
// you exactly what they traded.
{
  for (let seed = 60; seed < 90; seed++) {
    let s = deal(5, seed);
    // Walk into a reveal.
    for (let guard = 0; guard < 200 && s.phase !== "reveal"; guard++) {
      if (s.phase === "finished") break;
      s = pickCard(s, s.pickerSeat, chooseCard(redactFor(s, s.pickerSeat), "medium")).state;
    }
    if (s.phase !== "reveal" || !s.outcome) continue;

    const { pickerSeat, donorSeat, card, paired } = s.outcome;
    for (const viewer of s.players.map((p) => p.seat)) {
      const view = redactFor(s, viewer);
      const involved = viewer === pickerSeat || viewer === donorSeat;
      check(
        involved ? view.outcome?.card === card : view.outcome?.card === undefined,
        `seed ${seed}: seat ${viewer} ${involved ? "sees" : "is not told"} the card that moved`
      );
      // Position and participants stay public — that much is visible at any
      // real table.
      check(view.outcome?.fromPosition === s.outcome.fromPosition, "the position is public");
      check(view.outcome?.pickerSeat === pickerSeat, "who picked is public");

      // And the card must not sneak through anywhere else in the payload.
      if (!involved && !paired) {
        const wire = JSON.stringify(view);
        check(!wire.includes(`"${card}"`), `seed ${seed}: seat ${viewer}'s payload hides the card`);
      }
    }

    // A discarded pair is the exception, and deliberately so: it goes
    // face-up into the public pile, so everyone is entitled to it.
    if (paired) {
      const view = redactFor(s, s.players.find((p) => p.seat !== pickerSeat && p.seat !== donorSeat)!.seat);
      check(view.outcome?.paired?.join(",") === paired.join(","), "a discarded pair is public");
    }
  }
}

// ---- picking: what a client may not do ---------------------------------

{
  const s = deal(4, 31);
  const donor = s.donorSeat;
  const picker = s.pickerSeat;
  const other = s.players.find((p) => p.seat !== picker)!.seat;

  check(!!pickCard(s, other, 1).error, "a player who isn't the picker cannot pick");
  check(!!pickCard(s, picker, 0).error, "position 0 is rejected");
  check(!!pickCard(s, picker, -1).error, "a negative position is rejected");
  check(
    !!pickCard(s, picker, s.players[donor].hand.length + 1).error,
    "a position past the end of the hand is rejected"
  );
  check(
    !!pickCard(s, picker, 1, "XX").error,
    "a pick naming a card that isn't in that slot is rejected"
  );
  check(!pickCard(s, picker, 1, s.players[donor].hand[0]).error, "naming the right card is fine");

  // Two picks for one turn: the second must not land.
  const first = pickCard(s, picker, 1);
  check(!first.error, "the first pick succeeds");
  const second = pickCard(first.state, picker, 1);
  check(!!second.error, "a second pick in the same turn is refused");
  check(first.state.phase === "reveal", "a completed pick leaves the game mid-reveal");
  check(
    cardsInPlay(first.state) === cardsInPlay(s) || cardsInPlay(first.state) === cardsInPlay(s) - 2,
    "a pick either moves a card or removes a pair — never anything else"
  );
}

// A CPU is handed a redacted view, so it cannot cheat even if it wanted to.
{
  const s = deal(4, 37);
  const view = redactFor(s, s.pickerSeat);
  check(view.removedCard === null, "the CPU's view contains no hidden card");
  const visible = view.players.filter((p) => p.hand !== undefined).map((p) => p.seat);
  check(
    visible.length === 1 && visible[0] === s.pickerSeat,
    "the CPU sees exactly one hand: its own"
  );
  const position = chooseCard(view, "hard");
  check(
    position >= 1 && position <= s.players[s.donorSeat].hand.length,
    "the CPU picks a real position"
  );

  // Blind means blind: over many deals a CPU must not do better than chance
  // at avoiding the card it would least like. If it ever did, it would mean
  // it was reading something it shouldn't be.
  const spread = new Map<number, number>();
  for (let i = 0; i < 4000; i++) {
    const pos = chooseCard(view, "hard");
    spread.set(pos, (spread.get(pos) ?? 0) + 1);
  }
  const donorCards = s.players[s.donorSeat].hand.length;
  check(spread.size === donorCards, "the CPU picks from every position, not a favourite one");
  const expected = 4000 / donorCards;
  check(
    [...spread.values()].every((n) => Math.abs(n - expected) < expected * 0.35),
    "and picks them about evenly, because it cannot see the faces"
  );
}

// A CPU arranging its hand must not give anything away by doing it.
{
  const s = deal(4, 43);
  const view = redactFor(s, 1);
  const hand = s.players[1].hand;
  const arranged = arrangeHand(hand, view, "hard");
  check(arranged.length === hand.length, "arranging keeps every card");
  check(
    [...arranged].sort().join(",") === [...hand].sort().join(","),
    "arranging invents and loses nothing"
  );
  const sorted = [...hand].sort().join(",");
  check(arranged.join(",") !== sorted || hand.length < 3, "a CPU doesn't leave its hand sorted");
}

// ---- player counts ------------------------------------------------------

for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
  const s = deal(n, 41 + n);
  const total = cardsInPlay(s) + s.discards.length * 2;
  check(total === 51, `${n} players: all 51 cards are dealt`);
  check(auditState(s).length === 0, `${n} players: the opening position is sound`);
}
check(!!(() => { try { deal(1); return false; } catch { return true; } })(), "1 player is refused");
check(!!(() => { try { deal(9); return false; } catch { return true; } })(), "9 players is refused");

// ---- series -------------------------------------------------------------

{
  check(winsRequired(3) === 2, "best of 3 needs 2 wins");
  check(winsRequired(5) === 3, "best of 5 needs 3 wins");
  check(winsRequired(7) === 4, "best of 7 needs 4 wins");
  check(winsRequired(9) === 5, "best of 9 needs 5 wins");
  check(winsRequired(11) === 6, "best of 11 needs 6 wins");

  // A Trump-Patta series, scored the way the platform scores every game:
  // the finishing order, best first, with the Thief last.
  let series = createSeries({
    game: "trump_patta",
    bestOf: 5,
    players: [
      { id: "a", name: "Hamza" },
      { id: "b", name: "Ahmed" },
      { id: "c", name: "Ali" },
    ],
  });
  const play = (order: string[], n: number) => {
    series = recordGame(series, { gameId: `g${n}`, order }).series;
  };
  play(["a", "b", "c"], 1);
  play(["b", "a", "c"], 2);
  play(["a", "c", "b"], 3);
  play(["b", "c", "a"], 4);
  check(series.status === "active", "best of 5 is still live at 2–2");
  play(["a", "b", "c"], 5);
  check(series.status === "completed", "reaching 3 wins completes the series");
  check(series.winnerId === "a", "the right player wins the series");
  check(series.games.length === 5, "five games are recorded");

  // Early completion: a 3–0 must not play games 4 and 5.
  let sweep = createSeries({
    game: "trump_patta",
    bestOf: 5,
    players: [{ id: "a", name: "Hamza" }, { id: "b", name: "Ahmed" }],
  });
  for (let i = 1; i <= 3; i++) {
    sweep = recordGame(sweep, { gameId: `s${i}`, order: ["a", "b"] }).series;
  }
  check(sweep.status === "completed", "3–0 completes a best of 5");
  check(sweep.gamesPlayed === 3, "only three games are played");
  const extra = recordGame(sweep, { gameId: "s4", order: ["b", "a"] });
  check(!!extra.error, "a finished series refuses another game");
  check(extra.series.gamesPlayed === 3, "and does not record it");

  // The Thief of a game is not the loser of the series.
  const thiefOfGame3 = series.games[2].order[2];
  check(thiefOfGame3 === "b", "game 3's Thief is Ahmed");
  check(series.winnerId === "a", "which says nothing about who won the series");
}

// ---- surviving a refresh ------------------------------------------------

// The hook saves the whole state to localStorage, so what actually has to
// survive is a JSON round trip: the hand order the player chose, and the
// public discard pile.
{
  let s = deal(4, 53);
  const mine = [...s.players[0].hand].reverse();
  s = reorderHand(s, 0, mine).state;

  // Play a few turns so there is a discard pile worth checking.
  let guard = 0;
  while (s.phase !== "finished" && guard++ < 6) {
    if (s.phase === "reveal") { s = resolvePick(s); continue; }
    s = pickCard(s, s.pickerSeat, chooseCard(redactFor(s, s.pickerSeat), "medium")).state;
  }

  const revived = JSON.parse(JSON.stringify(s)) as TrumpPattaState;
  check(
    revived.players.every((p, i) => p.hand.join(",") === s.players[i].hand.join(",")),
    "every hand comes back from storage in the same order"
  );
  check(
    revived.discards.map((d) => d.join("+")).join(",") ===
      s.discards.map((d) => d.join("+")).join(","),
    "the public discard pile survives a refresh"
  );
  check(revived.removedCard === s.removedCard, "the hidden card survives a refresh");
  check(auditState(revived).length === 0, "the revived game is still sound");

  // And the numbering is derived from the order, so it follows it back.
  const owner = revived.players.find((p) => p.hand.length > 1)!;
  check(
    owner.hand.every((c, i) => revived.players[owner.seat].hand[i] === c),
    "position numbers still name the same cards after a refresh"
  );
}

// Pair removal renumbers without reshuffling: the survivors keep their order.
{
  const before: Card[] = ["9C", "7S", "KD", "KC", "2S"];
  const { hand: after, pairs } = extractPairs(before);
  check(pairs.length === 1, "the kings pair off");
  check(after.join(",") === "9C,7S,2S", "positions 1, 2 and 5 become 1, 2 and 3 in order");
}

// ---- a full game, audited at every step --------------------------------

for (const n of [2, 3, 4, 6, 8]) {
  let s = deal(n, 101 + n);
  let guard = 0;
  let problems = 0;
  while (s.phase !== "finished" && guard++ < 20_000) {
    if (s.phase === "reveal") {
      s = resolvePick(s);
      problems += auditState(s).length;
      continue;
    }
    const res = pickCard(s, s.pickerSeat, chooseCard(redactFor(s, s.pickerSeat), "hard"));
    if (res.error) { problems++; break; }
    s = res.state;
    problems += auditState(s).length;
  }
  check(s.phase === "finished", `${n} players: the game reaches an end`);
  check(problems === 0, `${n} players: every position along the way is sound`);
  check(cardsInPlay(s) === 1, `${n} players: exactly one card is left`);
  check(standings(s).length === n, `${n} players: everyone is placed`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
