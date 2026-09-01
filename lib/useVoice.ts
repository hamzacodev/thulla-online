"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * Voice chat for online rooms — talk to the table while you play.
 *
 * The audio goes peer-to-peer over WebRTC, which is the same bargain the
 * rest of the app makes: there is no game server, so there is no media
 * server either. Supabase Realtime carries only the signalling (offers,
 * answers, ICE candidates) and a presence roster of who is on the call.
 * Nobody's voice passes through anything we host or pay for.
 *
 * With 2–8 players a full mesh is the right shape: each browser holds at
 * most seven connections of one mono audio track each, and nobody's voice
 * waits on a relay to be forwarded.
 *
 * Joining is always a deliberate tap. The microphone is never opened on
 * page load, both because browsers require a gesture for it and because
 * a card game shouldn't listen to your room uninvited.
 */

/** RMS of one frame, above which we call it speech rather than a room. */
const SPEAKING_LEVEL = 0.045;
/** Held so the indicator doesn't strobe in the gaps between syllables. */
const SPEAKING_HOLD_MS = 320;
const LEVEL_INTERVAL_MS = 140;
/** Catches links that dropped without a presence event to announce it. */
const SWEEP_MS = 4000;

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * STUN alone connects two browsers on ordinary home and mobile networks.
 * Behind a symmetric NAT or a locked-down corporate firewall nothing but a
 * relay will do, so an optional TURN server is read from the environment —
 * set NEXT_PUBLIC_TURN_URL (plus username/credential) to add one.
 */
