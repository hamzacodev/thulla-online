"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrumpPattaTable } from "@/components/trumpPatta/TrumpPattaTable";
import { TrumpPattaGameOver } from "@/components/trumpPatta/TrumpPattaGameOver";
import { DonorHand } from "@/components/trumpPatta/DonorHand";
import { OwnHand } from "@/components/trumpPatta/OwnHand";
import { DiscardPairs, PickReveal, TurnBanner } from "@/components/trumpPatta/TrumpPattaPieces";
import { ShuffleDeal } from "@/components/ShuffleDeal";
import { QuitDialog } from "@/components/QuitDialog";
import { Toast, type ToastMessage } from "@/components/Toast";
import { useTrumpPattaGame } from "@/lib/trumpPatta/useTrumpPattaGame";
import { loadTrumpPattaSetup, type TrumpPattaTableSetup } from "@/lib/trumpPatta/setup";
import { buildTrumpPattaPayload, recordTrumpPattaGame } from "@/lib/trumpPatta/record";
import { redactFor, standings } from "@/lib/trumpPatta/rules";
import { useAuth } from "@/lib/useAuth";
import { useAvatars } from "@/lib/useAvatars";
import { useSettings } from "@/lib/settings";
import { primeAudio, setSoundEnabled, sfx } from "@/lib/sound";
import { SeriesComplete, SeriesInterval, SeriesTableStrip } from "@/components/SeriesPanels";
import { createSeries, isSeries, recordGame } from "@/lib/series/rules";
import { clearSeries, loadSeries, saveSeries } from "@/lib/series/store";
import type { SeriesState } from "@/lib/series/types";

/**
 * The single-player Trump-Patta table.
 *
 * The same shape as Thulla's `/game` and Bluff's table: read the table out of
 * localStorage, hand it to the game hook, render whatever phase comes back.
 * Nothing here knows the rules — every decision is the engine's.
 *
 * What is different is that this screen renders from `redactFor(state, me)`
 * rather than from the state itself. In single player that is belt and
 * braces — the whole game is in this browser either way — but it means the
 * screen is built against exactly the payload an online table would send,
 * and it cannot accidentally start drawing a hand it wasn't given.
 */
