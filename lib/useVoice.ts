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
 *
 * With 2–8 players a full mesh is the right shape: each browser holds at
 * most seven connections of one mono audio track each, and nobody's voice
 * waits on a relay to be forwarded.
 *
 * Two things are worth knowing about the design:
 *
 * 1. The channel is subscribed as soon as the room opens, but the
 *    microphone is not. That way everyone can *see* who is on the call and
 *    join them, without a card game opening a mic uninvited.
 * 2. Connecting is not assumed to work. Roughly a fifth of real-world pairs
 *    can't reach each other directly — mobile carriers and office networks
 *    put both ends behind NAT that STUN can't punch through — so a failed
 *    connection restarts ICE, then falls back to forcing a TURN relay,
 *    and says so on screen rather than sitting there silently.
 */

/** RMS of one frame, above which we call it speech rather than a room. */
const SPEAKING_LEVEL = 0.045;
/** Held so the indicator doesn't strobe in the gaps between syllables. */
const SPEAKING_HOLD_MS = 320;
const LEVEL_INTERVAL_MS = 140;
/** Catches links that dropped without a presence event to announce it. */
const SWEEP_MS = 4000;
/** Direct attempts before we stop trying and force everything through TURN. */
const DIRECT_ATTEMPTS = 2;

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * A relay for the pairs that can't reach each other directly.
 *
 * The default is the Open Relay project's free public TURN service, which
 * is shared, unauthenticated and offers no guarantees — it is here so voice
 * chat works out of the box rather than failing for anyone behind a
 * symmetric NAT. Set NEXT_PUBLIC_TURN_URL (with username and credential) to
 * point at your own, which is what you want if people actually use this:
 * Cloudflare and metered.ca both have free tiers big enough for a card game.
 */
