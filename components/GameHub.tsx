"use client";

import Link from "next/link";
import { PlayingCard } from "./PlayingCard";
import { Breadcrumbs } from "./PlatformNav";
import { gameMeta, type GameDefinition } from "@/lib/games";

export interface HubAction {
  href: string;
  icon: string;
  label: string;
  hint: string;
}

/**
 * A game's front door: what it is, one big way in, and everything else about
 * it within reach. The shell is the same for every game — `<GameHub game={…}
 * actions={…} />` — because the parts that differ between games are the
 * rules and the table, not the layout of the page that links to them.
 *
 * One primary action, deliberately. A hub with six equal buttons is a menu,
 * and people came here to play.
 */
export function GameHub({
  game,
  playHref,
  actions,
}: {
  game: GameDefinition;
  playHref: string;
  actions: HubAction[];
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
      <Breadcrumbs trail={[{ label: "Games", href: "/games" }, { label: game.name }]} />

      <section className="panel anim-rise overflow-hidden p-6 text-center sm:p-8">
        {/* A quiet fan of the game's cards behind the title. */}
        <div className="relative mx-auto mb-5 h-[calc(var(--card-h)*1.15)] w-[calc(var(--card-w)*2.6)]">
          {game.art.map((card, i) => (
            <span
              key={`${card}-${i}`}
              aria-hidden
              className="anim-rise absolute bottom-0 left-1/2 origin-bottom"
              style={{
                transform: `translateX(-50%) rotate(${(i - 1) * 15}deg) translateY(${
                  Math.abs(i - 1) * 6
                }px)`,
                zIndex: i === 1 ? 3 : 1,
                animationDelay: `${i * 90}ms`,
              }}
            >
              <PlayingCard card={card} />
            </span>
          ))}
        </div>

        <h1 className="font-display text-4xl font-bold tracking-tight text-cream-50 sm:text-5xl">
          <span aria-hidden>{game.emoji} </span>
          {game.name.toUpperCase()}
        </h1>
        <p className="mt-1.5 text-sm font-medium uppercase tracking-[0.2em] text-brass-300">
          {game.subtitle}
        </p>
        <p className="mt-3 text-sm italic text-cream-400">“{game.hook}” 😄</p>
        <p className="mt-1 text-xs text-cream-400/70">{gameMeta(game)}</p>

        <Link href={playHref} className="btn btn-primary mx-auto mt-6 !min-h-14 w-full max-w-xs text-base">
          🎮 Chalo Khelte Hain
        </Link>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {actions.map((action, i) => (
          <Link
            key={action.href}
            href={action.href}
            className="panel anim-rise flex items-center gap-3 p-4 transition-transform duration-200 ease-[var(--ease-card)] hover:-translate-y-0.5 hover:border-brass-400/40"
            style={{ animationDelay: `${80 + i * 60}ms` }}
          >
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xl">
              {action.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-cream-50">{action.label}</span>
              <span className="block truncate text-xs text-cream-400">{action.hint}</span>
            </span>
            <span aria-hidden className="ml-auto text-cream-400/50">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
