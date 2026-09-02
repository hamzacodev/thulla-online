"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyClaim,
  callBluff as engineCallBluff,
  claimRejection,
  concedeBluff,
  createBluffGame,
  nextChallenger,
  passChallenge,
  resolveReveal,
} from "./rules";
import { bluffThinkingDelay, chooseClaim, shouldCallBluff } from "./ai";
import type { BluffDifficulty, BluffState } from "./types";
import type { Rank } from "./cards";
import { SPEED_FACTOR, type Speed } from "../settings";
import { readLocal } from "../localKeys";

export interface BluffSeatSetup {
  id: string;
  name: string;
  kind: "human" | "cpu";
}

export type BluffEvent =
  | { type: "shuffle" }
  | { type: "deal" }
  | { type: "claim"; seat: number; count: number; rank: Rank }
  | { type: "challenge"; seat: number }
  | { type: "caught"; seat: number; pile: number }
  | { type: "survived"; seat: number; pile: number }
  | { type: "out"; seat: number }
  | { type: "finished"; winnerSeat: number | null };

export type BluffStage = "shuffling" | "dealing" | "table";

const SAVE_KEY = "thulla.bluff.game.v1";

interface Saved {
  state: BluffState;
  savedAt: number;
}

/**
 * Drives a single-player Bluff game: deals it, paces the CPUs, and walks the
 * challenge window one seat at a time.
 *
 * The same single-scheduler discipline as Thulla's local game — every
 * automatic step is a timer owned by one effect and torn down on cleanup, so
 * a re-render can't leave two timers racing to take the same turn.
 */
