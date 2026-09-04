"use client";

import { Avatar } from "./Avatar";
import { SpeakingWaves } from "./SpeakingWaves";
import { Hand } from "./Hand";
import { SeatPod, rankBadge } from "./SeatPod";
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
  /** Profile pictures by user id — online tables only; CPUs keep their 🤖. */
  avatars?: Record<string, string>;
  /** Player ids talking on voice chat right now. Online tables only. */
  speakingIds?: ReadonlySet<string>;
  banner?: React.ReactNode;
  /** Shown once the viewer is out — e.g. "skip to the result". */
  outAction?: React.ReactNode;
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
  avatars,
  speakingIds,
  banner,
  outAction,
}: GameTableProps) {
  const total = state.players.length;
  const me = state.players[viewSeat];
  const others = Array.from({ length: total - 1 }, (_, i) => state.players[(viewSeat + 1 + i) % total]);

  // How far round the table each opponent is from you, counting only players
  // who still hold cards — anyone out is skipped in the turn order, so
  // counting them would make the numbers lie.
  const turnsAway = new Map<number, number>();
  let step = 0;
  for (const p of others) {
    if (p.hand.length === 0) continue;
    turnsAway.set(p.seat, ++step);
  }

  const turnPlayer = state.phase === "playing" ? state.players[state.turnSeat] : null;
  // A seat the computer inherited waits like any other CPU seat.
  const waitingOnCpu = turnPlayer?.kind === "cpu" || !!turnPlayer?.autoplay;

  // At the end of a trick, mark whoever played the highest card of the led
  // suit — they either took the trick or are about to eat the pile.
  const outcome = state.phase === "trickEnd" ? state.trickOutcome : null;
  const seniorSeat =
    outcome?.kind === "discard"
      ? outcome.winnerSeat
      : outcome?.kind === "pickup"
      ? outcome.collectorSeat
      : -1;
  const seniorTone: "won" | "collects" | null =
    outcome?.kind === "discard" ? "won" : outcome?.kind === "pickup" ? "collects" : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:justify-center">
      {/* Opponents. On phones this is a plain column (a wrapped row of pods
          above a centred pile); from md up `md:contents` dissolves the
          wrappers so the pods become children of the positioned ring. */}
      <div className="seat-ring flex min-h-0 flex-1 flex-col md:block md:flex-none">
        <div className="flex flex-wrap items-start justify-center gap-2 px-2 pt-2 md:contents">
        {others.map((p, i) => {
          // Spread across the upper half of the ellipse, left to right.
          //
          // Evenly spaced *interior* angles used to leave the ends unused:
          // three opponents landed on cos(±π/4), which is 70% of the radius,
          // so they huddled in the middle third of a wide screen with acres
          // of empty felt either side. Walking the arc end to end instead
          // puts the outermost players where the table actually ends.
          const crowded = others.length > 5;
          // 0 at the left end of the arc, 1 at the right.
          const along = others.length === 1 ? 0.5 : 0.09 + (0.82 * i) / (others.length - 1);
          const angle = Math.PI + Math.PI * along;
          const x = 50 + Math.cos(angle) * (crowded ? 46 : 44);
          const y = 50 + Math.sin(angle) * (crowded ? 45 : 42);
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
                turnsAway={turnsAway.get(p.seat) ?? null}
                speaking={!!speakingIds?.has(p.id)}
                avatarUrl={avatars?.[p.id]}
                isTurn={state.phase === "playing" && state.turnSeat === p.seat}
                isThinking={
                  state.phase === "playing" &&
                  state.turnSeat === p.seat &&
                  (p.kind === "cpu" || !!p.autoplay)
                }
                thinkingLabel={t("thinking", lang)}
                cardsLabel={t("cards", lang)}
                outLabel={t("safe", lang)}
                highlight={p.seat === seniorSeat ? seniorTone : null}
                compact={others.length > 4}
                dense={others.length > 5}
              />
            </div>
          );
        })}
        </div>

        {/* Centre pile — fills the space between the pods and the hand on a
            phone, absolutely centred inside the ring on a wider screen. */}
        {/* z-2 beats the seats' z-1: the wrapper's own transform makes it a
            stacking context, so a z-index on the pile inside it can't lift it
            past a pod. If the two ever meet, the played cards win. */}
        <div className="flex min-h-0 flex-1 items-center justify-center py-1 md:absolute md:left-1/2 md:top-1/2 md:z-[2] md:block md:w-auto md:flex-none md:items-center md:pb-0 md:-translate-x-1/2 md:-translate-y-1/2">
          <TrickPile state={state} viewSeat={viewSeat} emptyLabel={t("yourTurnHint", lang)} />
        </div>
      </div>

      {/* Status line */}
      <div className="flex min-h-[2rem] items-center justify-center px-3 pb-0.5 pt-1">
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
      <div className="shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div
          className={`mx-auto flex w-fit items-center justify-center gap-2 rounded-full px-3 py-1 text-xs transition-colors ${
            viewSeat === seniorSeat && seniorTone === "won"
              ? "anim-pop bg-brass-400/20 text-brass-200 ring-1 ring-brass-300/60"
              : viewSeat === seniorSeat && seniorTone === "collects"
              ? "anim-pop bg-chili-500/20 text-chili-400 ring-1 ring-chili-400/60"
              : "text-cream-400"
          }`}
        >
          {me && <Avatar src={avatars?.[me.id]} name={me.name} size={18} />}
          <span className="font-semibold text-cream-100">{me?.name}</span>
          {/* Always in the layout, only sometimes visible — otherwise your own
              strip changes width every time you open your mouth. */}
          {me && (
            <span className={speakingIds?.has(me.id) ? "" : "invisible"} aria-hidden={!speakingIds?.has(me.id)}>
              <SpeakingWaves name="You" />
            </span>
          )}
          {viewSeat === seniorSeat && seniorTone === "won" ? (
            <span className="font-semibold">· 🏆 took the trick</span>
          ) : viewSeat === seniorSeat && seniorTone === "collects" ? (
            <span className="font-semibold">· 😂 picks up</span>
          ) : (
            <span className="tabular">
              · {me?.hand.length ?? 0} {t("cards", lang)}
            </span>
          )}
        </div>
        {me && me.hand.length > 0 ? (
          <Hand
            hand={me.hand}
            legal={legal}
            enabled={isMyTurn}
            shakeCard={shakeCard}
            onPlay={onPlay}
          />
        ) : (
          <div className="grid min-h-[8rem] place-items-center gap-3 px-4 text-center">
            <p className="text-sm font-semibold text-mint-300">
              {me?.finishedRank != null ? `${rankBadge(me.finishedRank)} — ` : "✓ "}
              {phrase.isOut(me?.name ?? "", lang)}
            </p>
            {outAction}
          </div>
        )}
      </div>
    </div>
  );
}
