"use client";

import { useState } from "react";
import {
  MAX_BEST_OF,
  MIN_BEST_OF,
  SERIES_PRESETS,
  isValidBestOf,
  winsRequired,
} from "@/lib/series/rules";

/**
 * Choosing how long the match is.
 *
 * Custom only takes odd numbers, and the input says so rather than silently
 * correcting: an even best-of can finish level, and neither game has a
 * tie-break rule to fall back on.
 *
 * Shared by Thulla and Bluff. The series layer sits above both engines, so
 * the picker has no idea which game it's configuring.
 */
export function SeriesFormatPicker({
  bestOf,
  onChange,
  disabled,
}: {
  bestOf: number;
  onChange: (bestOf: number) => void;
  disabled?: boolean;
}) {
  const isPreset = (SERIES_PRESETS as readonly number[]).includes(bestOf);
  const [custom, setCustom] = useState(isPreset ? "9" : String(bestOf));
  const [customOpen, setCustomOpen] = useState(!isPreset);

  const customValue = Number(custom);
  const customValid = isValidBestOf(customValue) && customValue > 1;

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-cream-100">Series format</h2>
      <p className="mb-2 text-xs text-cream-400">
        A series keeps the same table and plays until somebody has won enough games.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {SERIES_PRESETS.map((n) => {
          const active = !customOpen && bestOf === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustomOpen(false);
                onChange(n);
              }}
              aria-pressed={active}
              className={`btn flex-col !min-h-16 !gap-0.5 !px-2 ${active ? "btn-primary" : "btn-secondary"}`}
            >
              <span className="text-sm font-bold">{n === 1 ? "Single game" : `Best of ${n}`}</span>
              <span className={`text-[0.65rem] ${active ? "text-ink-950/70" : "text-cream-400"}`}>
                {n === 1 ? "One and done" : `First to ${winsRequired(n)} wins`}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomOpen(true);
            if (customValid) onChange(customValue);
          }}
          aria-pressed={customOpen}
          className={`btn col-span-2 flex-col !min-h-16 !gap-0.5 !px-2 ${
            customOpen ? "btn-primary" : "btn-secondary"
          }`}
        >
          <span className="text-sm font-bold">Custom</span>
          <span className={`text-[0.65rem] ${customOpen ? "text-ink-950/70" : "text-cream-400"}`}>
            Any odd number from {MIN_BEST_OF} to {MAX_BEST_OF}
          </span>
        </button>
      </div>

      {customOpen && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-xs text-cream-400">Best of</span>
            <input
              type="number"
              inputMode="numeric"
              className="field tabular w-24 text-center"
              value={custom}
              min={MIN_BEST_OF}
              max={MAX_BEST_OF}
              step={2}
              disabled={disabled}
              onChange={(e) => {
                setCustom(e.target.value);
                const n = Number(e.target.value);
                if (isValidBestOf(n) && n > 1) onChange(n);
              }}
            />
            <span className="tabular text-sm text-cream-100">
              {customValid ? `First to ${winsRequired(customValue)} wins` : ""}
            </span>
          </label>
          {!customValid && (
            <p className="mt-1.5 text-xs text-chili-400" role="alert">
              Has to be an odd number between {MIN_BEST_OF} and {MAX_BEST_OF} — an even one can
              finish level, and there&apos;s no tie-break.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
