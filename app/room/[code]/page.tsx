"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { GameTable } from "@/components/GameTable";
import { GameOver } from "@/components/GameOver";
import { Toast, type ToastMessage } from "@/components/Toast";
import { ThullaToast } from "@/components/ThullaToast";
import { VoiceChat } from "@/components/VoiceChat";
import { ChatDrawer, RoomChat } from "@/components/RoomChat";
import { QuitDialog } from "@/components/QuitDialog";
import { Avatar } from "@/components/Avatar";
import { useRoom } from "@/lib/useRoom";
import { useAuth } from "@/lib/useAuth";
import { useSettings } from "@/lib/settings";
import { useStats } from "@/lib/useStats";
import { useThulla } from "@/lib/useThulla";
import { useVoice } from "@/lib/useVoice";
import { useAvatars } from "@/lib/useAvatars";
import { useRoomChat } from "@/lib/useRoomChat";
import { authedFetch } from "@/lib/apiClient";
import { applyPlay, legalMoves } from "@/lib/engine/rules";
import type { Card } from "@/lib/engine/cards";
import type { GameState } from "@/lib/engine/types";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
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

  /**
   * Our own move, shown before the server has confirmed it.
   *
   * The engine is deterministic and the server re-validates with the very
   * same applyPlay, so the state we compute here is the state that comes
   * back — there is nothing to be gained by making the player watch a
   * network round trip before their card lands on the table. The server's
   * word replaces it the moment it arrives, and `optimisticBase` is the
   * server state it was built on, so we can tell when that has happened.
   */
  const [optimistic, setOptimistic] = useState<GameState | null>(null);
  const optimisticBase = useRef<number | null>(null);

  const game = optimistic ?? state?.game ?? null;
  const mySeat = state?.seats.find((s) => s.id === userId)?.seat ?? -1;
  const myName = state?.seats.find((s) => s.id === userId)?.name ?? "You";

  // Voice chat is offered to everyone holding a seat, and only to them —
  // knowing the room code isn't enough to be dialled in.
  const members = useMemo(
    () => (state?.seats ?? []).map((s) => ({ id: s.id, name: s.name })),
    [state?.seats]
  );
  const voice = useVoice({
    code: code || null,
    userId,
    members,
    available: settings.voice,
  });
  const showVoice = settings.voice && mySeat >= 0;

  // Faces for everyone at the table, so a room of usernames is a room of
  // people. Looked up by id, so it works for the lobby and the game alike.
  const avatars = useAvatars(members.map((m) => m.id));

  const chat = useRoomChat({ code: code || null, userId, name: myName, members });
  const showChat = mySeat >= 0;

  // In the lobby the chat is always on screen, so nothing is ever unread.
  // During a game the drawer says when it's being looked at.
  const inLobby = !state?.game || state.status === "waiting";
  const markChatRead = chat.markRead;
  useEffect(() => {
    if (inLobby) markChatRead(true);
  }, [inLobby, markChatRead]);

  useEffect(() => {
    if (optimisticBase.current === null) return;
    if (!state?.game || state.game.updatedAt === optimisticBase.current) return;
    // The authoritative state has arrived; ours has served its purpose.
    optimisticBase.current = null;
    setOptimistic(null);
  }, [state]);

  // Same engine event, same one-per-trick guard, over realtime updates.
  const thulla = useThulla(game, mySeat);

  /**
   * Once a finished trick's display window elapses, ask the server to clear
   * it. Every client does this; the server makes all but the first a no-op.
   */
  useEffect(() => {
    // Only the server's own state may drive this: a trick we've only
    // predicted has no agreed trickEndsAt, and clearing it early would cut
    // the result short on every other screen.
    if (optimistic || !state || !game || game.phase !== "trickEnd" || !accessToken) return;
    const delay = Math.max(0, (state.trickEndsAt ?? 0) - Date.now()) + 120;
    const timer = setTimeout(() => {
      void authedFetch("/api/resolve-trick", accessToken, { code }).then(() => refresh());
    }, delay);
    return () => clearTimeout(timer);
  }, [state, game, optimistic, accessToken, code, refresh]);

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
      // The gag lands just after the cards are scooped up.
      setTimeout(() => sfx.thulla(), 170);
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
    if (game.thullaSeat === mySeat) sfx.thulla();
    else sfx.win();

    // The result row is written server-side before the room update that
    // brought us here, so the first read is normally enough. "Normally"
    // isn't good enough for the one screen people actually read their
    // record on, and a single timeout that loses the race leaves a stale
    // card with no way back. Read a few times and let it settle.
    const timers = [400, 1500, 3500].map((ms) => window.setTimeout(() => refreshStats(), ms));
    return () => timers.forEach(clearTimeout);
  }, [game?.phase, game?.thullaSeat, mySeat, refreshStats, game]);

  async function handleStart() {
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/start-game", accessToken, { code });
    setBusy(false);
    if (data.error) setError(data.error);
  }

  /**
   * A rematch is the table's decision, not the host's: this registers one
   * vote and the server deals as soon as the last seat has voted. Tapping
   * again takes the vote back.
   */
  /** Concede: it ends the game and the loss is recorded like any other. */
  async function handleQuit() {
    setQuitting(true);
    const data = await authedFetch("/api/quit", accessToken, { code });
    setQuitting(false);
    if (data.error) {
      say(data.error, "error");
      return;
    }
    setQuitOpen(false);
    setMenuOpen(false);
    refresh();
  }

  async function handleRematch(now = false) {
    const data = await authedFetch("/api/rematch", accessToken, { code, now });
    if (data.error) say(data.error, "error");
    else refresh();
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

    // Land it now, ask afterwards.
    const local = applyPlay(game, mySeat, card);
    if (!local.error) {
      optimisticBase.current = game.updatedAt;
      setOptimistic(local.state);
    }

    const data = await authedFetch("/api/play-card", accessToken, { code, card });
    if (data.error) {
      // The server disagreed, so put its version back on screen.
      optimisticBase.current = null;
      setOptimistic(null);
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
                    {p ? (
                      <span className="flex min-w-0 items-center gap-2 font-medium text-cream-50">
                        <Avatar src={avatars[p.id]} name={p.name} size={22} />
                        <span className="truncate">{p.name}</span>
                      </span>
                    ) : (
                      <span className="text-cream-400/60">Waiting for a player…</span>
                    )}
                    {p?.id === state.hostId && <span className="text-[0.65rem] text-brass-300">HOST</span>}
                  </div>
                );
              })}
            </div>

            {showVoice && (
              <div className="mb-4">
                <VoiceChat
                  voice={voice}
                  selfName={myName}
                  avatars={avatars}
                  selfAvatar={userId ? avatars[userId] : null}
                />
              </div>
            )}

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

          {showChat && (
            <div className="panel mt-3 flex flex-col p-3">
              <p className="mb-2 text-sm font-semibold text-cream-100">💬 Table chat</p>
              <RoomChat
                messages={chat.messages}
                userId={userId}
                avatars={avatars}
                onSend={chat.send}
              />
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ---------- Finished ---------- */
  if (game.phase === "finished") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        {(showVoice || showChat) && (
          <div className="relative z-20 flex justify-end gap-1 px-3 pt-[max(0.4rem,env(safe-area-inset-top))]">
            {showVoice && (
              <VoiceChat
                voice={voice}
                selfName={myName}
                avatars={avatars}
                selfAvatar={userId ? avatars[userId] : null}
                variant="bar"
              />
            )}
            <ChatDrawer
              messages={chat.messages}
              unread={chat.unread}
              userId={userId}
              avatars={avatars}
              onSend={chat.send}
              onOpenChange={chat.markRead}
            />
          </div>
        )}
        <GameOver
          state={game}
          viewSeat={mySeat}
          lang={lang}
          stats={statsLoading ? null : stats}
          statsAreLocal={isLocal}
          avatars={avatars}
          onRematch={() => void handleRematch()}
          rematch={{
            readyNames: (state.rematchReady ?? [])
              .map((id) => state.seats.find((seat) => seat.id === id)?.name)
              .filter((name): name is string => !!name),
            total: state.seats.length,
            mine: (state.rematchReady ?? []).includes(userId ?? ""),
            isHost: state.hostId === userId,
            onDealNow: () => void handleRematch(true),
          }}
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
      <ThullaToast notice={thulla} />
      {quitOpen && (
        <QuitDialog busy={quitting} onCancel={() => setQuitOpen(false)} onConfirm={handleQuit} />
      )}

      <header className="relative z-20 flex shrink-0 items-center gap-2 px-2 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Game menu"
          className="btn btn-ghost !min-h-9 !gap-1.5 !px-2 !text-xs"
        >
          <span aria-hidden>☰</span>
          <span className="hidden sm:inline">Menu</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" aria-hidden onPointerDown={() => setMenuOpen(false)} />
            <div className="panel absolute left-2 top-full z-40 mt-1 w-56 p-1.5">
              <Link
                href="/"
                className="btn btn-ghost w-full !justify-start !min-h-10 !text-xs"
                onClick={() => setMenuOpen(false)}
              >
                🏠 Back to home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setQuitOpen(true);
                }}
                className="btn btn-ghost w-full !justify-start !min-h-10 !text-xs !text-chili-400"
              >
                🏳️ Quit this game
              </button>
              <p className="px-2.5 pb-1 pt-0.5 text-[0.65rem] leading-snug text-cream-400/70">
                Going home leaves the table waiting for you. Quitting concedes: you&apos;re the
                Thulla and the game ends.
              </p>
            </div>
          </>
        )}
        <span className="font-display hidden flex-1 text-base font-bold text-cream-50 sm:block">Thulla</span>
        <span className="tabular flex-1 text-[0.7rem] text-cream-400 sm:flex-none">
          <span className="hidden sm:inline">Room </span>
          {code} · <span className="hidden sm:inline">Trick </span>
          {game.trickNumber}
        </span>
        {showChat && (
          <ChatDrawer
            messages={chat.messages}
            unread={chat.unread}
            userId={userId}
            avatars={avatars}
            onSend={chat.send}
            onOpenChange={chat.markRead}
          />
        )}
        {showVoice && (
          <VoiceChat
            voice={voice}
            selfName={myName}
            avatars={avatars}
            selfAvatar={userId ? avatars[userId] : null}
            variant="bar"
          />
        )}
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <GameTable
          state={game}
          viewSeat={mySeat}
          legal={legalMoves(game, mySeat)}
          isMyTurn={isMyTurn}
          shakeCard={shakeCard}
          lang={lang}
          avatars={avatars}
          onPlay={handlePlay}
        />
      </div>
    </main>
  );
}
