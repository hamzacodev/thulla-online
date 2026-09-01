"use client";

/**
 * Storage keys were renamed when the game's own name settled on Thulla.
 * This reads the current key and, the first time it's missing, carries the
 * value over from the old one — so a player who was mid-game or already had
 * a local record doesn't silently lose it to a rename.
 */
export function readLocal(key: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;

    const legacyKey = key.replace(/^thulla\./, "bhabhi.");
    if (legacyKey === key) return null;

    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return null;

    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  } catch {
    // Private mode or blocked storage — the caller falls back to defaults.
    return null;
  }
}
