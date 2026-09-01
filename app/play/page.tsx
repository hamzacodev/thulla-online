"use client";

import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ThullaSetup } from "@/components/ThullaSetup";

/**
 * The original setup route, kept so existing links and bookmarks still work.
 * The screen itself lives in `ThullaSetup`, which the game's own hub renders
 * too — see `/games/thulla/play`.
 */
export default function PlayPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-cream-400">Loading…</main>}>
      <main className="flex min-h-dvh flex-col">
        <AppHeader title="Start New Game" />
        <ThullaSetup basePath="/play" />
      </main>
    </Suspense>
  );
}
