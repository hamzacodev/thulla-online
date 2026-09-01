"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chooseCard, thinkingDelay } from "./engine/ai";
import { MIN_PLAYERS, applyPlay, createGame, legalMoves, rejectionReason, resolveTrick } from "./engine/rules";
import type { Difficulty, EnginePlayer, GameState } from "./engine/types";
import type { Card } from "./engine/cards";
import { SPEED_FACTOR, type Speed } from "./settings";
import { readLocal } from "./localKeys";

const SAVE_KEY = "thulla.localgame.v3";

export type Stage = "shuffling" | "dealing" | "table";

export interface LocalGameOptions {
  seats: Array<Pick<EnginePlayer, "id" | "name" | "kind">>;
  difficulty: Difficulty;
  speed: Speed;
  /** Skip the shuffle/deal cinematic (animations turned off). */
  instant?: boolean;
  onEvent?: (event: LocalGameEvent) => void;
}

export type LocalGameEvent =
  | { type: "shuffle" }
  | { type: "deal" }
  | { type: "play"; seat: number; card: Card }
  | { type: "trickWon"; seat: number }
  | { type: "pickup"; seat: number; count: number }
  | { type: "out"; seat: number }
  | { type: "finished"; thullaSeat: number | null };

interface Saved {
  state: GameState;
  savedAt: number;
}