function iceServers(): RTCIceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return STUN;
  return [
    ...STUN,
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

export type VoiceStatus = "off" | "starting" | "live" | "error";

export interface VoicePeer {
  id: string;
  name: string;
  /** They muted their own microphone — everyone can see this. */
  muted: boolean;
  /** We muted them, here, on this device. Nobody else can tell. */
  silenced: boolean;
  /** Media is actually flowing, not just signalled. */
  connected: boolean;
  speaking: boolean;
  stream: MediaStream | null;
}

export interface VoiceControls {
  status: VoiceStatus;
  error: string;
  /** Our own microphone. */
  muted: boolean;
  speaking: boolean;
  peers: VoicePeer[];
  /** False when the browser has no WebRTC or no microphone API at all. */
  supported: boolean;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleSilence: (peerId: string) => void;
}

interface PresenceMeta {
  id: string;
  name: string;
  muted: boolean;
}

type Signal =
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

interface Link {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  name: string;
  muted: boolean;
  connected: boolean;
  speakingUntil: number;
  /** ICE that arrived before the remote description did. */
  queued: RTCIceCandidateInit[];
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
}

function micProblem(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone blocked. Allow mic access for this site, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone found on this device.";
  if (name === "NotReadableError") return "Your microphone is busy in another app.";
  return "Couldn't start the microphone.";
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

export function useVoice({
  code,
  userId,
  members,
  available,
}: {
  code: string | null;
  userId: string | null;
  /** Everyone holding a seat. Only these people get a connection. */
  members: Array<{ id: string; name: string }>;
  /** The player's own "voice chat" setting. Off means don't offer it at all. */
  available: boolean;
}): VoiceControls {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [supported, setSupported] = useState(true);

  const linksRef = useRef(new Map<string, Link>());
  const silencedRef = useRef(new Set<string>());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localSpeakingUntil = useRef(0);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mutedRef = useRef(false);
  const liveRef = useRef(false);
  const startingRef = useRef(false);
  const membersRef = useRef(members);
  const idRef = useRef(userId);
  const timersRef = useRef<{ level?: number; sweep?: number }>({});
  const teardownRef = useRef<() => void>(() => {});
  const lastSignature = useRef("");
  /** Bumped by every teardown, so a join still waiting on the microphone
      prompt can tell that it has been abandoned. */
  const generation = useRef(0);

  useEffect(() => {
    membersRef.current = members;
    idRef.current = userId;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection: the server can't know what the browser supports
    setSupported(
      typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  /* ---------- shared helpers (they only ever touch refs) ---------- */

  const nameFor = (id: string, fallback: string) =>
    membersRef.current.find((m) => m.id === id)?.name ?? fallback;

  /**
   * Rebuilds the public peer list. Called on every level tick, so it bails
   * out unless something a viewer could actually see has changed.
   */
  const publish = () => {
    const now = Date.now();
    const list: VoicePeer[] = [];
    linksRef.current.forEach((link, id) => {
      list.push({
        id,
        name: link.name,
        muted: link.muted,
        silenced: silencedRef.current.has(id),
        connected: link.connected,
        speaking: !link.muted && link.speakingUntil > now,
        stream: link.stream,
      });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));

    const signature = list
      .map(
        (p) =>
          `${p.id}:${p.name}:${+p.muted}${+p.silenced}${+p.connected}${+p.speaking}${p.stream ? 1 : 0}`
      )
      .join("|");
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    setPeers(list);
  };

  const send = (signal: Signal) => {
    void channelRef.current?.send({ type: "broadcast", event: "signal", payload: signal });
  };

  /**
   * Taps a stream for the speaking indicator. The analyser is deliberately
   * not wired to the context's destination — the <audio> element does the
   * playing, this branch only measures. (Chrome only lets a remote stream
   * reach Web Audio at all once something is sinking it, which that element
   * is doing.)
   */
  const attachAnalyser = (link: Link, stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      link.source?.disconnect();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      link.source = source;
      link.analyser = analyser;
    } catch {
      link.analyser = null;
    }
  };

  const closeLink = (peerId: string) => {
    const link = linksRef.current.get(peerId);
    if (!link) return;
    linksRef.current.delete(peerId);
    try {
      link.source?.disconnect();
      link.analyser?.disconnect();
    } catch {
      /* already gone */
    }
    link.pc.onicecandidate = null;
    link.pc.ontrack = null;
    link.pc.onconnectionstatechange = null;
    try {
      link.pc.close();
    } catch {
      /* already closed */
    }
  };

  const ensureLink = (peerId: string, meta?: PresenceMeta): Link => {
    const existing = linksRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const link: Link = {
      pc,
      stream: null,
      name: nameFor(peerId, meta?.name ?? "Player"),
      muted: meta?.muted ?? false,
      connected: false,
      speakingUntil: 0,
      queued: [],
      analyser: null,
      source: null,
    };
    linksRef.current.set(peerId, link);

    const local = streamRef.current;
    if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));

    pc.onicecandidate = (ev) => {
      const me = idRef.current;
      if (!ev.candidate || !me) return;
      send({ kind: "ice", from: me, to: peerId, candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      link.stream = stream;
      attachAnalyser(link, stream);
      publish();
    };

    pc.onconnectionstatechange = () => {
      link.connected = pc.connectionState === "connected";
      publish();
    };

    return link;
  };

  const drainIce = async (link: Link) => {
    const queued = link.queued.splice(0);
    for (const candidate of queued) {
      try {
        await link.pc.addIceCandidate(candidate);
      } catch {
        /* a candidate we can't use is not worth failing the call over */
      }
    }
  };

  const offerTo = async (peerId: string) => {
    const link = linksRef.current.get(peerId);
    const me = idRef.current;
    if (!link || !me) return;
    try {
      const offer = await link.pc.createOffer();
      await link.pc.setLocalDescription(offer);
      send({ kind: "offer", from: me, to: peerId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch {
      /* the sweep comes back around */
    }
  };

  const onSignal = async (signal: Signal) => {
    const me = idRef.current;
    if (!me || signal.to !== me || signal.from === me) return;
    // Only people holding a seat at this table get a connection, so knowing
    // the room code is not enough to listen in.
    if (!membersRef.current.some((m) => m.id === signal.from)) return;

    if (signal.kind === "ice") {
      const link = linksRef.current.get(signal.from);
      if (!link) return;
      if (link.pc.remoteDescription) {
        try {
          await link.pc.addIceCandidate(signal.candidate);
        } catch {
          /* ignore */
        }
      } else {
        link.queued.push(signal.candidate);
      }
      return;
    }

    if (signal.kind === "offer") {
      // An established link is never renegotiated — muting flips a track, it
      // doesn't change the session — so a second offer means the other side
      // rebuilt theirs. Match it with a fresh connection instead of trying to
      // reconcile two half-dead ones. This also settles the case where both
      // sides somehow offered: whoever receives one yields.
      const current = linksRef.current.get(signal.from);
      if (current && (current.pc.remoteDescription || current.pc.signalingState === "have-local-offer")) {
        closeLink(signal.from);
      }
      const link = ensureLink(signal.from);
      try {
        await link.pc.setRemoteDescription(signal.sdp);
        await drainIce(link);
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        send({ kind: "answer", from: me, to: signal.from, sdp: { type: answer.type, sdp: answer.sdp } });
      } catch {
        closeLink(signal.from);
      }
      publish();
      return;
    }

    const link = linksRef.current.get(signal.from);
    if (!link) return;
    try {
      await link.pc.setRemoteDescription(signal.sdp);
      await drainIce(link);
    } catch {
      /* a stale answer; the sweep rebuilds the link if it really is dead */
    }
  };

  /**
   * Brings the mesh in line with the presence roster: connect to anyone new,
   * drop anyone gone, rebuild anything that failed. Idempotent, so it is
   * safe to run on every presence event and on a timer.
   */
  const reconcile = () => {
    const channel = channelRef.current;
    const me = idRef.current;
    if (!channel || !me || !liveRef.current) return;

    const present = new Map<string, PresenceMeta>();
    Object.values(channel.presenceState<PresenceMeta>()).forEach((metas) => {
      const meta = metas[metas.length - 1];
      if (!meta?.id || meta.id === me) return;
      if (!membersRef.current.some((m) => m.id === meta.id)) return;
      present.set(meta.id, meta);
    });

    linksRef.current.forEach((_link, id) => {
      if (!present.has(id)) closeLink(id);
    });

    present.forEach((meta, id) => {
      const existing = linksRef.current.get(id);
      if (existing) {
        existing.name = nameFor(id, meta.name);
        existing.muted = meta.muted;
        const dead =
          existing.pc.connectionState === "failed" || existing.pc.connectionState === "closed";
        if (!dead) return;
        closeLink(id);
      }
      ensureLink(id, meta);
      // Exactly one side offers, and it is always the same side: comparing
      // the two user ids gives both browsers the same answer with no extra
      // round trip and no glare to resolve.
      if (me < id) void offerTo(id);
    });

    publish();
  };

  const measure = () => {
    const now = Date.now();
    const buf = (bufRef.current ??= new Uint8Array(512));

    const local = localAnalyserRef.current;
    if (local && !mutedRef.current && rms(local, buf) > SPEAKING_LEVEL) {
      localSpeakingUntil.current = now + SPEAKING_HOLD_MS;
    }
    setSpeaking(!mutedRef.current && localSpeakingUntil.current > now);

    linksRef.current.forEach((link) => {
      if (link.analyser && rms(link.analyser, buf) > SPEAKING_LEVEL) {
        link.speakingUntil = now + SPEAKING_HOLD_MS;
      }
    });
    publish();
  };

  const teardown = (next: VoiceStatus = "off", message = "") => {
    liveRef.current = false;
    startingRef.current = false;
    generation.current++;
    if (timersRef.current.level) window.clearInterval(timersRef.current.level);
    if (timersRef.current.sweep) window.clearInterval(timersRef.current.sweep);
    timersRef.current = {};

    Array.from(linksRef.current.keys()).forEach(closeLink);

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      void channel.untrack();
      void supabase.removeChannel(channel);
    }

    try {
      localSourceRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    localSourceRef.current = null;
    localAnalyserRef.current = null;
    localSpeakingUntil.current = 0;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // The AudioContext is kept and suspended rather than closed: browsers
    // cap how many a page may open, and a suspended one costs nothing.
    void audioCtxRef.current?.suspend();

    lastSignature.current = "";
    setPeers([]);
    setSpeaking(false);
    setMuted(false);
    mutedRef.current = false;
    setError(message);
    setStatus(next);
  };

  const startMeters = (stream: MediaStream) => {
    try {
      const Impl =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Impl) return;
      const ctx = audioCtxRef.current ?? new Impl();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      localSourceRef.current = source;
      localAnalyserRef.current = analyser;
    } catch {
      // No meters, no problem — the call itself doesn't depend on them.
      localAnalyserRef.current = null;
    }
  };

  const join = async () => {
    if (!code || !userId || liveRef.current || startingRef.current) return;
    const gen = generation.current;
    startingRef.current = true;
    setError("");
    setStatus("starting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (err) {
      if (gen !== generation.current) return;
      startingRef.current = false;
      setStatus("error");
      setError(micProblem(err));
      return;
    }

    // The permission prompt can sit there for a while. If the player left
    // the room in the meantime, hand the microphone straight back.
    if (gen !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    mutedRef.current = false;
    setMuted(false);
    stream.getAudioTracks().forEach((track) => (track.enabled = true));
    // "Join" is a real tap, which is exactly what unlocks audio on iOS.
    startMeters(stream);

    const channel = supabase.channel(`voice-${code}`, {
      config: { broadcast: { self: false }, presence: { key: userId, enabled: true } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, (message) => {
      void onSignal(message.payload as Signal);
    });
    channel.on("presence", { event: "sync" }, () => reconcile());

    channel.subscribe((state) => {
      if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        liveRef.current = true;
        startingRef.current = false;
        setStatus("live");
        void channel.track({
          id: userId,
          name: nameFor(userId, "Player"),
          muted: mutedRef.current,
        } satisfies PresenceMeta);
        reconcile();
      } else if (
        state === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        state === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        teardown("error", "Lost the voice connection. Tap to try again.");
      }
    });

    timersRef.current.level = window.setInterval(measure, LEVEL_INTERVAL_MS);
    timersRef.current.sweep = window.setInterval(reconcile, SWEEP_MS);
  };

  const toggleMute = () => {
    if (!liveRef.current) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    if (next) {
      localSpeakingUntil.current = 0;
      setSpeaking(false);
    }
    const me = idRef.current;
    if (channelRef.current && me) {
      void channelRef.current.track({
        id: me,
        name: nameFor(me, "Player"),
        muted: next,
      } satisfies PresenceMeta);
    }
  };

  const toggleSilence = (peerId: string) => {
    if (silencedRef.current.has(peerId)) silencedRef.current.delete(peerId);
    else silencedRef.current.add(peerId);
    publish();
  };

  // Everything above closes over refs only, so the latest version is always
  // safe to call from a cleanup that ran with an older render's closure.
  const joinRef = useRef(join);
  useEffect(() => {
    joinRef.current = join;
    teardownRef.current = () => teardown();
  });

  // Hang up when the tab goes away, the player leaves the room, or they
  // turn voice chat off in settings.
  useEffect(() => () => teardownRef.current(), []);

  useEffect(() => {
    if (!available && liveRef.current) teardownRef.current();
  }, [available]);

  // A different room, or a different player, means a different call.
  useEffect(() => {
    if (liveRef.current) teardownRef.current();
  }, [code, userId]);

  const stableJoin = useCallback(() => void joinRef.current(), []);
  const stableLeave = useCallback(() => teardownRef.current(), []);

  return {
    status,
    error,
    muted,
    speaking,
    peers,
    supported,
    join: stableJoin,
    leave: stableLeave,
    toggleMute,
    toggleSilence,
  };
}
