"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import type { PeerState, VoiceControls, VoicePeer } from "@/lib/useVoice";

/**
 * One peer's audio.
 *
 * Joining the call is a deliberate tap, so autoplay is normally allowed —
 * but "normally" isn't good enough. A tab restored in the background, a
 * stream that arrives minutes after the tap, or iOS deciding the gesture
 * has gone stale all get the play() refused, and a refused play() is
 * completely silent: no error on screen, connection green, nobody audible.
 *
 * So we keep asking. On the next tap anywhere, and whenever the tab comes
 * back to the front, until it actually plays.
 */
function PeerAudio({ peer }: { peer: VoicePeer }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== peer.stream) el.srcObject = peer.stream;

    let done = false;
    const tryPlay = () => {
      if (done || !el.srcObject) return;
      void el
        .play()
        .then(() => {
          done = true;
        })
        .catch(() => {
          /* still blocked; the next gesture gets another go */
        });
    };

    tryPlay();
    document.addEventListener("visibilitychange", tryPlay);
    document.addEventListener("pointerdown", tryPlay);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", tryPlay);
      document.removeEventListener("pointerdown", tryPlay);
    };
  }, [peer.stream]);

  return <audio ref={ref} autoPlay playsInline muted={peer.silenced} />;
}

/** Plain words for what the connection is doing, never just a colour. */
const STATE_LABEL: Record<PeerState, string> = {
  connecting: "connecting…",
  live: "",
  retrying: "reconnecting…",
  relaying: "connecting via relay…",
  failed: "couldn't connect",
};

function ringFor(peer: VoicePeer): string {
  if (peer.state === "failed") return "ring-chili-400";
  if (peer.state !== "live") return "ring-brass-400";
  if (peer.muted) return "ring-chili-400";
  if (peer.speaking) return "ring-mint-300";
  return "ring-white/15";
}