export function useLocalGame(options: LocalGameOptions) {
  const { seats, difficulty, speed, instant, onEvent } = options;
  const [state, setState] = useState<GameState | null>(null);
  const [stage, setStage] = useState<Stage>("shuffling");
  const [invalid, setInvalid] = useState<{ card: Card; nth: number } | null>(null);

  // Two independent timelines: the opening shuffle/deal cinematic, and the
  // in-game scheduler. They need separate handles — the scheduler clears its
  // timer on every state change, which would otherwise kill the intro.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidCount = useRef(0);
  const emit = useRef(onEvent);
  // Kept in a ref so the scheduler doesn't re-run whenever the caller passes
  // a new closure. Assigned in an effect — writing a ref during render is
  // unsafe under concurrent rendering.
  useEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

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

  /** Fresh deal with the same seats — used for both first start and rematch. */
  const start = useCallback(() => {
    if (seats.length < MIN_PLAYERS) return;
    clearTimer();
    clearIntro();
    const next = createGame({
      players: seats,
      config: { difficulty, mustLeadAceOfSpades: true, mode: "cpu" },
    });
    setState(next);
    setInvalid(null);
    invalidCount.current = 0;

    if (instant) {
      setStage("table");
      return;
    }
    setStage("shuffling");
    emit.current?.({ type: "shuffle" });
    introTimer.current = setTimeout(() => {
      setStage("dealing");
      emit.current?.({ type: "deal" });
      introTimer.current = setTimeout(() => setStage("table"), scale(1200));
    }, scale(1500));
  }, [seats, difficulty, instant, scale]);

  /**
   * Restore an interrupted game, or deal a new one — but only once the
   * caller actually has a table. The seats arrive a tick after mount (they
   * come from localStorage), so this waits for them rather than dealing to
   * an empty table.
   */
  const seatKey = seats.map((s) => `${s.kind}:${s.name}`).join("|");
  const initialisedFor = useRef<string | null>(null);

  useEffect(() => {
    if (seats.length < MIN_PLAYERS) return;
    if (initialisedFor.current === seatKey) return;
    initialisedFor.current = seatKey;

    try {
      const raw = readLocal(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        // Resume any game — including a finished one, whose results screen
        // is what a refresh should land back on — as long as it's the same
        // table. A different table comes through `start()` instead.
        if (
          saved?.state?.version === 3 &&
          saved.state.players.length === seats.length &&
          saved.state.players.every((p, i) => p.name === seats[i].name && p.kind === seats[i].kind)
        ) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- resumes a saved game from localStorage, unavailable during render
          setState(saved.state);
          setStage("table");
          return;
        }
      }
    } catch {
      /* corrupt save — fall through to a fresh deal */
    }
    start();
  }, [seatKey, seats, start]);

  useEffect(() => {
    if (!state) return;
    try {
      // Finished games are kept too, so refreshing on the results screen
      // brings the results back rather than silently dealing a new game.
      // Re-recording it is harmless — recording is keyed on gameId.
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() } satisfies Saved));
    } catch {
      /* storage full or unavailable — the game still plays, just won't resume */
    }
  }, [state]);

  /**
   * The single scheduler. Every automatic step — resolving a finished trick,
   * taking a CPU turn — is scheduled from here and torn down on cleanup, so
   * a re-render can never leave two timers racing for the same move.
   */
  useEffect(() => {
    clearTimer();
    if (!state || stage !== "table") return;

    if (state.phase === "trickEnd") {
      const outcome = state.trickOutcome;
      timer.current = setTimeout(() => {
        if (outcome?.kind === "discard") emit.current?.({ type: "trickWon", seat: outcome.winnerSeat });
        if (outcome?.kind === "pickup") {
          emit.current?.({ type: "pickup", seat: outcome.collectorSeat, count: outcome.cards.length });
        }
        setState((prev) => {
          if (!prev || prev.phase !== "trickEnd") return prev;
          const before = new Set(prev.finishOrder);
          const next = resolveTrick(prev);
          next.finishOrder.filter((s) => !before.has(s)).forEach((s) => emit.current?.({ type: "out", seat: s }));
          if (next.phase === "finished") emit.current?.({ type: "finished", thullaSeat: next.thullaSeat });
          return next;
        });
      }, scale(1500));
      return clearTimer;
    }

    if (state.phase === "playing") {
      const player = state.players[state.turnSeat];
      if (player?.kind !== "cpu") return;
      timer.current = setTimeout(() => {
        setState((prev) => {
          if (!prev || prev.phase !== "playing") return prev;
          const seat = prev.turnSeat;
          if (prev.players[seat]?.kind !== "cpu") return prev;
          const card = chooseCard(prev, seat, difficulty);
          if (!card) return prev;
          const res = applyPlay(prev, seat, card);
          // A rejected AI move means the heuristics and the rules disagree;
          // the rules win, and we fall back to the first legal card.
          if (res.error) {
            const fallback = legalMoves(prev, seat)[0];
            if (!fallback) return prev;
            const retry = applyPlay(prev, seat, fallback);
            if (retry.error) return prev;
            emit.current?.({ type: "play", seat, card: fallback });
            return retry.state;
          }
          emit.current?.({ type: "play", seat, card });
          return res.state;
        });
      }, scale(thinkingDelay(difficulty)));
    }

    return clearTimer;
  }, [state, stage, difficulty, scale]);

  useEffect(
    () => () => {
      clearTimer();
      clearIntro();
    },
    []
  );

  /** A human tap. Returns an error string when the card isn't playable. */
  const play = useCallback(
    (card: Card): string | null => {
      if (!state || state.phase !== "playing") return "Hold on — this trick isn't finished yet.";
      const seat = state.turnSeat;
      if (state.players[seat]?.kind !== "human") return "Not your turn yet — thoda sabar!";

      const reason = rejectionReason(state, seat, card);
      if (reason) {
        setInvalid({ card, nth: invalidCount.current++ });
        setTimeout(() => setInvalid(null), 500);
        return reason;
      }
      const res = applyPlay(state, seat, card);
      if (res.error) return res.error;
      emit.current?.({ type: "play", seat, card });
      setState(res.state);
      return null;
    },
    [state]
  );

  /**
   * Runs the rest of the game out instantly. Only allowed once no human
   * still holds cards — at that point every remaining decision is a CPU's,
   * so there is nothing to skip past except waiting.
   */
  const fastForward = useCallback(() => {
    clearTimer();
    setState((prev) => {
      if (!prev || prev.phase === "finished") return prev;
      if (prev.players.some((p) => p.kind === "human" && p.hand.length > 0)) return prev;

      let next = prev;
      let guard = 0;
      while (next.phase !== "finished" && guard++ < 20000) {
        if (next.phase === "trickEnd") {
          next = resolveTrick(next);
          continue;
        }
        const card = chooseCard(next, next.turnSeat, difficulty) ?? legalMoves(next, next.turnSeat)[0];
        if (!card) break;
        const res = applyPlay(next, next.turnSeat, card);
        if (res.error) break;
        next = res.state;
      }
      if (next.phase === "finished") emit.current?.({ type: "finished", thullaSeat: next.thullaSeat });
      return next;
    });
  }, [difficulty]);

  const humanSeat = state?.players.findIndex((p) => p.kind === "human") ?? -1;
  const legal = state && humanSeat >= 0 ? legalMoves(state, humanSeat) : [];

  return {
    state,
    stage,
    invalid,
    play,
    rematch: start,
    fastForward,
    humanSeat,
    legal,
    isHumanTurn:
      !!state && state.phase === "playing" && state.turnSeat === humanSeat && stage === "table",
  };
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}
