"use client";

import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { HistoryBrowser } from "@/components/HistoryBrowser";

export default function ThullaHistoryPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Thulla", href: "/games/thulla" },
            { label: "History" },
          ]}
        />
        <h1 className="font-display text-2xl font-bold text-cream-50">Thulla history</h1>
      </div>
      <HistoryBrowser />
    </main>
  );
}