export default function TrumpPattaTablePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { userId, accessToken } = useAuth();

  const [setup, setSetup] = useState<TrumpPattaTableSetup | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [series, setSeries] = useState<SeriesState | null>(null);
  const toastId = useRef(0);
  const recorded = useRef<string | null>(null);
  const scored = useRef<string | null>(null);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  useEffect(() => {
    const saved = loadTrumpPattaSetup();
    if (!saved) {
      router.replace("/games/trump-patta/play?mode=cpu");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the table comes from localStorage, unavailable during render
    setSetup(saved);

    const bestOf = saved.bestOf ?? 1;
    if (!isSeries(bestOf)) return;
    const existing = loadSeries("trump_patta");
    if (existing && existing.bestOf === bestOf && existing.players.length === saved.playerCount) {
      setSeries(existing);
      return;
    }
    const fresh = createSeries({
      game: "trump_patta",
      bestOf,
      players: saved.names.slice(0, saved.playerCount).map((name, i) => ({ id: `seat-${i}`, name })),
    });
    saveSeries(fresh);
    setSeries(fresh);
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
    (e: Parameters<NonNullable<Parameters<typeof useTrumpPattaGame>[0]["onEvent"]>>[0]) => {
      switch (e.type) {
        case "shuffle":
          sfx.shuffle();
          break;
        case "deal":
          for (let i = 0; i < 8; i++) setTimeout(() => sfx.deal(), i * 110);
          break;
        case "pick":
          sfx.playCard();
          break;
        case "pair":
          sfx.trickWon();
          break;
        // "finished" is deliberately not handled here: which sound it wants
        // depends on whether *you* are the Thief, and this handler is built
        // once, before the seat is known. It happens below instead.
        default:
          break;
      }
    },
    []
  );

  const game = useTrumpPattaGame({
    seats,
    difficulty: setup?.difficulty ?? settings.difficulty,
    speed: settings.speed,
    onEvent,
  });

  const { state, stage, humanSeat, awaitingConfirm, pick, confirm, reorder, quit, rematch } = game;

  const avatars = useAvatars([userId]);
  const seatAvatars = useMemo<Record<string, string>>(() => {
    const url = userId ? avatars[userId] : undefined;
    // Seat 0 is always the human here; the CPUs have no faces to fetch.
    return url ? { "seat-0": url } : ({} as Record<string, string>);
  }, [userId, avatars]);

  /** Record the finished game once, and sound the ending. */
  useEffect(() => {
    if (!state || state.phase !== "finished") return;
    if (recorded.current === state.gameId) return;
    recorded.current = state.gameId;

    // The gag is for the Thief, and only for the Thief.
    if (state.thiefSeat === humanSeat) sfx.thulla();
    else sfx.win();

    const payload = buildTrumpPattaPayload(state, humanSeat);
    if (payload) void recordTrumpPattaGame(payload, accessToken);
  }, [state, humanSeat, accessToken]);

  /** Add the result to the series, once. */
  useEffect(() => {
    if (!state || state.phase !== "finished" || !series) return;
    if (scored.current === state.gameId) return;
    scored.current = state.gameId;

    // The whole finishing order, by player id — seats are reshuffled each
    // game, so a seat number names a chair rather than a person. Everyone
    // who got out is placed ahead of the Thief, who comes last.
    const order = standings(state).map((p) => p.id);
    const next = recordGame(series, { gameId: state.gameId, order });
    if (next.error) return;
    saveSeries(next.series);
    // Mirroring what was just persisted; the ref guard makes it fire once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeries(next.series);
  }, [state, series]);

  if (!setup || !state) {
    return <main className="felt grid min-h-dvh place-items-center text-cream-400">Dealing…</main>;
  }

  if (stage !== "table") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        <ShuffleDeal
          stage={stage}
          playerCount={setup.playerCount}
          shufflingLabel="Shuffling…"
          dealingLabel="Dealing 51 cards…"
        />
      </main>
    );
  }

  if (state.phase === "finished") {
    if (series && series.status === "completed") {
      return (
        <main className="felt flex min-h-dvh flex-col items-center justify-center px-4 py-8">
          <SeriesComplete
            series={series}
            meId={state.players[humanSeat]?.id}
            avatars={seatAvatars}
            historyHref="/games/trump-patta/history"
            onPlayAgain={() => {
              // A new series, never a reset of the finished one.
              clearSeries("trump_patta");
              const fresh = createSeries({
                game: "trump_patta",
                bestOf: series.bestOf,
                players: series.players.map((p) => ({ id: p.id, name: p.name })),
              });
              saveSeries(fresh);
              setSeries(fresh);
              recorded.current = null;
              scored.current = null;
              rematch();
            }}
          />
        </main>
      );
    }

    return (
      <main className="felt flex min-h-dvh flex-col">
        <TrumpPattaGameOver
          state={state}
          viewSeat={humanSeat}
          avatars={seatAvatars}
          onRematch={
            series
              ? undefined
              : () => {
                  recorded.current = null;
                  rematch();
                }
          }
          series={
            series ? (
              <SeriesInterval
                series={series}
                meId={state.players[humanSeat]?.id}
                avatars={seatAvatars}
                onNextGame={() => {
                  recorded.current = null;
                  scored.current = null;
                  rematch();
                }}
              />
            ) : undefined
          }
        />
      </main>
    );
  }

  // Everything below draws from the redacted view — the same payload a
  // remote player in this seat would be sent, and no more.
  const view = redactFor(state, humanSeat);
  const donor = view.players[view.donorSeat];
  const picker = view.players[view.pickerSeat];
  const me = view.players[humanSeat];
  const iAmPicker = view.pickerSeat === humanSeat;
  const iAmDonor = view.donorSeat === humanSeat;

  function handlePick(position: number) {
    primeAudio();
    const error = pick(position);
    if (error) {
      sfx.invalid();
      say(error, "error");
      return;
    }
    // What you took is only known once it's yours — it was face-down until
    // the moment you picked it.
    say(`You took position ${position} from ${donor.name}`, "info");
  }

  return (
    <main className="felt flex min-h-dvh flex-col">
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
        <Link
          href="/games/trump-patta"
          className="btn btn-ghost !min-h-9 !px-2 !text-xs"
          aria-label="Back to Trump-Patta"
        >
          ←
        </Link>
        <span className="font-display hidden flex-1 text-base font-bold text-cream-50 sm:block">
          Trump-Patta
        </span>
        <span className="tabular flex-1 text-[0.7rem] text-cream-400 sm:flex-none">
          Turn {view.turnNumber}
        </span>
        <button
          type="button"
          onClick={() => setQuitOpen(true)}
          className="btn btn-ghost !min-h-9 !px-2 !text-xs !text-chili-400"
        >
          🏳️ Quit
        </button>
      </header>

      {series && <SeriesTableStrip series={series} meId={state.players[humanSeat]?.id} />}

      {/*
        One column, centred, sized to its contents. It used to be a full-height
        flex with the hand pushed to the bottom by `mt-auto`, which on a tall
        desktop screen opened a great empty band of felt in the middle of the
        table. Everything now sits together as one block and the page scrolls
        if it has to.
      */}
      {/*
        Thulla's table, reused: opponents wrap into a row on phones and sit on
        the same ellipse from `md` up. Two card games on one site should feel
        like one site, so the ring, the pods and the felt are shared and only
        what goes in the middle differs.
      */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TrumpPattaTable
          players={view.players}
          viewSeat={humanSeat}
          donorSeat={view.donorSeat}
          pickerSeat={view.pickerSeat}
          avatars={seatAvatars}
          banner={
            <TurnBanner
              donorName={donor.name}
              pickerName={picker.name}
              youArePicker={iAmPicker}
              youAreDonor={iAmDonor}
            />
          }
          centre={
            view.phase === "reveal" && view.outcome ? (
              <PickReveal
                card={view.outcome.card}
                paired={view.outcome.paired}
                position={view.outcome.fromPosition}
                donorName={view.players[view.outcome.donorSeat].name}
                pickerName={view.players[view.outcome.pickerSeat].name}
                // Your own pick waits for you; a CPU's clears itself.
                onConfirm={awaitingConfirm ? confirm : undefined}
              />
            ) : iAmDonor ? (
              <p className="max-w-[18rem] rounded-2xl border border-white/10 bg-ink-900/50 px-4 py-3 text-center text-xs text-cream-400">
                Your hand is on show. {picker.name} is picking one of your cards, face-down.
              </p>
            ) : (
              <DonorHand
                donorName={donor.name}
                cardCount={donor.cardCount}
                canPick={iAmPicker && view.phase === "picking"}
                onPick={handlePick}
                busy={view.phase !== "picking"}
                spectating={!iAmPicker}
              />
            )
          }
        />

        {/* Your side of the table. */}
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <DiscardPairs pairs={view.discards} />
          <OwnHand
            hand={me.hand ?? []}
            onReorder={reorder}
            disabled={!!(me.hand && me.hand.length < 2)}
          />
        </div>
      </div>
    </main>
  );
}
