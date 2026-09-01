"use client";

import { Suspense } from "react";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { ThullaSetup } from "@/components/ThullaSetup";

/**
 * Thulla's setup, inside the game's own section. The screen is the shared
 * `ThullaSetup` — this route only supplies the platform chrome and the
 * breadcrumb back out.
 */
export default function ThullaPlayPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-cream-400">Loading…</main>}>
      <main className="flex min-h-dvh flex-col">
        <PlatformNav />
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <Breadcrumbs
            trail={[
              { label: "Games", href: "/games" },
              { label: "Thulla", href: "/games/thulla" },
              { label: "New game" },
            ]}
          />
          <h1 className="font-display text-2xl font-bold text-cream-50">Start a Thulla game</h1>
        </div>
        <ThullaSetup basePath="/games/thulla/play" />
      </main>
    </Suspense>
  );
}
