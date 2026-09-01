"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "info" | "error" | "good";
}

/**
 * Transient messages. Announced politely rather than assertively — these
 * narrate the game, they aren't alerts, and an assertive region would talk
 * over a screen reader mid-sentence on every trick.
 *
 * Rendered into `document.body` rather than in place. The table sets
 * `isolation: isolate` and the header is a positioned, z-indexed ancestor,
 * and either one is enough to cap a child's z-index no matter how high it
 * is — which is how a message meant to be read ended up underneath the
 * furniture. A portal is the one version of this that can't be trapped.
 */
export function Toast({ message }: { message: ToastMessage | null }) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // A portal needs a DOM to aim at, which the server render doesn't have.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the client mount, the only point a portal target exists
  useEffect(() => setMounted(true), []);
  // Derived: the latest message is visible until its own timer retires it.
  const shown = message && message.id !== dismissedId ? message : null;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setDismissedId(message.id), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] flex justify-center px-4"
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
    </div>,
    document.body
  );
}
