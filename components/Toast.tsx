"use client";

import { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "info" | "error" | "good";
}

/**
 * Transient messages. Announced politely rather than assertively — these
 * narrate the game, they aren't alerts, and an assertive region would talk
 * over a screen reader mid-sentence on every trick.
 */
export function Toast({ message }: { message: ToastMessage | null }) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  // Derived: the latest message is visible until its own timer retires it.
  const shown = message && message.id !== dismissedId ? message : null;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setDismissedId(message.id), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      {shown && (
        <p
          key={shown.id}
          className={`anim-pop max-w-[92vw] rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur ${
            shown.tone === "error"
              ? "bg-chili-500/90 text-white"
              : shown.tone === "good"
              ? "bg-mint-400/90 text-ink-950"
              : "bg-ink-900/92 text-cream-50 ring-1 ring-brass-400/30"
          }`}
        >
          {shown.text}
        </p>
      )}
    </div>
  );
}
