"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import type { VoiceControls, VoicePeer } from "@/lib/useVoice";

/**
 * One peer's audio. Autoplay is allowed here because joining the call was a
 * deliberate tap, but Safari still likes to be asked explicitly.
 */
function PeerAudio({ peer }: { peer: VoicePeer }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.srcObject === peer.stream) return;
    el.srcObject = peer.stream;
    el.play().catch(() => {
      /* the element is muted or the tab is hidden; nothing to recover */
    });
  }, [peer.stream]);

  return <audio ref={ref} autoPlay playsInline muted={peer.silenced} />;
}

/**
 * A person on the call. Colour is never the only signal — a muted mic and a
 * speaker we've silenced both carry their own icon.
 */
function Chip({
  name,
  label,
  avatarUrl,
  speaking,
  muted,
  silenced,
  pending,
  title,
  onClick,
}: {
  name: string;
  /** Defaults to the name — used to tack "(you)" on without changing initials. */
  label?: string;
  avatarUrl?: string | null;
  speaking: boolean;
  muted: boolean;
  silenced?: boolean;
  pending?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors ${
        speaking
          ? "border-mint-300/70 bg-mint-400/20 text-cream-50"
          : "border-white/10 bg-white/[0.05] text-cream-200"
      }`}
    >
      <Avatar
        src={avatarUrl}
        name={name}
        size={20}
        ringClass={
          muted
            ? "ring-chili-400"
            : speaking
            ? "ring-mint-300"
            : pending
            ? "ring-brass-400"
            : "ring-white/15"
        }
      />
      <span className="max-w-[7rem] truncate">
        {label ?? name}
        {pending ? "…" : ""}
      </span>
      {muted && <span aria-hidden>🔇</span>}
      {silenced && <span aria-hidden>🚫</span>}
    </button>
  );
}

interface VoiceChatProps {
  voice: VoiceControls;
  /** What to call the player themselves in the roster. */
  selfName: string;
  /** Profile pictures by user id, so a voice is attached to a face. */
  avatars?: Record<string, string>;
  /** The player's own picture. */
  selfAvatar?: string | null;
  /** "panel" for the lobby and the results screen, "bar" for the game header. */
  variant?: "panel" | "bar";
}

export function VoiceChat({
  voice,
  selfName,
  avatars,
  selfAvatar,
  variant = "panel",
}: VoiceChatProps) {
  const live = voice.status === "live";
  const starting = voice.status === "starting";

  // Kept mounted in both variants: the audio has to keep playing while the
  // controls are compact.
  const audio = voice.peers.map((p) => <PeerAudio key={p.id} peer={p} />);

  if (variant === "bar") {
    const talking = voice.peers.filter((p) => p.speaking && !p.silenced).slice(0, 3);
    return (
      <div className="flex items-center gap-1">
        {audio}
        {!live ? (
          <button
            type="button"
            onClick={voice.join}
            disabled={starting}
            title={starting ? "Joining voice chat…" : "Join voice chat"}
            aria-label={starting ? "Joining voice chat" : "Join voice chat"}
            className="btn btn-secondary !min-h-9 !gap-1 !px-2.5 !text-xs"
          >
            <span aria-hidden>{starting ? "⏳" : "🎙️"}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={voice.toggleMute}
              aria-pressed={voice.muted}
              title={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
              aria-label={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
              className={`btn !min-h-9 !gap-1 !px-2.5 !text-xs ${
                voice.muted
                  ? "btn-secondary !border-chili-400/50 !text-chili-400"
                  : voice.speaking
                  ? "btn-secondary !border-mint-300/70 !text-mint-300"
                  : "btn-secondary"
              }`}
            >
              <span aria-hidden>{voice.muted ? "🔇" : "🎙️"}</span>
            </button>

            {talking.length > 0 && (
              <span className="flex items-center gap-0.5" aria-live="polite">
                {talking.map((p) => (
                  <span key={p.id} title={`${p.name} is talking`}>
                    <Avatar
                      src={avatars?.[p.id]}
                      name={p.name}
                      size={24}
                      ringClass="ring-mint-300/80"
                    />
                  </span>
                ))}
              </span>
            )}

            <button
              type="button"
              onClick={voice.leave}
              title="Leave voice chat"
              aria-label="Leave voice chat"
              className="btn btn-ghost !min-h-9 !px-1.5 !text-xs"
            >
              <span aria-hidden>✕</span>
            </button>
          </>
        )}
      </div>
    );
  }

  const onCall = voice.peers.filter((p) => p.connected).length + 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left">
      {audio}

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream-100">🎙️ Voice chat</p>
          <p className="mt-0.5 text-xs text-cream-400">
            {live
              ? `${onCall} on the call · tap a name to mute them`
              : "Talk to the table while you play."}
          </p>
        </div>

        {live ? (
          <button type="button" onClick={voice.leave} className="btn btn-secondary !min-h-9 shrink-0 !px-3 !text-xs">
            Leave
          </button>
        ) : (
          <button
            type="button"
            onClick={voice.join}
            disabled={starting}
            className="btn btn-primary !min-h-9 shrink-0 !px-3 !text-xs"
          >
            {starting ? "Joining…" : "Join"}
          </button>
        )}
      </div>

      {live && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip
            name={selfName}
            label={`${selfName} (you)`}
            avatarUrl={selfAvatar}
            speaking={voice.speaking}
            muted={voice.muted}
            title={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
            onClick={voice.toggleMute}
          />
          {voice.peers.map((p) => (
            <Chip
              key={p.id}
              name={p.name}
              avatarUrl={avatars?.[p.id]}
              speaking={p.speaking && !p.silenced}
              muted={p.muted}
              silenced={p.silenced}
              pending={!p.connected}
              title={p.silenced ? `Unmute ${p.name} for yourself` : `Mute ${p.name} for yourself`}
              onClick={() => voice.toggleSilence(p.id)}
            />
          ))}
          {voice.peers.length === 0 && (
            <p className="text-xs text-cream-400/70">Waiting for someone else to join the call…</p>
          )}
        </div>
      )}

      {voice.error && (
        <p className="mt-2.5 rounded-lg bg-chili-500/15 px-3 py-2 text-xs text-chili-400" role="alert">
          {voice.error}
        </p>
      )}

      {!voice.supported && !voice.error && (
        <p className="mt-2.5 text-xs text-cream-400/70">
          This browser can&apos;t do voice chat. Try Chrome, Safari or Firefox.
        </p>
      )}
    </div>
  );
}
