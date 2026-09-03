"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  concede,
  createGame,
  pickCard,
  redactFor,
  reorderHand,
  resolvePick,
} from "./rules";
import { arrangeHand, chooseCard } from "./ai";
import type { TrumpPattaDifficulty, TrumpPattaState } from "./types";
import { SPEED_FACTOR, type Speed } from "../settings";
import { readLocal } from "../localKeys";
import { shuffle, type Card } from "../engine/cards";

export interface TrumpPattaSeatSetup {
  id: string;
  name: string;
  kind: "human" | "cpu";
}

export type TrumpPattaEvent =
  | { type: "shuffle" }
  | { type: "deal" }
  | { type: "pick"; donorSeat: number; pickerSeat: number; card: Card; byHuman: boolean }
  | { type: "pair"; seat: number; cards: [Card, Card] }
  | { type: "out"; seat: number }
  | { type: "finished"; thiefSeat: number | null };

export type TrumpPattaStage = "shuffling" | "dealing" | "table";

const SAVE_KEY = "thulla.trump_patta.game.v1";

interface Saved {
  state: TrumpPattaState;
  savedAt: number;
}

export function clearSavedTrumpPattaGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Drives a single-player Trump-Patta game.
 *
 * The same single-scheduler discipline as the other two: every automatic
 * step is a timer owned by one effect and torn down on cleanup, so a
 * re-render can't leave two timers racing to take the same turn.
 *
 * The one thing worth noticing is how the CPU is asked to move. It is handed
 * `redactFor(state, seat)` — the identical view a human in that chair would
 * be sent — rather than the real state. That isn't politeness: it is the
 * only way to be sure a CPU can't read the hidden card or a hand it has no
 * business seeing, because those fields aren't in what it receives.
 */
