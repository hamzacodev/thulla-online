"use client";

import Link from "next/link";
import { PlayingCard } from "./PlayingCard";
import { gameMeta, type GameDefinition } from "@/lib/games";

/**
 * A game on the shelf: artwork, what it is, and the ways in.
 *
 * One row shape for every game, so nothing is singled out by its layout —
 * a game is featured by being playable, not by getting a bigger box. The
 * buttons come from the registry entry, because which modes a game offers
 * is the game's business, not this component's.
 *
 * A game that isn't playable yet renders the same row with its art muted
 * and no link anywhere, rather than a button that goes nowhere.
 */
export function GameRow({ game, index = 0 }: { game: GameDefinition; index?: number }) {
  const available = game.status === "available" && !!game.href;
  const quick = available ? game.quickPlay ?? [] : [];

  return (
    <article
      className={`panel anim-rise flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6 ${
        available ? "" : "opacity-70"
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="relative mx-auto h-[calc(var(--card-h)*1.12)] w-[calc(var(--card-w)*2.4)] shrink-0 sm:mx-0">
        {game.art.map((card, i) => (
          <span
            key={`${card}-${i}`}
            aria-hidden
            className="absolute bottom-0 left-1/2 origin-bottom"
            style={{
              transform: `translateX(-50%) rotate(${(i - 1) * 14}deg) translateY(${
                Math.abs(i - 1) * 6
              }px)`,
              zIndex: i === 1 ? 3 : 1,
            }}
          >
            <PlayingCard card={card} muted={!available} />
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p
          className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
            available ? "text-mint-300" : "text-cream-400"
          }`}
        >
          {available ? "Available now" : "Coming soon"}
        </p>

        <h3 className="font-display mt-1 text-2xl font-bold text-cream-50">
          <span aria-hidden>{game.emoji} </span>
          {game.name}
          <span className="text-base font-normal text-cream-400"> · {game.subtitle}</span>
        </h3>

        <p className="mt-1.5 text-sm text-cream-400">{game.blurb}</p>
        <p className="mt-2 text-sm italic text-cream-400/80">“{game.hook}” 😄</p>
        <p className="mt-2 text-[0.7rem] text-cream-400/70">{gameMeta(game)}</p>

        {available ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {quick.map((action, i) => (
              <Link
                key={action.href}
                href={action.href}
                className={`btn flex-1 ${i === 0 ? "btn-primary" : "btn-secondary"}`}
              >
                <span aria-hidden>{action.icon}</span> {action.label}
              </Link>
            ))}
            <Link
              href={game.href!}
              className={`btn ${quick.length ? "btn-ghost sm:!px-4" : "btn-primary flex-1"}`}
            >
              {quick.length ? "More →" : "Play Now →"}
            </Link>
          </div>
        ) : (
          <p className="btn btn-secondary mt-4 w-full !opacity-50 sm:w-auto sm:!px-6" aria-hidden>
            Coming soon
          </p>
        )}
      </div>
    </article>
  );
}
