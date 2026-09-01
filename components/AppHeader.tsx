"use client";

import Link from "next/link";

export function AppHeader({
  title,
  back = "/",
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/[0.07] bg-ink-950/85 px-2 py-2 backdrop-blur-md">
      <Link href={back} className="btn btn-ghost !min-h-10 !px-2.5" aria-label="Go back">
        <span aria-hidden>←</span>
      </Link>
      <h1 className="font-display flex-1 truncate text-lg font-bold text-cream-50">{title}</h1>
      {right}
    </header>
  );
}
