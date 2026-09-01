"use client";

import { useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { removeAvatar, uploadAvatar } from "@/lib/avatars";

/**
 * Upload, replace or clear your own profile picture. The file never touches
 * our API routes — it's cropped in the browser and sent straight to storage
 * under the uploader's own folder.
 */
export function AvatarPicker({
  userId,
  name,
  url,
  onChange,
}: {
  userId: string;
  name: string;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await uploadAvatar(userId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that picture.");
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError("");
    try {
      await removeAvatar(userId);
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove your picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar src={url} name={name} size={60} ringClass="ring-brass-400/40" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-cream-100">Profile picture</p>
          <p className="mt-0.5 text-xs text-cream-400">
            So everyone knows who they&apos;re playing. Shown at the table.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="btn btn-secondary !min-h-9 !px-3 !text-xs"
            >
              {busy ? "Working…" : url ? "Change photo" : "📷 Upload photo"}
            </button>
            {url && !busy && (
              <button
                type="button"
                onClick={handleRemove}
                className="btn btn-ghost !min-h-9 !px-2.5 !text-xs"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {error && (
        <p className="mt-2.5 rounded-lg bg-chili-500/15 px-3 py-2 text-xs text-chili-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
