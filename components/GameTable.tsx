"use client";

import { Hand } from "./Hand";
import { SeatPod } from "./SeatPod";
import { TrickPile } from "./TrickPile";
import type { GameState } from "@/lib/engine/types";
import type { Card } from "@/lib/engine/cards";
import { phrase, t, type Lang } from "@/lib/copy";

interface GameTableProps {
  state: GameState;
  viewSeat: number;
  legal: Card[];
  isMyTurn: boolean;
  shakeCard: Card | null;
  lang: Lang;
  onPlay: (card: Card) => void;
  banner?: React.ReactNode;
}

/**
 * The playing surface. Opponents wrap into a row on phones and sit on an
 * ellipse from `md` up — the coordinates are handed to CSS as custom
 * properties and only consumed inside the desktop media query, so both
 * layouts come from one pass of markup.
 */
export function GameTable({
  state,
  viewSeat,
  legal,
  isMyTurn,
  shakeCard,
  lang,
  onPlay,
  banner,
}: GameTableProps) {
  const total = state.players.length;
  const me = state.players[viewSeat];
  const others = Array.from({ length: total - 1 }, (_, i) => state.players[(viewSeat + 1 + i) % total]);

  const turnPlayer = state.phase === "playing" ? state.players[state.turnSeat] : null;
  const waitingOnCpu = turnPlayer?.kind === "cpu";

  return (
    <div className="flex min-h-0 flex-1 flex-col md:justify-center">
      {/* Opponents. On phones this is a plain column (a wrapped row of pods
          above a centred pile); from md up `md:contents` dissolves the
          wrappers so the pods become children of the positioned ring. */}
      <div className="seat-ring flex min-h-0 flex-1 flex-col md:block md:flex-none">
        <div className="flex flex-wrap items-start justify-center gap-2 px-2 pt-2 md:contents">
        {others.map((p, i) => {
          // Spread across the upper half of the ellipse, left to right.
          // Spread across the upper half of the ellipse, left to right. A
          // crowded table needs a wider arc and shorter pods to stay legible.
          const crowded = others.length > 5;
          const angle = Math.PI + ((i + 1) * Math.PI) / (others.length + 1);
          const x = 50 + Math.cos(angle) * (crowded ? 45 : 40);
          const y = 50 + Math.sin(angle) * (crowded ? 46 : 42);
          return (
            <div
              key={p.seat}
              className="seat-slot anim-rise"
              style={{
                ["--seat-x" as string]: `${x}%`,
                ["--seat-y" as string]: `${y}%`,
                animationDelay: `${i * 55}ms`,
              }}
            >
              <SeatPod
                player={p}
                isTurn={state.phase === "playing" && state.turnSeat === p.seat}
                isThinking={state.phase === "playing" && state.turnSeat === p.seat && p.kind === "cpu"}
                thinkingLabel={t("thinking", lang)}
                cardsLabel={t("cards", lang)}
                outLabel={t("safe", lang)}
                compact={others.length > 4}
                dense={others.length > 5}
              />
            </div>
          );
        })}
        </div>

        {/* Centre pile — fills the space between the pods and the hand on a
            phone, absolutely centred inside the ring on a wider screen. */}
        <div className="flex min-h-0 flex-1 items-center justify-center md:absolute md:left-1/2 md:top-1/2 md:block md:w-auto md:flex-none md:-translate-x-1/2 md:-translate-y-1/2">
          <TrickPile state={state} viewSeat={viewSeat} emptyLabel={t("yourTurnHint", lang)} />
        </div>
      </div>

      {/* Status line */}
      <div className="flex min-h-[3.25rem] items-center justify-center px-3 py-2">
        {banner ?? (
          <p
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              isMyTurn
                ? "bg-mint-400/15 text-mint-300 ring-1 ring-mint-300/40"
                : "text-cream-400"
            }`}
            aria-live="polite"
          >
            {isMyTurn
              ? `🔵 ${t("yourTurn", lang)} — ${t("yourTurnHint", lang)}`
              : turnPlayer
              ? waitingOnCpu
                ? `🤖 ${phrase.isThinking(turnPlayer.name, lang)}`
                : phrase.waitingFor(turnPlayer.name, lang)
              : ""}
          </p>
        )}
      </div>

      {/* Your seat */}
      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-center gap-2 px-3 pb-1 text-xs text-cream-400">
          <span aria-hidden>🙂</span>
          <span className="font-semibold text-cream-100">{me?.name}</span>
          <span className="tabular">
            · {me?.hand.length ?? 0} {t("cards", lang)}
          </span>
        </div>
        {me && me.hand.length > 0 ? (
          <Hand
            hand={me.hand}
            legal={legal}
            enabled={isMyTurn}
            shakeCard={shakeCard}
            onPlay={onPlay}
            playLabel={t("play", lang)}
          />
        ) : (
          <div className="grid min-h-[8rem] place-items-center px-4 text-center">
            <p className="text-sm text-mint-300">✓ {phrase.isOut(me?.name ?? "", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
