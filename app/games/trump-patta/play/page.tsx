"use client";

import { Suspense } from "react";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { TrumpPattaSetup } from "@/components/trumpPatta/TrumpPattaSetup";

export default function TrumpPattaPlayPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-cream-400">Loading…</main>}>
      <main className="flex min-h-dvh flex-col">
        <PlatformNav />
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <Breadcrumbs
            trail={[
              { label: "Games", href: "/games" },
              { label: "Trump-Patta", href: "/games/trump-patta" },
              { label: "New game" },
            ]}
          />
          <h1 className="font-display text-2xl font-bold text-cream-50">Start a Trump-Patta game</h1>
        </div>
        <TrumpPattaSetup basePath="/games/trump-patta/play" />
      </main>
    </Suspense>
  );
}