const FALLBACK_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function turnServers(): RTCIceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return FALLBACK_TURN;
  return [
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

export type VoiceStatus = "off" | "starting" | "live" | "error";
/** How one peer connection is doing. Surfaced, not swallowed. */
export type PeerState = "connecting" | "live" | "retrying" | "relaying" | "failed";

export interface VoicePeer {
  id: string;
  name: string;
  state: PeerState;
  /** They muted their own microphone — everyone can see this. */
  muted: boolean;
  /** We muted them, here, on this device. Nobody else can tell. */
  silenced: boolean;
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
  /**
   * Everyone on the call, whether or not we've connected to them — and
   * visible without joining, so you can see there's a conversation to join.
   */
  onCall: Array<{ id: string; name: string }>;
  /** False when the browser has no WebRTC or no microphone API at all. */
  supported: boolean;
  /** Hold-to-talk. The cure for two devices howling at each other. */
  pushToTalk: boolean;
  talking: boolean;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleSilence: (peerId: string) => void;
  setPushToTalk: (on: boolean) => void;
  setTalking: (on: boolean) => void;
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
  state: PeerState;
  /** Direct attempts spent. Past the limit we force a relay. */
  attempts: number;
  /** True once this link is TURN-only. */
  relayed: boolean;
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
  const [onCall, setOnCall] = useState<Array<{ id: string; name: string }>>([]);
  const [supported, setSupported] = useState(true);
  const [pushToTalk, setPushToTalkState] = useState(false);
  const [talking, setTalkingState] = useState(false);

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
  const pushToTalkRef = useRef(false);
  const talkingRef = useRef(false);
  const liveRef = useRef(false);
  const startingRef = useRef(false);
  const membersRef = useRef(members);
  const idRef = useRef(userId);
  const timersRef = useRef<{ level?: number; sweep?: number }>({});
  const hangUpRef = useRef<() => void>(() => {});
  const lastSignature = useRef("");
  const lastRoster = useRef("");
  /** Bumped by every hang-up, so a join still waiting on the microphone
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

  /* ---------- helpers: these only ever touch refs ---------- */

  const nameFor = (id: string, fallback: string) =>
    membersRef.current.find((m) => m.id === id)?.name ?? fallback;

  /** Whether the mic should currently be open, given mute and push-to-talk. */
  const shouldTransmit = () =>
    !mutedRef.current && (!pushToTalkRef.current || talkingRef.current);

  const applyMicState = () => {
    const on = shouldTransmit();
    streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = on));
    if (!on) localSpeakingUntil.current = 0;
  };

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
        state: link.state,
        muted: link.muted,
        silenced: silencedRef.current.has(id),
        speaking: link.state === "live" && !link.muted && link.speakingUntil > now,
        stream: link.stream,
      });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));

    const signature = list
      .map(
        (p) =>
          `${p.id}:${p.name}:${p.state}:${+p.muted}${+p.silenced}${+p.speaking}${p.stream ? 1 : 0}`
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

  const offerTo = async (peerId: string, iceRestart = false) => {
    const link = linksRef.current.get(peerId);
    const me = idRef.current;
    if (!link || !me) return;
    try {
      const offer = await link.pc.createOffer({ iceRestart });
      await link.pc.setLocalDescription(offer);
      send({ kind: "offer", from: me, to: peerId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch {
      /* the sweep comes back around */
    }
  };

  /**
   * A dead connection gets three chances, in increasing order of
   * desperation: restart ICE on the existing connection, rebuild it, then
   * rebuild it forced through a TURN relay. Only the designated caller
   * drives this; the other side follows whatever offer arrives.
   */
  const recover = (peerId: string) => {
    const link = linksRef.current.get(peerId);
    const me = idRef.current;
    if (!link || !me) return;

    const isCaller = me < peerId;
    link.attempts++;

    if (!isCaller) {
      // Nothing to drive from this side; show honest state and wait for
      // their offer.
      link.state = link.attempts > DIRECT_ATTEMPTS + 1 ? "failed" : "retrying";
      publish();
      return;
    }

    if (link.attempts <= DIRECT_ATTEMPTS) {
      link.state = "retrying";
      publish();
      void offerTo(peerId, true);
      return;
    }

    if (!link.relayed) {
      // Direct never worked. Everything through the relay from here.
      const attempts = link.attempts;
      const name = link.name;
      const muted = link.muted;
      closeLink(peerId);
      const fresh = ensureLink(peerId, { id: peerId, name, muted }, true);
      fresh.attempts = attempts;
      fresh.state = "relaying";
      publish();
      void offerTo(peerId);
      return;
    }

    link.state = "failed";
    publish();
  };

  const ensureLink = (peerId: string, meta?: PresenceMeta, relayOnly = false): Link => {
    const existing = linksRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: relayOnly ? turnServers() : [...STUN, ...turnServers()],
      iceTransportPolicy: relayOnly ? "relay" : "all",
    });
    const link: Link = {
      pc,
      stream: null,
      name: nameFor(peerId, meta?.name ?? "Player"),
      muted: meta?.muted ?? false,
      state: relayOnly ? "relaying" : "connecting",
      attempts: 0,
      relayed: relayOnly,
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
      switch (pc.connectionState) {
        case "connected":
          link.state = "live";
          link.attempts = 0;
          break;
        case "disconnected":
          // Often transient — a phone changing cell. Give it a beat.
          if (link.state === "live") link.state = "retrying";
          break;
        case "failed":
          recover(peerId);
          return;
        default:
          break;
      }
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

  const onSignal = async (signal: Signal) => {
    const me = idRef.current;
    if (!me || !liveRef.current || signal.to !== me || signal.from === me) return;
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
      // An offer on a settled link means the other side rebuilt theirs (or
      // restarted ICE, which arrives the same way). Renegotiating in place
      // is right for an ICE restart; a genuinely new session is caught by
      // the state check below. This also settles the case where both sides
      // somehow offered: whoever receives one yields.
      const current = linksRef.current.get(signal.from);
      const wedged =
        current?.pc.signalingState === "have-local-offer" ||
        current?.pc.connectionState === "failed";
      if (current && wedged) closeLink(signal.from);
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
   * Reads the presence roster and, if we're on the call ourselves, brings
   * the mesh in line with it. Idempotent, so it is safe to run on every
   * presence event and on a timer.
   */
  const reconcile = () => {
    const channel = channelRef.current;
    const me = idRef.current;
    if (!channel || !me) return;

    const present = new Map<string, PresenceMeta>();
    Object.values(channel.presenceState<PresenceMeta>()).forEach((metas) => {
      const meta = metas[metas.length - 1];
      if (!meta?.id) return;
      if (!membersRef.current.some((m) => m.id === meta.id)) return;
      present.set(meta.id, meta);
    });

    // The roster is public: you can see there's a conversation to join
    // without opening your own microphone first.
    const roster = Array.from(present.values())
      .map((meta) => ({ id: meta.id, name: nameFor(meta.id, meta.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const rosterKey = roster.map((r) => `${r.id}:${r.name}`).join("|");
    if (rosterKey !== lastRoster.current) {
      lastRoster.current = rosterKey;
      setOnCall(roster);
    }

    if (!liveRef.current) return;

    linksRef.current.forEach((_link, id) => {
      if (!present.has(id)) closeLink(id);
    });

    present.forEach((meta, id) => {
      if (id === me) return;
      const existing = linksRef.current.get(id);
      if (existing) {
        existing.name = nameFor(id, meta.name);
        existing.muted = meta.muted;
        if (existing.pc.connectionState === "closed") closeLink(id);
        else return;
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
    if (local && shouldTransmit() && rms(local, buf) > SPEAKING_LEVEL) {
      localSpeakingUntil.current = now + SPEAKING_HOLD_MS;
    }
    setSpeaking(shouldTransmit() && localSpeakingUntil.current > now);

    linksRef.current.forEach((link) => {
      if (link.analyser && rms(link.analyser, buf) > SPEAKING_LEVEL) {
        link.speakingUntil = now + SPEAKING_HOLD_MS;
      }
    });
    publish();
  };

  /** Leaves the call but stays subscribed, so the roster keeps updating. */
  const hangUp = (next: VoiceStatus = "off", message = "") => {
    liveRef.current = false;
    startingRef.current = false;
    generation.current++;

    if (timersRef.current.level) window.clearInterval(timersRef.current.level);
    if (timersRef.current.sweep) window.clearInterval(timersRef.current.sweep);
    timersRef.current = {};

    Array.from(linksRef.current.keys()).forEach(closeLink);
    void channelRef.current?.untrack();

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
    mutedRef.current = false;
    talkingRef.current = false;
    setPeers([]);
    setSpeaking(false);
    setMuted(false);
    setTalkingState(false);
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
    const channel = channelRef.current;
    if (!code || !userId || !channel || liveRef.current || startingRef.current) return;
    const gen = generation.current;
    startingRef.current = true;
    setError("");
    setStatus("starting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
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
    applyMicState();
    // "Join" is a real tap, which is exactly what unlocks audio on iOS.
    startMeters(stream);

    liveRef.current = true;
    startingRef.current = false;
    setStatus("live");

    void channel.track({
      id: userId,
      name: nameFor(userId, "Player"),
      muted: mutedRef.current,
    } satisfies PresenceMeta);

    reconcile();
    timersRef.current.level = window.setInterval(measure, LEVEL_INTERVAL_MS);
    timersRef.current.sweep = window.setInterval(reconcile, SWEEP_MS);
  };

  const trackPresence = () => {
    const me = idRef.current;
    if (!channelRef.current || !me || !liveRef.current) return;
    void channelRef.current.track({
      id: me,
      name: nameFor(me, "Player"),
      muted: mutedRef.current,
    } satisfies PresenceMeta);
  };

  const toggleMute = () => {
    if (!liveRef.current) return;
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    applyMicState();
    if (mutedRef.current) setSpeaking(false);
    trackPresence();
  };

  const setPushToTalk = (on: boolean) => {
    pushToTalkRef.current = on;
    setPushToTalkState(on);
    talkingRef.current = false;
    setTalkingState(false);
    applyMicState();
    if (!on && liveRef.current) {
      // Coming out of push-to-talk shouldn't leave you silently muted.
      mutedRef.current = false;
      setMuted(false);
      applyMicState();
    }
    trackPresence();
  };

  const setTalking = (on: boolean) => {
    if (!pushToTalkRef.current) return;
    talkingRef.current = on;
    setTalkingState(on);
    applyMicState();
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
    hangUpRef.current = () => hangUp();
  });

  /**
   * The channel is subscribed for as long as the room is open, so the
   * roster of who's talking is visible before you join — and so leaving and
   * rejoining the call doesn't churn a websocket.
   */
  useEffect(() => {
    if (!available || !code || !userId) return;

    const channel = supabase.channel(`voice-${code}`, {
      config: { broadcast: { self: false }, presence: { key: userId, enabled: true } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, (message) => {
      void onSignal(message.payload as Signal);
    });
    channel.on("presence", { event: "sync" }, () => reconcile());
    channel.subscribe((state) => {
      if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) reconcile();
      else if (
        state === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        state === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        if (liveRef.current) hangUpRef.current();
      }
    });

    return () => {
      hangUpRef.current();
      channelRef.current = null;
      lastRoster.current = "";
      setOnCall([]);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers read refs; re-subscribing on every render would churn the socket
  }, [available, code, userId]);

  const stableJoin = useCallback(() => void joinRef.current(), []);
  const stableLeave = useCallback(() => hangUpRef.current(), []);

  return {
    status,
    error,
    muted,
    speaking,
    peers,
    onCall,
    supported,
    pushToTalk,
    talking,
    join: stableJoin,
    leave: stableLeave,
    toggleMute,
    toggleSilence,
    setPushToTalk,
    setTalking,
  };
}
