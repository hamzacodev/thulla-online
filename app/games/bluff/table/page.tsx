"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BluffTable } from "@/components/bluff/BluffTable";
import { BluffGameOver } from "@/components/bluff/BluffGameOver";
import { ShuffleDecks } from "@/components/bluff/ShuffleDecks";
import { ChallengeNotice } from "@/components/bluff/BluffPieces";
import { QuitDialog } from "@/components/QuitDialog";
import { Toast, type ToastMessage } from "@/components/Toast";
import { useBluffGame, type BluffEvent } from "@/lib/bluff/useBluffGame";
import { loadBluffSetup, type BluffTableSetup } from "@/lib/bluff/setup";
import { buildBluffPayload, recordBluffGame } from "@/lib/bluff/record";
import { claimLabel, type Rank } from "@/lib/bluff/cards";
import { useAuth } from "@/lib/useAuth";
import { useAvatars } from "@/lib/useAvatars";
import { useSettings } from "@/lib/settings";
import { primeAudio, setSoundEnabled, sfx } from "@/lib/sound";

/**
 * The single-player Bluff table.
 *
 * Deliberately the same shape as Thulla's `/game`: read the table out of
 * localStorage, hand it to the game hook, render whatever phase comes back.
 * Nothing here knows the rules — every decision is the engine's.
 */
export default function BluffTablePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { userId, accessToken } = useAuth();

  const [setup, setSetup] = useState<BluffTableSetup | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [claimRank, setClaimRank] = useState<Rank | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const toastId = useRef(0);
  const recorded = useRef<string | null>(null);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  // The table only exists in localStorage, so it has to be read on mount.
  useEffect(() => {
    const saved = loadBluffSetup();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the table comes from localStorage, unavailable during render
    if (saved) setSetup(saved);
    else router.replace("/games/bluff/play?mode=cpu");
  }, [router]);

  const say = useCallback((text: string, tone?: ToastMessage["tone"]) => {
    setToast({ id: ++toastId.current, text, tone });
  }, []);

  const seats = useMemo(
    () =>
      setup
        ? setup.names.slice(0, setup.playerCount).map((name, i) => ({
            id: `seat-${i}`,
            name,
            kind: (i === 0 ? "human" : "cpu") as "human" | "cpu",
          }))
        : [],
    [setup]
  );

  const onEvent = useCallback(
    (e: BluffEvent) => {
      switch (e.type) {
        case "shuffle":
          sfx.shuffle();
          break;
        case "deal":
          for (let i = 0; i < 8; i++) setTimeout(() => sfx.deal(), i * 110);
          break;
        case "claim":
          sfx.playCard();
          break;
        case "challenge":
          sfx.invalid();
          break;
        case "caught":
          sfx.thulla();
          break;
        case "survived":
          sfx.pickup();
          break;
        case "finished":
          if (e.winnerSeat === 0) sfx.win();
          else sfx.thulla();
          break;
        default:
          break;
      }
    },
    []
  );

  const game = useBluffGame({
    seats,
    deckCount: setup?.deckCount ?? 1,
    difficulty: setup?.difficulty ?? "medium",
    speed: settings.speed,
    onEvent,
  });

  const { state, stage, humanSeat, awaitingHuman, pendingChallenger, play, call, letItGo, quit, rematch } = game;

  const avatars = useAvatars([userId]);
  const seatAvatars = useMemo(() => {
    const url = userId ? avatars[userId] : undefined;
    return url ? { "seat-0": url } : undefined;
  }, [userId, avatars]);

  // Clear the selection whenever it stops being our turn.
  const myTurn = !!state && state.phase === "claiming" && state.turnSeat === humanSeat;
  // Adjusting state during render, the way React documents it: when the turn
  // moves on, a half-made claim from the previous one is meaningless. An
  // effect would render the stale selection once before clearing it.
  const turnKey = `${state?.phase}-${state?.turnSeat}-${state?.pile.length}`;
  const [lastTurnKey, setLastTurnKey] = useState(turnKey);
  if (lastTurnKey !== turnKey) {
    setLastTurnKey(turnKey);
    if (selected.length) setSelected([]);
    if (claimRank) setClaimRank(null);
  }

  /** Record the finished game once. */
  useEffect(() => {
    if (!state || state.phase !== "finished") return;
    if (recorded.current === state.gameId) return;
    recorded.current = state.gameId;
    const payload = buildBluffPayload(state, humanSeat);
    if (payload) void recordBluffGame(payload, accessToken);
  }, [state, humanSeat, accessToken]);

  if (!setup || !state) {
    return <main className="felt grid min-h-dvh place-items-center text-cream-400">Dealing…</main>;
  }

  if (stage !== "table") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        <ShuffleDecks deckCount={setup.deckCount} stage={stage} />
      </main>
    );
  }

  if (state.phase === "finished") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        <BluffGameOver
          state={state}
          viewSeat={humanSeat}
          avatars={seatAvatars}
          onRematch={() => {
            recorded.current = null;
            rematch();
          }}
        />
      </main>
    );
  }

  function handlePlay() {
    primeAudio();
    const rank = state!.config.lockRankPerRound ? state!.roundRank ?? claimRank : claimRank;
    if (!rank || selected.length === 0) return;
    const error = play(selected, rank);
    if (error) {
      sfx.invalid();
      say(error, "error");
      return;
    }
    say(`You claimed ${claimLabel(rank, selected.length)}`, "info");
    setSelected([]);
    setClaimRank(null);
  }

  return (
    <main className="felt flex h-dvh flex-col overflow-hidden">
      <Toast message={toast} />
      {quitOpen && (
        <QuitDialog
          onCancel={() => setQuitOpen(false)}
          onConfirm={() => {
            setQuitOpen(false);
            quit();
          }}
        />
      )}

      <header className="relative z-20 flex shrink-0 items-center gap-2 px-2 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1">
        <Link href="/games/bluff" className="btn btn-ghost !min-h-9 !px-2 !text-xs" aria-label="Back to Bluff">
          ←
        </Link>
        <span className="font-display hidden flex-1 text-base font-bold text-cream-50 sm:block">Bluff</span>
        <span className="tabular flex-1 text-[0.7rem] text-cream-400 sm:flex-none">
          {"🃏".repeat(setup.deckCount)} {setup.deckCount} deck{setup.deckCount > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => setQuitOpen(true)}
          className="btn btn-ghost !min-h-9 !px-2 !text-xs !text-chili-400"
        >
          🏳️ Quit
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {state.phase === "reveal" && state.outcome && (
          <ChallengeNotice outcome={state.outcome} players={state.players} />
        )}
        <BluffTable
          state={state}
          viewSeat={humanSeat}
          selected={selected}
          claimRank={claimRank}
          awaitingChallenge={awaitingHuman}
          pendingChallenger={pendingChallenger}
          avatars={seatAvatars}
          onToggleCard={(id) =>
            setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          onPickRank={(r) => setClaimRank(r)}
          onPlay={handlePlay}
          onClearSelection={() => {
            setSelected([]);
            setClaimRank(null);
          }}
          onCall={() => {
            primeAudio();
            call();
          }}
          onPass={() => {
            primeAudio();
            letItGo();
          }}
        />
        {!myTurn && !awaitingHuman && state.phase === "claiming" && (
          <div className="pb-[max(0.6rem,env(safe-area-inset-bottom))]" />
        )}
      </div>
    </main>
  );
}
