"use client";

import { PlatformNav } from "@/components/PlatformNav";
import { GameRow } from "@/components/GameRow";
import { GAMES } from "@/lib/games";

/**
 * The shelf. Rendered straight from the registry, so a new game shows up
 * here the moment it's added to `lib/games.ts` — this page never needs
 * touching again. Same row as the home page, for the same reason: nothing
 * should stand out because of where it was put.
 */
export default function GamesPage() {
  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
        <h1 className="font-display text-3xl font-bold text-cream-50 sm:text-4xl">Games</h1>
        <p className="mt-1 text-sm text-cream-400">Apni game choose karo 😎</p>

        <div className="mt-6 space-y-4">
          {GAMES.map((game, i) => (
            <GameRow key={game.id} game={game} index={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
