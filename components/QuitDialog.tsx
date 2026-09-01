"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** What has to be typed. Compared case-insensitively, trimmed. */
const CONFIRM_WORD = "QUIT";

/**
 * Quitting mid-game is not undoable and it ends the game for everyone at the
 * table, so it asks for the word to be typed rather than offering a button
 * that a thumb can find by accident. A plain "are you sure?" gets tapped
 * through without being read; typing can't happen by mistake.
 *
 * Rendered into `document.body` — the table sets `isolation: isolate` and the
 * header is a positioned ancestor, either of which would otherwise cap this
 * below the furniture.
 */
export function QuitDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A portal needs a DOM to aim at, which the server render doesn't have.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the client mount, the only point a portal target exists
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Mounted only while it's open, so the typed word resets by itself rather
  // than needing an effect to clear it.
  if (!mounted) return null;

  const ready = typed.trim().toUpperCase() === CONFIRM_WORD;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quit-title"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="panel anim-pop w-full max-w-sm p-5">
        <p id="quit-title" className="font-display text-xl font-bold text-cream-50">
          Quit this game?
        </p>
        <p className="mt-2 text-sm text-cream-400">
          You&apos;ll be the Thulla, and the game ends for everyone at the table. It goes on
          your record like any other game — quitting stops the game, it doesn&apos;t undo the
          loss.
        </p>
        <p className="mt-2 text-sm text-cream-400">You can always deal a rematch afterwards.</p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-cream-400">
            Type <span className="font-mono font-bold text-chili-400">{CONFIRM_WORD}</span> to
            confirm
          </span>
          <input
            ref={inputRef}
            className="field"
            value={typed}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`Type ${CONFIRM_WORD} to confirm`}
            placeholder={CONFIRM_WORD}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready && !busy) onConfirm();
            }}
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1">
            Keep playing
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready || busy}
            className="btn flex-1 !border-chili-400/50 !bg-chili-500/85 !text-white disabled:!bg-chili-500/30"
          >
            {busy ? "Quitting…" : "Quit game"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
