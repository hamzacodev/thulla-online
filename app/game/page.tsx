"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameTable } from "@/components/GameTable";
import { GameOver } from "@/components/GameOver";
import { ShuffleDeal } from "@/components/ShuffleDeal";
import { Toast, type ToastMessage } from "@/components/Toast";
import { ThullaToast } from "@/components/ThullaToast";
import { useLocalGame, type LocalGameEvent } from "@/lib/useLocalGame";
import { useThulla } from "@/lib/useThulla";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/useAuth";
import { loadSetup, type TableSetup } from "@/lib/setup";
import { buildRecordPayload, recordFinishedGame } from "@/lib/gameHistory";
import { useStats } from "@/lib/useStats";
import { useAvatars } from "@/lib/useAvatars";
import { invalidCardMessage, phrase, t } from "@/lib/copy";
import { sfx, setSoundEnabled, primeAudio } from "@/lib/sound";
import { ACE_OF_SPADES, cardLabel, type Card } from "@/lib/engine/cards";

export default function LocalGamePage() {
  const router = useRouter();
  const { settings, ready } = useSettings();
  const { userId, accessToken } = useAuth();
  const { stats, loading: statsLoading, isLocal, refresh: refreshStats } = useStats(userId);
  const [setup, setSetup] = useState<TableSetup | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [aceNotice, setAceNotice] = useState<string | null>(null);
  const toastId = useRef(0);
  const recorded = useRef<string | null>(null);

  const lang = settings.lang;

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  // Send anyone who lands here without a table back to pick one.
  useEffect(() => {
    if (!ready) return;
    const saved = loadSetup();
    if (!saved) router.replace("/play?mode=cpu");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the table only exists in localStorage, so it has to be read on mount
    else setSetup(saved);
  }, [ready, router]);

  const say = useCallback((text: string, tone?: ToastMessage["tone"]) => {
    setToast({ id: ++toastId.current, text, tone });
  }, []);

  const seats = useMemo(
    () =>
      setup
        ? setup.names.map((name, i) => ({
            id: `seat-${i}`,
            name,
            kind: (i === 0 ? "human" : "cpu") as "human" | "cpu",
          }))
        : [],
    [setup]
  );

  const onEvent = useCallback(
    (e: LocalGameEvent) => {
      switch (e.type) {
        case "shuffle":
          sfx.shuffle();
          break;
        case "deal":
          for (let i = 0; i < 8; i++) setTimeout(() => sfx.deal(), i * 110);
          break;
        case "play":
          sfx.playCard();
          break;
        case "trickWon":
          sfx.trickWon();
          break;
        case "pickup":
          sfx.pickup();
          break;
        case "out":
          break;
        case "finished":
          if (e.thullaSeat === 0) sfx.thulla();
          else sfx.win();
          break;
      }
    },
    []
  );

  const game = useLocalGame({
    seats,
    difficulty: setup?.difficulty ?? settings.difficulty,
    speed: settings.speed,
    instant: !settings.animations,
    onEvent,
  });

  const { state, stage, invalid, play, rematch, fastForward, humanSeat, legal, isHumanTurn } = game;

  // Your own face at your own seat. The CPUs keep their 🤖.
  const mine = useAvatars([userId]);
  const avatars = useMemo(() => {
    const seat = state?.players[humanSeat];
    const url = userId ? mine[userId] : undefined;
    return seat && url ? { [seat.id]: url } : undefined;
  }, [state, humanSeat, userId, mine]);

  // Driven by the engine's own thulla event, not by anything the UI does.
  const thulla = useThulla(stage === "table" ? state : null, humanSeat);

  // Announce the Ace opener once the table appears — the rule that decides
  // who leads should be visible, not just implemented. Announced once per
  // deal, keyed on the game's start time so a rematch announces again.
  const announcedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!state || stage !== "table") return;
    if (state.trickNumber !== 1 || state.pile.length > 0) return;
    if (announcedFor.current === state.startedAt) return;
    announcedFor.current = state.startedAt;
    const leader = state.players[state.leaderSeat];
    if (leader) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the Ace announcement is a one-shot reaction to the deal, guarded by a ref
      setAceNotice(
        `🂡 ${t("aceFound", lang)} ${phrase.startsRound(leader.name, lang, state.leaderSeat === humanSeat)}`
      );
    }
  }, [state, stage, lang, humanSeat]);

  // Dismissal rides on its own timer. Tying it to `state` would restart the
  // cleanup on every card played and leave the notice up for good.
  useEffect(() => {
    if (!aceNotice) return;
    const timer = setTimeout(() => setAceNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [aceNotice]);

  // Narrate trick outcomes as they resolve.
  const lastNarrated = useRef<string>("");
  useEffect(() => {
    if (!state || state.phase !== "trickEnd" || !state.trickOutcome) return;
    const o = state.trickOutcome;
    const key = `${state.trickNumber}-${o.kind}`;
    if (lastNarrated.current === key) return;
    lastNarrated.current = key;

    if (o.kind === "discard") {
      const who = state.players[o.winnerSeat];
      say(
        o.winnerSeat === humanSeat
          ? `🏆 ${t("trickWonYou", lang)}`
          : `🏆 ${phrase.wonTrick(who.name, lang)}`,
        "good"
      );
    } else {
      const who = state.players[o.collectorSeat];
      const broke = state.players[o.brokeBySeat];
      say(
        `${broke.name} ${t("couldNotFollow", lang)} → ${
          o.collectorSeat === humanSeat
            ? t("pickedUpYou", lang)
            : phrase.pickedUp(who.name, o.cards.length, lang)
        }`,
        o.collectorSeat === humanSeat ? "error" : "info"
      );
    }
  }, [state, humanSeat, lang, say]);

  /**
   * Record the result exactly once. The ref guards against React re-renders
   * within this mount; the gameId unique constraint guards against
   * everything else (a refresh on the results screen, a retry, two tabs).
   */
  useEffect(() => {
    if (!state || state.phase !== "finished") return;
    if (recorded.current === state.gameId) return;
    recorded.current = state.gameId;

    const payload = buildRecordPayload(state, humanSeat);
    if (!payload) return;
    void recordFinishedGame(payload, accessToken).then(() => refreshStats());
  }, [state, humanSeat, accessToken, refreshStats]);

  function handlePlay(card: Card) {
    primeAudio();
    const err = play(card);
    if (err) {
      sfx.invalid();
      const isAce = state?.mustPlay === ACE_OF_SPADES;
      say(isAce ? `🂡 ${t("mustLeadAce", lang)}` : invalidCardMessage(lang, toastId.current), "error");
    }
  }

  function handleRematch() {
    recorded.current = null;
    lastNarrated.current = "";
    rematch();
  }

  if (!setup || !state) {
    return <main className="grid min-h-dvh place-items-center text-cream-400">{t("shuffling", lang)}</main>;
  }

  if (stage !== "table") {
    return (
      <main className="felt grid min-h-dvh place-items-center">
        <ShuffleDeal
          stage={stage}
          playerCount={setup.playerCount}
          shufflingLabel={t("shuffling", lang)}
          dealingLabel={t("dealing", lang)}
        />
      </main>
    );
  }

  if (state.phase === "finished") {
    return (
      <main className="felt flex min-h-dvh flex-col">
        <GameOver
          state={state}
          viewSeat={humanSeat}
          lang={lang}
          stats={statsLoading ? null : stats}
          statsAreLocal={isLocal}
          avatars={avatars}
          onRematch={handleRematch}
          onNewGame={() => router.push("/play?mode=cpu")}
        />
      </main>
    );
  }

  return (
    <main className="felt flex h-dvh flex-col overflow-hidden">
      <Toast message={toast} />

      <header className="relative z-20 flex shrink-0 items-center gap-2 px-2 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1">
        <Link href="/" className="btn btn-ghost !min-h-9 !px-2 !text-xs" aria-label="Leave game">
          ☰
        </Link>
        <span className="font-display flex-1 text-base font-bold text-cream-50">Thulla</span>
        <span className="tabular text-[0.7rem] text-cream-400">
          Trick {state.trickNumber} · {state.config.difficulty}
        </span>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <ThullaToast notice={thulla} />
        <GameTable
          state={state}
          viewSeat={humanSeat}
          legal={legal}
          isMyTurn={isHumanTurn}
          shakeCard={invalid?.card ?? null}
          lang={lang}
          avatars={avatars}
          onPlay={handlePlay}
          outAction={
            <button onClick={fastForward} className="btn btn-secondary !min-h-11 text-sm">
              ⏭ Skip to the result
            </button>
          }
          banner={
            aceNotice ? (
              <p className="anim-pop rounded-full bg-brass-400/15 px-4 py-1.5 text-sm font-semibold text-brass-200 ring-1 ring-brass-300/40">
                {aceNotice}
              </p>
            ) : state.mustPlay && isHumanTurn ? (
              <p className="anim-pop rounded-full bg-brass-400/15 px-4 py-1.5 text-sm font-semibold text-brass-200 ring-1 ring-brass-300/40">
                🔵 {t("yourTurn", lang)} — 🂡 {t("mustLeadAce", lang)} ({cardLabel(ACE_OF_SPADES)})
              </p>
            ) : undefined
          }
        />
      </div>
    </main>
  );
}
