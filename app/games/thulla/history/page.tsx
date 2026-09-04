"use client";

import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { HistoryBrowser } from "@/components/HistoryBrowser";

export default function ThullaHistoryPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <PlatformNav />
      <div className="mx-auto w-full max-w-md shrink-0 px-4 pt-4">
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
