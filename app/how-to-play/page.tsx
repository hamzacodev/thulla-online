"use client";

import { AppHeader } from "@/components/AppHeader";
import { ThullaRules } from "@/components/ThullaRules";

/**
 * Kept so existing links still work. The rules themselves live in
 * `ThullaRules`, which `/games/thulla/rules` renders too.
 */
export default function HowToPlayPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="How to Play" />
      <ThullaRules />
    </main>
  );
}
