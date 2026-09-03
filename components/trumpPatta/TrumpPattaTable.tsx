"use client";

import { Avatar } from "../Avatar";
import type { PublicPlayer } from "@/lib/trumpPatta/types";

/**
 * One player, round the edge of the table.
 *
 * Built from `PublicPlayer` — the redacted shape — so it could not render
 * somebody's cards even if it tried. The count is public; the faces never are.
 */
function Pod({
  player,
  avatarUrl,
  isDonor,
  isPicker,
  compact,
}: {
  player: PublicPlayer;
  avatarUrl?: string;
  isDonor: boolean;
  isPicker: boolean;
  compact?: boolean;
}) {
  const isOut = player.cardCount === 0;
  const tone = isPicker
    ? "border-brass-400/60 bg-brass-500/15"
    : isDonor
      ? "border-cream-100/40 bg-white/10"
      : isOut
        ? "border-emerald-400/25 bg-emerald-500/5"
        : "border-white/10 bg-ink-900/45";

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 backdrop-blur-sm transition-colors ${tone}`}
    >
      <Avatar
        src={avatarUrl}
        name={player.name}
        size={compact ? 26 : 30}
        dim={isOut}
        ringClass={isPicker ? "ring-brass-400/70" : "ring-white/15"}
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold leading-tight text-cream-100">{player.name}</p>
        <p className="tabular truncate text-[0.7rem] leading-tight text-cream-400">
          {isOut ? "✅ Safe" : `${player.cardCount} card${player.cardCount === 1 ? "" : "s"}`}
        </p>
      </div>
      {(isDonor || isPicker) && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.58rem] font-bold uppercase leading-none tracking-wide ${
            isPicker ? "bg-brass-500/30 text-brass-200" : "bg-white/15 text-cream-100"
          }`}
        >
          {isPicker ? "Picking" : "Showing"}
        </span>
      )}
    </div>
  );
}

/**
 * The playing surface, laid out the way Thulla's is: opponents wrap into a
 * row on phones and sit on an ellipse from `md` up, around an actual table.
 *
 * The same `.seat-ring` / `.seat-slot` CSS drives both games — the arc
 * positions are handed to CSS as custom properties and only consumed inside
 * the desktop media query, so one pass of markup gives both layouts. Sharing
 * it is the point: two card games on one site should feel like one site.
 *
 * The middle of the table is `centre` — whatever the moment calls for. The
 * fan you're picking from, or the card you just turned over.
 */
export function TrumpPattaTable({
  players,
  viewSeat,
  donorSeat,
  pickerSeat,
  avatars,
  centre,
  banner,
}: {
  players: PublicPlayer[];
  viewSeat: number;
  donorSeat: number;
  pickerSeat: number;
  avatars?: Record<string, string>;
  centre: React.ReactNode;
  banner?: React.ReactNode;
}) {
  const total = players.length;
  const others = Array.from({ length: total - 1 }, (_, i) => players[(viewSeat + 1 + i) % total]);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:justify-center">
      <div className="seat-ring flex min-h-0 flex-1 flex-col md:block md:flex-none">
        <div className="flex flex-wrap items-start justify-center gap-2 px-2 pt-2 md:contents">
          {others.map((p, i) => {
            // Walk the arc end to end, so the outermost players sit where the
            // table actually stops rather than huddling in the middle.
            const crowded = others.length > 5;
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
                <Pod
                  player={p}
                  avatarUrl={avatars?.[p.id]}
                  isDonor={p.seat === donorSeat}
                  isPicker={p.seat === pickerSeat}
                  compact={others.length > 4}
                />
              </div>
            );
          })}
        </div>

        {/* The middle of the table. z-2 beats the seats' z-1 — if the fan and
            a pod ever overlap, the cards win. */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-1 md:absolute md:left-1/2 md:top-1/2 md:z-[2] md:block md:w-auto md:flex-none md:-translate-x-1/2 md:-translate-y-1/2 md:px-0 md:py-0">
          {centre}
        </div>
      </div>

      {banner && (
        <div className="flex min-h-[2rem] items-center justify-center px-3 pb-0.5 pt-1">{banner}</div>
      )}
    </div>
  );
}
