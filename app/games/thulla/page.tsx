"use client";

import { notFound } from "next/navigation";
import { PlatformNav } from "@/components/PlatformNav";
import { GameHub, type HubAction } from "@/components/GameHub";
import { getGame } from "@/lib/games";

/**
 * Thulla's front door. Everything specific to Thulla hangs off here, so the
 * platform pages stay about the platform.
 */
const ACTIONS: HubAction[] = [
  { href: "/games/thulla/rules", icon: "📖", label: "How to Play", hint: "Rules, in about a minute" },
  { href: "/games/thulla/stats", icon: "📊", label: "My Stats", hint: "Wins, thullas, streaks" },
  { href: "/games/thulla/history", icon: "🕘", label: "Game History", hint: "Every game you've finished" },
  { href: "/settings", icon: "⚙️", label: "Game Settings", hint: "Sound, speed, difficulty" },
];

export default function ThullaHubPage() {
  const game = getGame("thulla");
  if (!game) notFound();

  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="relative z-10 flex-1">
        <GameHub game={game} playHref="/games/thulla/play" actions={ACTIONS} />
      </div>
    </main>
  );
}