export function useTrumpPattaGame(options: {
  seats: TrumpPattaSeatSetup[];
  difficulty: TrumpPattaDifficulty;
  speed: Speed;
  onEvent?: (e: TrumpPattaEvent) => void;
}) {
  const { seats, difficulty, speed, onEvent } = options;

  const [state, setState] = useState<TrumpPattaState | null>(null);
  const [stage, setStage] = useState<TrumpPattaStage>("shuffling");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announced = useRef<TrumpPattaState["outcome"] | null>(null);
  const emit = useRef(onEvent);

  useEffect(() => {
    emit.current = onEvent;
  });

  const factor = SPEED_FACTOR[speed];
  const scale = useCallback((ms: number) => Math.round(ms * factor), [factor]);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const clearIntro = () => {
    if (introTimer.current) clearTimeout(introTimer.current);
    introTimer.current = null;
  };

  const start = useCallback(() => {
    if (seats.length < 2) return;
    clearTimer();
    clearIntro();
    announced.current = null;

    // A fresh arrangement every deal: seats move, identities don't.
    const dealt = createGame({
      players: shuffle(seats),
      config: { difficulty, mode: "cpu", playerCount: seats.length },
    });

    // Every CPU arranges its own hand once, up front. A player's order is
    // their own business and nothing re-sorts it afterwards — but a CPU has
    // to start from *some* arrangement, and leaving it in deal order would
    // quietly tell the table where its cards came from.
    dealt.players.forEach((p) => {
      if (p.kind === "cpu") p.hand = arrangeHand(p.hand, redactFor(dealt, p.seat), difficulty);
    });

    setState(dealt);
    setStage("shuffling");
    emit.current?.({ type: "shuffle" });
    introTimer.current = setTimeout(() => {
      setStage("dealing");
      emit.current?.({ type: "deal" });
      introTimer.current = setTimeout(() => setStage("table"), scale(1300));
    }, scale(900));
  }, [seats, difficulty, scale]);

  const seatKey = `${difficulty}|${seats.map((s) => `${s.kind}:${s.name}`).join(",")}`;
  const initialisedFor = useRef<string | null>(null);

  useEffect(() => {
    if (seats.length < 2) return;
    if (initialisedFor.current === seatKey) return;
    initialisedFor.current = seatKey;

    try {
      const raw = readLocal(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        const s = saved?.state;
        if (
          s?.version === 1 &&
          s.players.length === seats.length &&
          s.players.every((p) => seats.some((x) => x.name === p.name && x.kind === p.kind))
        ) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- resumes a saved game from localStorage, unavailable during render
          setState(s);
          setStage("table");
          return;
        }
      }
    } catch {
      /* corrupt save — deal a fresh one */
    }
    start();
  }, [seatKey, seats, start]);

  // Saving the whole state is what makes a refresh mid-game harmless: the
  // hand, its order, the discards and whose turn it is all come back.
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() } satisfies Saved));
    } catch {
      /* storage full or unavailable — the game still plays */
    }
  }, [state]);

  const humanSeat = state?.players.findIndex((p) => p.kind === "human") ?? -1;
  const isMyTurn = !!state && state.phase === "picking" && state.pickerSeat === humanSeat;

  /** The one scheduler: reveals clear themselves, CPU picks take a beat. */
  useEffect(() => {
    clearTimer();
    if (!state || stage !== "table" || state.phase === "finished") return;

    if (state.phase === "reveal") {
      const outcome = state.outcome;
      // Narrate as the card turns over, not as the table moves on.
      if (outcome && announced.current !== outcome) {
        announced.current = outcome;
        emit.current?.({
          type: "pick",
          donorSeat: outcome.donorSeat,
          pickerSeat: outcome.pickerSeat,
          card: outcome.card,
          byHuman: outcome.pickerSeat === humanSeat,
        });
        if (outcome.paired) {
          emit.current?.({ type: "pair", seat: outcome.pickerSeat, cards: outcome.paired });
        }
        if (outcome.donorWentOut) emit.current?.({ type: "out", seat: outcome.donorSeat });
      }

      // Your own pick waits for you. The card was face-down when you chose
      // it, so the only moment you ever get to see what you took is now —
      // and having it whisked away on a timer is what made the game
      // impossible to follow. A CPU's pick still clears itself.
      if (outcome && outcome.pickerSeat === humanSeat) return;

      timer.current = setTimeout(() => {
        setState((prev) => {
          if (!prev || prev.phase !== "reveal") return prev;
          const before = new Set(prev.safeOrder);
          const next = resolvePick(prev);
          next.safeOrder
            .filter((s) => !before.has(s))
            .forEach((s) => emit.current?.({ type: "out", seat: s }));
          if (next.phase === "finished") {
            emit.current?.({ type: "finished", thiefSeat: next.thiefSeat });
          }
          return next;
        });
        // Longer when a pair came out, so both cards are actually readable
        // before they go.
      }, scale(state.outcome?.paired ? 1600 : 1000));
      return clearTimer;
    }

    // A human's turn schedules nothing — it waits for them.
    const picker = state.players[state.pickerSeat];
    if (picker?.kind !== "cpu") return;

    timer.current = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase !== "picking") return prev;
        const seat = prev.pickerSeat;
        if (prev.players[seat]?.kind !== "cpu") return prev;
        // The redacted view: the CPU decides on what it is entitled to know.
        // Blind: the CPU is told how many cards the donor has, not what
        // they are. Same information a human in this seat gets.
        const position = chooseCard(redactFor(prev, seat), difficulty);
        if (position < 1) return prev;
        const res = pickCard(prev, seat, position);
        if (res.error) return prev;

        // Having taken a card, it decides where to put it — the one real
        // choice in the game, and it belongs to whoever owns the hand.
        const after = res.state;
        const me = after.players[seat];
        if (me.kind === "cpu" && me.hand.length > 1) {
          me.hand = arrangeHand(me.hand, redactFor(after, seat), difficulty);
        }
        return after;
      });
    }, scale(700 + Math.random() * 700));

    return clearTimer;
  }, [state, stage, difficulty, humanSeat, scale]);

  useEffect(
    () => () => {
      clearTimer();
      clearIntro();
    },
    []
  );

  /** The human takes a card. `position` is 1-based, as drawn. */
  const pick = useCallback(
    (position: number): string | null => {
      if (!state) return "Hold on.";
      if (!isMyTurn) return "Not your turn yet — thoda sabar!";
      const donor = state.players[state.donorSeat];
      const res = pickCard(state, humanSeat, position, donor?.hand[position - 1]);
      if (res.error) return res.error;
      setState(res.state);
      return null;
    },
    [state, isMyTurn, humanSeat]
  );

  /**
   * Done looking at what you took — carry on.
   *
   * Only meaningful during your own reveal; every other transition is on a
   * timer. This is the button that makes the turn yours to end.
   */
  const confirm = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.phase !== "reveal") return prev;
      const before = new Set(prev.safeOrder);
      const next = resolvePick(prev);
      next.safeOrder
        .filter((s) => !before.has(s))
        .forEach((s) => emit.current?.({ type: "out", seat: s }));
      if (next.phase === "finished") {
        emit.current?.({ type: "finished", thiefSeat: next.thiefSeat });
      }
      return next;
    });
  }, []);

  /** The human rearranges their own hand. Nothing else may. */
  const reorder = useCallback(
    (order: Card[]) => {
      setState((prev) => {
        if (!prev || humanSeat < 0) return prev;
        const res = reorderHand(prev, humanSeat, order);
        return res.error ? prev : res.state;
      });
    },
    [humanSeat]
  );

  const quit = useCallback(() => {
    setState((prev) => (prev && humanSeat >= 0 ? concede(prev, humanSeat) : prev));
  }, [humanSeat]);

  const rematch = useCallback(() => {
    clearSavedTrumpPattaGame();
    start();
  }, [start]);

  return {
    state,
    stage,
    humanSeat,
    isMyTurn,
    /** True while your own pick is on the table waiting to be acknowledged. */
    awaitingConfirm:
      state?.phase === "reveal" && state.outcome?.pickerSeat === humanSeat,
    pick,
    confirm,
    reorder,
    quit,
    rematch,
  };
}
