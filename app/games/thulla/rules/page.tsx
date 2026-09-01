"use client";

import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { ThullaRules } from "@/components/ThullaRules";

export default function ThullaRulesPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <PlatformNav />
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Thulla", href: "/games/thulla" },
            { label: "How to Play" },
          ]}
        />
        <h1 className="font-display text-2xl font-bold text-cream-50">How to Play Thulla</h1>
      </div>
      <ThullaRules />
    </main>
  );
}
