"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { GameTable } from "@/components/GameTable";
import { GameOver } from "@/components/GameOver";
import { Toast, type ToastMessage } from "@/components/Toast";
import { ThullaToast } from "@/components/ThullaToast";
import { useRoom } from "@/lib/useRoom";
import { useAuth } from "@/lib/useAuth";
import { useSettings } from "@/lib/settings";
import { useStats } from "@/lib/useStats";
import { useThulla } from "@/lib/useThulla";
import { authedFetch } from "@/lib/apiClient";
import { legalMoves } from "@/lib/engine/rules";
import type { Card } from "@/lib/engine/cards";
import { invalidCardMessage, phrase, t } from "@/lib/copy";
import { sfx, setSoundEnabled, primeAudio } from "@/lib/sound";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code ?? "").toUpperCase();
  const { state, loading, notFound, refresh } = useRoom(code || null);
  const { loading: authLoading, userId, accessToken } = useAuth();
  const { settings } = useSettings();
  const { stats, loading: statsLoading, isLocal, refresh: refreshStats } = useStats(userId);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [shakeCard, setShakeCard] = useState<Card | null>(null);
  const toastId = useRef(0);
  const lastNarrated = useRef("");
  const statsRefreshed = useRef(false);

  const lang = settings.lang;

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  useEffect(() => {
    if (!authLoading && !userId) router.push("/login");
  }, [authLoading, userId, router]);

  const say = useCallback((text: string, tone?: ToastMessage["tone"]) => {
    setToast({ id: ++toastId.current, text, tone });
  }, []);

  const game = state?.game ?? null;
  const mySeat = state?.seats.find((s) => s.id === userId)?.seat ?? -1;

  // Same engine event, same one-per-trick guard, over realtime updates.
  const thulla = useThulla(game, mySeat);

  /**
   * Once a finished trick's display window elapses, ask the server to clear
   * it. Every client does this; the server makes all but the first a no-op.
   */
  useEffect(() => {
    if (!state || !game || game.phase !== "trickEnd" || !accessToken) return;
    const delay = Math.max(0, (state.trickEndsAt ?? 0) - Date.now()) + 120;
    const timer = setTimeout(() => {
      void authedFetch("/api/resolve-trick", accessToken, { code }).then(() => refresh());
    }, delay);
    return () => clearTimeout(timer);
  }, [state, game, accessToken, code, refresh]);

  // Narrate each trick result once.
  useEffect(() => {
    if (!game || game.phase !== "trickEnd" || !game.trickOutcome) return;
    const o = game.trickOutcome;
    const key = `${game.gameId}-${game.trickNumber}-${o.kind}`;
    if (lastNarrated.current === key) return;
    lastNarrated.current = key;

    if (o.kind === "discard") {
      sfx.trickWon();
      const who = game.players[o.winnerSeat];
      say(o.winnerSeat === mySeat ? `🏆 ${t("trickWonYou", lang)}` : `🏆 ${phrase.wonTrick(who.name, lang)}`, "good");
    } else {
      sfx.pickup();
      const who = game.players[o.collectorSeat];
      const broke = game.players[o.brokeBySeat];
      say(
        `${broke.name} ${t("couldNotFollow", lang)} → ${
          o.collectorSeat === mySeat ? t("pickedUpYou", lang) : phrase.pickedUp(who.name, o.cards.length, lang)
        }`,
        o.collectorSeat === mySeat ? "error" : "info"
      );
    }
  }, [game, mySeat, lang, say]);

  // Results are written server-side; just pull the fresh numbers in.
  useEffect(() => {
    if (game?.phase !== "finished") {
      statsRefreshed.current = false;
      return;
    }
    if (statsRefreshed.current) return;
    statsRefreshed.current = true;
    if (game.bhabhiSeat === mySeat) sfx.bhabhi();
    else sfx.win();
    // Give the server's write a beat to land before re-reading.
    const timer = setTimeout(() => refreshStats(), 700);
    return () => clearTimeout(timer);
  }, [game?.phase, game?.bhabhiSeat, mySeat, refreshStats, game]);

  async function handleStart() {
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/start-game", accessToken, { code });
    setBusy(false);
    if (data.error) setError(data.error);
  }

  async function handlePlay(card: Card) {
    primeAudio();
    if (!game || mySeat < 0) return;
    if (!legalMoves(game, mySeat).includes(card)) {
      sfx.invalid();
      setShakeCard(card);
      setTimeout(() => setShakeCard(null), 500);
      say(invalidCardMessage(lang, toastId.current), "error");
      return;
    }
    sfx.playCard();
    const data = await authedFetch("/api/play-card", accessToken, { code, card });
    if (data.error) {
      sfx.invalid();
      say(data.error, "error");
    }
  }

  if (loading || authLoading) {
    return <main className="grid min-h-dvh place-items-center text-cream-400">Loading room…</main>;
  }

  if (notFound || !state) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="panel p-6">
          <p className="font-semibold text-cream-50">No room with the code {code}.</p>
          <p className="mt-1 text-sm text-cream-400">It may have expired — rooms don&apos;t last forever.</p>
          <Link href="/play?mode=friends" className="btn btn-primary mt-4 w-full">Back to rooms</Link>
        </div>
      </main>
    );
  }

  if (mySeat < 0) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="panel p-6">
          <p className="font-semibold text-cream-50">You&apos;re not in this room.</p>
          <p className="mt-1 text-sm text-cream-400">Join with the code {code} to take a seat.</p>
          <Link href="/play?mode=friends" className="btn btn-primary mt-4 w-full">Join a room</Link>
        </div>
      </main>
    );
  }

  /* ---------- Lobby ---------- */
  if (state.status === "waiting" || !game) {
    const seats = Array.from({ length: state.maxPlayers }, (_, i) => i);
    const isHost = state.hostId === userId;
    return (
      <main className="felt flex min-h-dvh flex-col">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-8">
          <div className="panel p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-cream-400">Room code</p>
            <p className="tabular font-display my-2 text-5xl font-bold tracking-[0.2em] text-brass-300">{code}</p>
            <p className="text-sm text-cream-400">Share this with your friends, wherever they are.</p>

            <div className="my-5 space-y-2">
              {seats.map((seat) => {
                const p = state.seats.find((s) => s.seat === seat);
                return (
                  <div
                    key={seat}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                      p ? "bg-white/[0.06]" : "border border-dashed border-white/15 bg-transparent"
                    }`}
                  >
                    <span className={p ? "font-medium text-cream-50" : "text-cream-400/60"}>
                      {p ? `🙂 ${p.name}` : "Waiting for a player…"}
                    </span>
                    {p?.id === state.hostId && <span className="text-[0.65rem] text-brass-300">HOST</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">{error}</p>
            )}

            {isHost ? (
              <button
                disabled={state.seats.length !== state.maxPlayers || busy}
                onClick={handleStart}
                className="btn btn-primary w-full"
              >
                {state.seats.length !== state.maxPlayers
                  ? `Need ${state.maxPlayers - state.seats.length} more`
                  : busy
                  ? "Dealing…"
                  : "🎮 Deal the cards"}
              </button>
            ) : (
              <p className="text-sm text-cream-400">Waiting for the host to start…</p>
            )}

            <Link href="/" className="btn btn-ghost mt-2 w-full !text-xs">Leave room</Link>
          </div>
        </div>
      </main>
    );
  }

  /* ---------- Finished ---------- */
  if (game.phase === "finished") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        <GameOver
          state={game}
          viewSeat={mySeat}
          lang={lang}
          stats={statsLoading ? null : stats}
          statsAreLocal={isLocal}
          onRematch={state.hostId === userId ? handleStart : undefined}
          onNewGame={() => router.push("/play?mode=friends")}
        />
      </main>
    );
  }

  /* ---------- Playing ---------- */
  const isMyTurn = game.phase === "playing" && game.turnSeat === mySeat;

  return (
    <main className="felt flex h-dvh flex-col overflow-hidden">
      <Toast message={toast} />

      <header className="relative z-20 flex shrink-0 items-center gap-2 px-2 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1">
        <Link href="/" className="btn btn-ghost !min-h-9 !px-2 !text-xs" aria-label="Leave game">☰</Link>
        <span className="font-display flex-1 text-base font-bold text-cream-50">Thulla</span>
        <span className="tabular text-[0.7rem] text-cream-400">
          Room {code} · Trick {game.trickNumber}
        </span>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <ThullaToast notice={thulla} />
        <GameTable
          state={game}
          viewSeat={mySeat}
          legal={legalMoves(game, mySeat)}
          isMyTurn={isMyTurn}
          shakeCard={shakeCard}
          lang={lang}
          onPlay={handlePlay}
        />
      </div>
    </main>
  );
}
