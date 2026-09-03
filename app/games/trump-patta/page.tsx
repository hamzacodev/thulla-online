"use client";

import { notFound } from "next/navigation";
import { PlatformNav } from "@/components/PlatformNav";
import { GameHub, type HubAction } from "@/components/GameHub";
import { getGame } from "@/lib/games";

const ACTIONS: HubAction[] = [
  { href: "/games/trump-patta/rules", icon: "📖", label: "How to Play", hint: "Pairs, picks, the Thief" },
  { href: "/games/trump-patta/stats", icon: "📊", label: "My Trump-Patta Stats", hint: "Thief count, streaks" },
  { href: "/games/trump-patta/history", icon: "🕘", label: "Trump-Patta History", hint: "Every game you've finished" },
  { href: "/settings", icon: "⚙️", label: "Settings", hint: "Sound, speed, animations" },
];

export default function TrumpPattaHubPage() {
  const game = getGame("trump_patta");
  if (!game) notFound();

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="relative z-10 flex-1">
        <GameHub game={game} playHref="/games/trump-patta/play" actions={ACTIONS} />
      </div>
    </main>
  );
}
