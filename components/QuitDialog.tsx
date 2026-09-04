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
  mode = "concede",
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  /**
   * "concede" ends the game for the whole table and is only offered at the
   * death. "handover" is the way out before that: you leave, the computer
   * plays your cards, and nobody else's game is spoiled.
   */
  mode?: "concede" | "handover";
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

  // Typing the word is for the irreversible one. Handing over only ends
  // your own involvement, so a plain confirm is proportionate.
  const ready = mode === "handover" || typed.trim().toUpperCase() === CONFIRM_WORD;

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
          {mode === "handover" ? "Leave the table?" : "Quit this game?"}
        </p>
        {mode === "handover" ? (
          <>
            <p className="mt-2 text-sm text-cream-400">
              The computer takes your seat and plays your cards. The game carries on for
              everyone else, and the result still counts as yours — you keep your place in the
              standings whatever the computer manages.
            </p>
            <p className="mt-2 text-sm text-cream-400">
              Quitting outright would end the game for the whole table, so that only unlocks
              once two players are left.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-cream-400">
              You&apos;ll be the Thulla, and the game ends for everyone at the table. It goes on
              your record like any other game — quitting stops the game, it doesn&apos;t undo the
              loss.
            </p>
            <p className="mt-2 text-sm text-cream-400">You can always deal a rematch afterwards.</p>
          </>
        )}

        <label className={`mt-4 block ${mode === "handover" ? "hidden" : ""}`}>
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
            {busy
              ? mode === "handover"
                ? "Leaving…"
                : "Quitting…"
              : mode === "handover"
              ? "🤖 Leave"
              : "Quit game"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
