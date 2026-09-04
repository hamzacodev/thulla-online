"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy a short string, and say so.
 *
 * The clipboard API is refused outside a secure context and in some
 * embedded browsers, so there's a fallback through a hidden textarea and
 * `execCommand`. It's deprecated and it still works everywhere the modern
 * one doesn't, which is the only reason it's here. If both fail the button
 * says so rather than pretending it copied.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  /** Announced to screen readers; the face of the button is an icon. */
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const box = document.createElement("textarea");
        box.value = value;
        // Off-screen rather than hidden: a display:none textarea can't be
        // selected, and an unselected one copies nothing.
        box.setAttribute("readonly", "");
        box.style.position = "fixed";
        box.style.left = "-9999px";
        document.body.appendChild(box);
        box.select();
        ok = document.execCommand("copy");
        document.body.removeChild(box);
      } catch {
        ok = false;
      }
    }

    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={state === "copied" ? "Copied" : label}
      aria-label={state === "copied" ? "Copied" : label}
      className={`btn btn-ghost !min-h-9 !gap-1.5 !px-2 !text-xs ${
        state === "copied" ? "!text-mint-300" : state === "failed" ? "!text-chili-400" : ""
      } ${className}`}
    >
      <span aria-hidden>{state === "copied" ? "✓" : state === "failed" ? "✕" : "📋"}</span>
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