export function useBluffGame(options: {
  seats: BluffSeatSetup[];
  deckCount: number;
  difficulty: BluffDifficulty;
  speed: Speed;
  onEvent?: (e: BluffEvent) => void;
}) {
  const { seats, deckCount, difficulty, speed, onEvent } = options;

  const [state, setState] = useState<BluffState | null>(null);
  const [stage, setStage] = useState<BluffStage>("shuffling");
  const [notice, setNotice] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const next = createBluffGame({
      players: seats,
      config: { deckCount, difficulty, mode: "cpu" },
    });
    setState(next);
    setNotice(null);
    setStage("shuffling");
    emit.current?.({ type: "shuffle" });
    // Shuffle, then deal, then play. More decks, slightly longer shuffle.
    introTimer.current = setTimeout(() => {
      setStage("dealing");
      emit.current?.({ type: "deal" });
      introTimer.current = setTimeout(() => setStage("table"), scale(1300));
    }, scale(900 + deckCount * 350));
  }, [seats, deckCount, difficulty, scale]);

  /** Deal once the caller actually has a table, or resume a saved one. */
  const seatKey = `${deckCount}|${difficulty}|${seats.map((s) => `${s.kind}:${s.name}`).join(",")}`;
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
          s.config.deckCount === deckCount &&
          s.players.every((p, i) => p.name === seats[i].name && p.kind === seats[i].kind)
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
  }, [seatKey, seats, deckCount, start]);

  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() } satisfies Saved));
    } catch {
      /* storage full or unavailable — the game still plays */
    }
  }, [state]);

  const humanSeat = state?.players.findIndex((p) => p.kind === "human") ?? -1;
  const pendingChallenger = state ? nextChallenger(state) : null;
  const awaitingHuman = pendingChallenger !== null && pendingChallenger === humanSeat;

  /**
   * The one scheduler. Reveals resolve on a timer; CPU turns and CPU
   * challenge decisions each take a beat. A human's turn schedules nothing —
   * it waits for them.
   */
  useEffect(() => {
    clearTimer();
    if (!state || stage !== "table" || state.phase === "finished") return;

    if (state.phase === "reveal") {
      const outcome = state.outcome;
      timer.current = setTimeout(() => {
        if (outcome) {
          emit.current?.(
            outcome.caught
              ? { type: "caught", seat: outcome.claimSeat, pile: outcome.pileSize }
              : { type: "survived", seat: outcome.challengerSeat, pile: outcome.pileSize }
          );
        }
        setState((prev) => {
          if (!prev || prev.phase !== "reveal") return prev;
          const before = new Set(prev.finishOrder);
          const next = resolveReveal(prev);
          next.finishOrder.filter((s) => !before.has(s)).forEach((s) => emit.current?.({ type: "out", seat: s }));
          if (next.phase === "finished") emit.current?.({ type: "finished", winnerSeat: next.winnerSeat });
          return next;
        });
      }, scale(2100));
      return clearTimer;
    }

    if (state.phase === "challenge") {
      const seat = nextChallenger(state);
      if (seat === null) return;
      if (state.players[seat].kind !== "cpu") return; // the human decides for themselves

      timer.current = setTimeout(() => {
        setState((prev) => {
          if (!prev || prev.phase !== "challenge") return prev;
          const s = nextChallenger(prev);
          if (s === null || prev.players[s].kind !== "cpu") return prev;
          if (shouldCallBluff(prev, s, difficulty)) {
            emit.current?.({ type: "challenge", seat: s });
            const res = engineCallBluff(prev, s);
            return res.error ? prev : res.state;
          }
          const res = passChallenge(prev, s);
          if (res.error) return prev;
          const before = new Set(prev.finishOrder);
          res.state.finishOrder.filter((x) => !before.has(x)).forEach((x) => emit.current?.({ type: "out", seat: x }));
          if (res.state.phase === "finished") {
            emit.current?.({ type: "finished", winnerSeat: res.state.winnerSeat });
          }
          return res.state;
        });
      }, scale(700 + Math.random() * 500));
      return clearTimer;
    }

    // claiming
    const player = state.players[state.turnSeat];
    if (player?.kind !== "cpu") return;
    timer.current = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase !== "claiming") return prev;
        const seat = prev.turnSeat;
        if (prev.players[seat]?.kind !== "cpu") return prev;
        const decision = chooseClaim(prev, seat, difficulty);
        if (!decision) return prev;
        const res = applyClaim(prev, seat, decision.cardIds, decision.rank);
        if (res.error) return prev;
        emit.current?.({ type: "claim", seat, count: decision.cardIds.length, rank: decision.rank });
        const before = new Set(prev.finishOrder);
        res.state.finishOrder.filter((x) => !before.has(x)).forEach((x) => emit.current?.({ type: "out", seat: x }));
        if (res.state.phase === "finished") {
          emit.current?.({ type: "finished", winnerSeat: res.state.winnerSeat });
        }
        return res.state;
      });
    }, scale(bluffThinkingDelay(difficulty)));

    return clearTimer;
  }, [state, stage, difficulty, scale]);

  useEffect(
    () => () => {
      clearTimer();
      clearIntro();
    },
    []
  );

  /** The human plays. Returns an error string when the play isn't legal. */
  const play = useCallback(
    (cardIds: string[], rank: Rank): string | null => {
      if (!state) return "Hold on.";
      const seat = state.turnSeat;
      if (state.players[seat]?.kind !== "human") return "Not your turn yet — thoda sabar!";
      const problem = claimRejection(state, seat, cardIds, rank);
      if (problem) return problem;

      const res = applyClaim(state, seat, cardIds, rank);
      if (res.error) return res.error;
      emit.current?.({ type: "claim", seat, count: cardIds.length, rank });
      setState(res.state);
      return null;
    },
    [state]
  );

  const call = useCallback(() => {
    if (!state || !awaitingHuman || humanSeat < 0) return;
    emit.current?.({ type: "challenge", seat: humanSeat });
    const res = engineCallBluff(state, humanSeat);
    if (!res.error) setState(res.state);
  }, [state, awaitingHuman, humanSeat]);

  const letItGo = useCallback(() => {
    if (!state || !awaitingHuman || humanSeat < 0) return;
    const res = passChallenge(state, humanSeat);
    if (res.error) return;
    const before = new Set(state.finishOrder);
    res.state.finishOrder.filter((s) => !before.has(s)).forEach((s) => emit.current?.({ type: "out", seat: s }));
    if (res.state.phase === "finished") emit.current?.({ type: "finished", winnerSeat: res.state.winnerSeat });
    setState(res.state);
  }, [state, awaitingHuman, humanSeat]);

  const quit = useCallback(() => {
    setState((prev) => (prev && humanSeat >= 0 ? concedeBluff(prev, humanSeat) : prev));
  }, [humanSeat]);

  const rematch = useCallback(() => {
    clearSavedBluffGame();
    start();
  }, [start]);

  return {
    state,
    stage,
    notice,
    setNotice,
    humanSeat,
    awaitingHuman,
    pendingChallenger,
    isMyTurn: !!state && state.phase === "claiming" && state.turnSeat === humanSeat,
    play,
    call,
    letItGo,
    quit,
    rematch,
  };
}

export function clearSavedBluffGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}
