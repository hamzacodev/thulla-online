"use client";

import { AppHeader } from "@/components/AppHeader";
import { HistoryBrowser } from "@/components/HistoryBrowser";

/** Account-level history. Thulla's own copy lives at /games/thulla/history. */
export default function HistoryPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="Game History" back="/profile" />
      <HistoryBrowser />
    </main>
  );
}