function PeerChip({
  peer,
  avatarUrl,
  onClick,
}: {
  peer: VoicePeer;
  avatarUrl?: string | null;
  onClick: () => void;
}) {
  const note = STATE_LABEL[peer.state];
  const title = peer.silenced ? `Unmute ${peer.name} for yourself` : `Mute ${peer.name} for yourself`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors ${
        peer.speaking && peer.state === "live"
          ? "border-mint-300/70 bg-mint-400/20 text-cream-50"
          : peer.state === "failed"
          ? "border-chili-400/40 bg-chili-500/10 text-cream-200"
          : "border-white/10 bg-white/[0.05] text-cream-200"
      }`}
    >
      <Avatar src={avatarUrl} name={peer.name} size={20} ringClass={ringFor(peer)} />
      <span className="max-w-[7rem] truncate">{peer.name}</span>
      {note && <span className="text-[0.65rem] text-cream-400">{note}</span>}
      {peer.muted && peer.state === "live" && <span aria-hidden>🔇</span>}
      {peer.silenced && <span aria-hidden>🚫</span>}
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
  /** Everyone on the call who isn't us — visible before we join. */
  const others = voice.onCall.filter((p) => p.name !== selfName);

  // Kept mounted in both variants: the audio has to keep playing while the
  // controls are compact.
  const audio = voice.peers.map((p) => <PeerAudio key={p.id} peer={p} />);

  if (variant === "bar") {
    const talkers = voice.peers.filter((p) => p.speaking && !p.silenced).slice(0, 3);
    const struggling = live && voice.peers.some((p) => p.state === "failed");

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
            className="btn btn-secondary relative !min-h-9 !gap-1 !px-2.5 !text-xs"
          >
            <span aria-hidden>{starting ? "⏳" : "🎙️"}</span>
            {/* An unlabelled microphone reads as "you are being recorded"
                just as easily as "tap to talk". Say which. */}
            <span>{starting ? "Joining…" : "Enable Mic"}</span>
            {others.length > 0 && (
              <span className="tabular absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-mint-400 px-1 text-[0.6rem] font-bold text-ink-950">
                {others.length}
              </span>
            )}
          </button>
        ) : (
          <>
            {voice.pushToTalk ? (
              <button
                type="button"
                onPointerDown={() => voice.setTalking(true)}
                onPointerUp={() => voice.setTalking(false)}
                onPointerLeave={() => voice.setTalking(false)}
                onPointerCancel={() => voice.setTalking(false)}
                title="Hold to talk"
                aria-label="Hold to talk"
                className={`btn !min-h-9 !gap-1 !px-2.5 !text-xs ${
                  voice.talking ? "btn-primary" : "btn-secondary"
                }`}
              >
                <span aria-hidden>{voice.talking ? "🎙️" : "🤫"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={voice.toggleMute}
                aria-pressed={voice.muted}
                title={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
                aria-label={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
                className={`btn btn-secondary !min-h-9 !gap-1 !px-2.5 !text-xs ${
                  voice.muted
                    ? "!border-chili-400/50 !text-chili-400"
                    : voice.speaking
                    ? "!border-mint-300/70 !text-mint-300"
                    : ""
                }`}
              >
                <span aria-hidden>{voice.muted ? "🔇" : "🎙️"}</span>
              </button>
            )}

            {talkers.length > 0 && (
              <span className="flex items-center gap-0.5" aria-live="polite">
                {talkers.map((p) => (
                  <span key={p.id} title={`${p.name} is talking`}>
                    <Avatar src={avatars?.[p.userId]} name={p.name} size={24} ringClass="ring-mint-300/80" />
                  </span>
                ))}
              </span>
            )}

            {struggling && (
              <span className="text-[0.65rem] text-chili-400" title="A connection failed">
                ⚠️
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

  const failed = voice.peers.filter((p) => p.state === "failed");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left">
      {audio}

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream-100">🎙️ Voice chat</p>
          <p className="mt-0.5 text-xs text-cream-400">
            {live
              ? "Tap a name to mute them, just for you."
              : others.length > 0
              ? `${others.map((p) => p.name).join(", ")} ${others.length === 1 ? "is" : "are"} on the call.`
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
            {starting ? "Joining…" : others.length > 0 ? `Join (${others.length})` : "Join"}
          </button>
        )}
      </div>

      {live && (
        <>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={voice.toggleMute}
              title={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
              aria-label={voice.muted ? "Unmute your microphone" : "Mute your microphone"}
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors ${
                voice.speaking
                  ? "border-mint-300/70 bg-mint-400/20 text-cream-50"
                  : "border-white/10 bg-white/[0.05] text-cream-200"
              }`}
            >
              <Avatar
                src={selfAvatar}
                name={selfName}
                size={20}
                ringClass={
                  voice.muted ? "ring-chili-400" : voice.speaking ? "ring-mint-300" : "ring-white/15"
                }
              />
              <span className="max-w-[7rem] truncate">{selfName} (you)</span>
              {voice.muted && <span aria-hidden>🔇</span>}
            </button>

            {voice.peers.map((p) => (
              <PeerChip
                key={p.id}
                peer={p}
                avatarUrl={avatars?.[p.userId]}
                onClick={() => voice.toggleSilence(p.id)}
              />
            ))}

            {voice.peers.length === 0 && (
              <p className="text-xs text-cream-400/70">Waiting for someone else to join the call…</p>
            )}
          </div>

          {/* Push-to-talk. The only reliable cure when two devices are in the
              same room and echo cancellation can't win. */}
          <div className="mt-3 flex items-center gap-2">
            {voice.pushToTalk ? (
              <button
                type="button"
                onPointerDown={() => voice.setTalking(true)}
                onPointerUp={() => voice.setTalking(false)}
                onPointerLeave={() => voice.setTalking(false)}
                onPointerCancel={() => voice.setTalking(false)}
                className={`btn flex-1 !min-h-11 !text-sm ${voice.talking ? "btn-primary" : "btn-secondary"}`}
              >
                {voice.talking ? "🎙️ Talking…" : "🤫 Hold to talk"}
              </button>
            ) : (
              <button
                type="button"
                onClick={voice.toggleMute}
                className="btn btn-secondary flex-1 !min-h-11 !text-sm"
              >
                {voice.muted ? "🔇 Unmute" : "🎙️ Mute"}
              </button>
            )}
            <button
              type="button"
              onClick={() => voice.setPushToTalk(!voice.pushToTalk)}
              aria-pressed={voice.pushToTalk}
              className={`btn !min-h-11 !px-3 !text-xs ${
                voice.pushToTalk ? "btn-primary" : "btn-secondary"
              }`}
            >
              Push to talk
            </button>
          </div>

          <p className="mt-2 text-[0.7rem] text-cream-400/70">
            Hearing an echo? You&apos;re probably in the same room as another player — use
            headphones, or turn on push-to-talk.
          </p>

          {/* Failing to reach one person is a bad pair. Failing to reach
              *everyone* is not — that's the relay being unavailable, and
              telling someone their network is at fault when it isn't sends
              them off changing wifi for an hour to fix nothing. */}
          {failed.length > 0 && (
            <p className="mt-2 rounded-lg bg-chili-500/15 px-3 py-2 text-xs text-chili-400" role="alert">
              {!voice.relayAvailable ? (
                <>
                  Couldn&apos;t reach {failed.map((p) => p.name).join(", ")}. The relay server
                  never answered, so there&apos;s no route for networks that block direct
                  links — that&apos;s a setup problem on our side, not yours.
                </>
              ) : failed.length >= 2 && failed.length === voice.peers.length ? (
                <>
                  Couldn&apos;t reach anyone on the call, even through the relay. Worth
                  trying a different network.
                </>
              ) : (
                <>
                  Couldn&apos;t reach {failed.map((p) => p.name).join(", ")}. Your network is
                  blocking the connection — mobile data or a different wifi usually fixes it.
                </>
              )}
            </p>
          )}
        </>
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
