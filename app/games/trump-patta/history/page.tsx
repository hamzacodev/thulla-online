"use client";

import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { HistoryBrowser } from "@/components/HistoryBrowser";

export default function TrumpPattaHistoryPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Trump-Patta", href: "/games/trump-patta" },
            { label: "History" },
          ]}
        />
        <h1 className="font-display text-2xl font-bold text-cream-50">Trump-Patta history</h1>
        <p className="mt-0.5 text-xs text-cream-400">
          Trump-Patta games only — Thulla and Bluff keep their own.
        </p>
      </div>
      <HistoryBrowser gameId="trump_patta" />
    </main>
  );
}
