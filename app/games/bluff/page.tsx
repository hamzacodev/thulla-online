"use client";

import { notFound } from "next/navigation";
import { PlatformNav } from "@/components/PlatformNav";
import { GameHub, type HubAction } from "@/components/GameHub";
import { getGame } from "@/lib/games";

const ACTIONS: HubAction[] = [
  { href: "/games/bluff/rules", icon: "📖", label: "How to Play", hint: "Claim, lie, call it" },
  { href: "/games/bluff/stats", icon: "📊", label: "My Bluff Stats", hint: "Bluffs, calls, streaks" },
  { href: "/games/bluff/history", icon: "🕘", label: "Bluff History", hint: "Every Bluff game you've finished" },
  { href: "/settings", icon: "⚙️", label: "Settings", hint: "Sound, speed, animations" },
];

export default function BluffHubPage() {
  const game = getGame("bluff");
  if (!game) notFound();

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="relative z-10 flex-1">
        <GameHub game={game} playHref="/games/bluff/play" actions={ACTIONS} />
      </div>
    </main>
  );
}
