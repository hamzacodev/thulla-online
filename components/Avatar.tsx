"use client";

import { useState } from "react";

/**
 * A player's face, or their initials on a colour picked from their name —
 * deterministic, so the same person is the same colour on every device and
 * the table stays recognisable even before anyone uploads a photo.
 *
 * Decorative by design: every avatar in the app sits next to the name it
 * belongs to, so it's hidden from screen readers rather than repeating it.
 */

const TONES = [
  "#1a6e55",
  "#b8862f",
  "#cf3f34",
  "#135843",
  "#94681f",
  "#2f5d8a",
  "#6d4a8f",
  "#0e4535",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function tone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({
  src,
  name,
  size = 28,
  ringClass = "ring-white/15",
  dim = false,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  ringClass?: string;
  /** For players who are out, or otherwise not in play. */
  dim?: boolean;
  className?: string;
}) {
  // Remembering *which* src failed, rather than a flag, means a newly
  // uploaded picture gets a fresh attempt with no effect to reset it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold leading-none text-white/95 ring-1 ${ringClass} ${
        dim ? "opacity-60" : ""
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        background: showImage ? "rgba(255,255,255,0.06)" : tone(name),
      }}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element -- these are already 256px squares in Supabase Storage; routing eight of them per table through the image optimiser buys nothing and spends Hobby-tier quota */
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
