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
/**
 * How long a link may sit not-yet-connected before we assume its offer went
 * missing and try again.
 *
 * Signalling rides Supabase broadcast, which is fire-and-forget: an offer
 * that never arrives produces no error, so both browsers simply wait on
 * each other forever. Nothing failed, so nothing retried — which is exactly
 * the shape of "I'm connected but they can't hear me".
 */
const STALL_MS = 6000;

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
  /** Identifies the connection: one per open tab. */
  id: string;
  /** Identifies the person: used for their seat, name and face. */
  userId: string;
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

/**
 * One entry per open tab, not per person.
 *
 * Peers used to be keyed by user id, which quietly broke two ordinary
 * things. Reload the page and your old presence lingers until the server
 * times it out, so everybody else keeps a dead peer connection under the
 * same key and never rebuilds it — your new session's offer arrives at a
 * connection that isn't closed or failed, and the audio comes back one-way
 * or not at all. Open two tabs and both of them claim the same key.
 *
 * Both of those also *sound* like echo, because a stale connection and a
 * live one deliver the same voice twice.
 *
 * `key` is per page load, so a reload is simply a new peer and the old one
 * disappears. `userId` is still carried, because seats, names and faces
 * belong to the person rather than the tab.
 */
interface PresenceMeta {
  key: string;
  userId: string;
  name: string;
  muted: boolean;
}

type Signal =
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  /** "I'm still waiting on you" — only the designated caller can act on it. */
  | { kind: "nudge"; from: string; to: string };

interface Link {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  userId: string;
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
  /** When the current state began. Drives the stall watchdog. */
  since: number;
  /**
   * Perfect negotiation: when both sides offer at once, the polite one
   * gives way. Derived from the two keys, so the two browsers always
   * disagree about who is polite — which is the point.
   */
  polite: boolean;
  /** An offer of ours is in flight; a collision is possible. */
  makingOffer: boolean;
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
  /**
   * This tab's identity on the call. Generated once per page load, so a
   * reload is a genuinely new peer rather than a second claim on the old
   * one — which is what left everybody else holding a dead connection.
   */
  const sessionRef = useRef("");
  /** Presence keys currently allowed to signal us — seated, and on the call. */
  const allowedRef = useRef(new Set<string>());
  const timersRef = useRef<{ level?: number; sweep?: number }>({});
  /** Signals that arrived while the microphone prompt was still open. */
  const pendingRef = useRef<Signal[]>([]);
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

  /**
   * Minted on first use rather than during render — a random value computed
   * while rendering isn't stable across React's re-renders, and this one has
   * to be the same for the whole life of the tab.
   */
  const sessionId = () => {
    if (!sessionRef.current) {
      sessionRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    }
    return sessionRef.current;
  };

  /** This tab's key on the call: the person, plus which tab they're in. */
  const myKey = () => `${idRef.current ?? "anon"}::${sessionId()}`;

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
        userId: link.userId,
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
          `${p.id}:${p.userId}:${p.name}:${p.state}:${+p.muted}${+p.silenced}${+p.speaking}${
            p.stream ? 1 : 0
          }`
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
    link.pc.oniceconnectionstatechange = null;
    try {
      link.pc.close();
    } catch {
      /* already closed */
    }
  };

  /** Moves a link to a new state and restarts its stall clock. */
  const mark = (link: Link, state: PeerState) => {
    if (link.state !== state) link.state = state;
    link.since = Date.now();
  };

  /**
   * Makes sure our microphone is actually attached to this connection.
   *
   * Tracks are added when a link is built, which is normally enough — but a
   * link rebuilt at an awkward moment, or built in the gap before the mic
   * arrived, would otherwise negotiate perfectly and carry no audio. That
   * failure is completely silent on this end: the call looks connected and
   * the other side just can't hear you.
   */
  const ensureTracks = (link: Link) => {
    const local = streamRef.current;
    if (!local) return;
    const senders = link.pc.getSenders();
    local.getTracks().forEach((track) => {
      const sender = senders.find((x) => x.track?.kind === track.kind);
      if (!sender) {
        try {
          link.pc.addTrack(track, local);
        } catch {
          /* already attached */
        }
      } else if (sender.track !== track) {
        void sender.replaceTrack(track).catch(() => {});
      }
    });
  };

  const offerTo = async (peerId: string, iceRestart = false) => {
    const link = linksRef.current.get(peerId);
    if (!link || !idRef.current) return;
    const me = myKey();
    ensureTracks(link);
    link.makingOffer = true;
    try {
      const offer = await link.pc.createOffer({ iceRestart });
      // Someone else's negotiation landed while we were building this one.
      if (link.pc.signalingState !== "stable" && !iceRestart) return;
      await link.pc.setLocalDescription(offer);
      send({ kind: "offer", from: me, to: peerId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch {
      /* the watchdog comes back around */
    } finally {
      link.makingOffer = false;
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
    if (!link || !idRef.current) return;
    const me = myKey();

    const isCaller = me < peerId;
    link.attempts++;

    if (!isCaller) {
      // We can't offer — but we can say we're still waiting, which is the
      // one thing that rescues an offer lost in transit. Silently sitting
      // here is what made this look like a dead call.
      mark(link, link.attempts > DIRECT_ATTEMPTS + 2 ? "failed" : "retrying");
      send({ kind: "nudge", from: me, to: peerId });
      publish();
      return;
    }

    if (link.attempts <= DIRECT_ATTEMPTS) {
      mark(link, "retrying");
      publish();
      // No remote description means this never got off the ground: the
      // offer went missing rather than the connection failing. Re-send it
      // whole. An ICE restart only helps a link that once worked.
      void offerTo(peerId, !!link.pc.remoteDescription);
      return;
    }

    if (!link.relayed) {
      // Direct never worked. Everything through the relay from here.
      const attempts = link.attempts;
      const name = link.name;
      const muted = link.muted;
      closeLink(peerId);
      const fresh = ensureLink(peerId, { key: peerId, userId: link.userId, name, muted }, true);
      fresh.attempts = attempts;
      mark(fresh, "relaying");
      publish();
      void offerTo(peerId);
      return;
    }

    mark(link, "failed");
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
      userId: meta?.userId ?? peerId,
      name: nameFor(meta?.userId ?? peerId, meta?.name ?? "Player"),
      muted: meta?.muted ?? false,
      state: relayOnly ? "relaying" : "connecting",
      attempts: 0,
      relayed: relayOnly,
      speakingUntil: 0,
      queued: [],
      // Stamped by `mark` below rather than inline: reading the clock in
      // an object literal here trips the purity lint, since this function
      // is declared in the render body even though it only ever runs from
      // an event or a timer.
      since: 0,
      // The caller (`me < id`) is the impolite one: on a collision it keeps
      // its offer and the other side rolls back.
      polite: myKey() > peerId,
      makingOffer: false,
      analyser: null,
      source: null,
    };
    mark(link, link.state);
    linksRef.current.set(peerId, link);
    ensureTracks(link);

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !idRef.current) return;
      send({ kind: "ice", from: myKey(), to: peerId, candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      link.stream = stream;
      attachAnalyser(link, stream);
      publish();
    };

    // Chrome can report the ICE agent failing without ever moving
    // connectionState, which leaves a dead link looking merely quiet.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") recover(peerId);
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          mark(link, "live");
          link.attempts = 0;
          break;
        case "disconnected":
          // Often transient — a phone changing cell. Give it a beat, and
          // let the watchdog take it from here if it doesn't come back.
          if (link.state === "live") mark(link, "retrying");
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
    const me = myKey();
    if (!idRef.current || signal.to !== me || signal.from === me) return;
    if (!liveRef.current) {
      // Mid-join: the microphone prompt is still open. Holding the offer is
      // the difference between connecting a second later and both sides
      // waiting on each other until the watchdog notices.
      if (startingRef.current && pendingRef.current.length < 64) pendingRef.current.push(signal);
      return;
    }
    // Only people holding a seat at this table get a connection, so knowing
    // the room code is not enough to listen in. The allowed set is rebuilt
    // from presence on every sync, so it is always the seated players
    // currently on the call — never a stale key from a closed tab.
    if (!allowedRef.current.has(signal.from)) return;

    if (signal.kind === "nudge") {
      // They're still waiting on us. Only the caller can fix that, and
      // re-offering costs nothing.
      const link = linksRef.current.get(signal.from);
      if (link && me < signal.from) void offerTo(signal.from, !!link.pc.remoteDescription);
      return;
    }

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
      // Perfect negotiation. Tearing the link down whenever an offer
      // arrived on a busy connection was the wrong move: a re-offer that
      // crossed with ours destroyed a link that was seconds from working,
      // and the rebuild raced the same way again.
      const link = ensureLink(signal.from);
      const collision = link.makingOffer || link.pc.signalingState !== "stable";
      if (collision && !link.polite) {
        // We hold the floor. They'll roll back and take ours.
        return;
      }
      try {
        if (collision) {
          // Drop our half-finished offer and take theirs instead.
          await link.pc.setLocalDescription({ type: "rollback" });
        }
        await link.pc.setRemoteDescription(signal.sdp);
        await drainIce(link);
        ensureTracks(link);
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        send({ kind: "answer", from: me, to: signal.from, sdp: { type: answer.type, sdp: answer.sdp } });
      } catch {
        // Leave the link standing — the watchdog retries it. Closing here
        // is how a recoverable hiccup became a permanently silent peer.
        mark(link, "retrying");
      }
      publish();
      return;
    }

    const link = linksRef.current.get(signal.from);
    if (!link) return;
    // An answer is only meaningful against an offer we're still holding.
    if (link.pc.signalingState !== "have-local-offer") return;
    try {
      await link.pc.setRemoteDescription(signal.sdp);
      await drainIce(link);
    } catch {
      /* a stale answer; the watchdog rebuilds the link if it really is dead */
    }
  };

  /**
   * Reads the presence roster and, if we're on the call ourselves, brings
   * the mesh in line with it. Idempotent, so it is safe to run on every
   * presence event and on a timer.
   */
  const reconcile = () => {
    const channel = channelRef.current;
    if (!channel || !idRef.current) return;
    const me = myKey();

    // Keyed by presence key — one entry per open tab — so a reloaded player
    // arrives as a new peer and their old one simply isn't here any more.
    const present = new Map<string, PresenceMeta>();
    Object.entries(channel.presenceState<PresenceMeta>()).forEach(([key, metas]) => {
      const meta = metas[metas.length - 1];
      if (!meta?.userId) return;
      if (!membersRef.current.some((m) => m.id === meta.userId)) return;
      present.set(key, { ...meta, key });
    });
    allowedRef.current = new Set(present.keys());

    // The roster is public: you can see there's a conversation to join
    // without opening your own microphone first. Collapsed to one line per
    // person, so somebody with two tabs open isn't listed twice.
    const seen = new Set<string>();
    const roster = Array.from(present.values())
      .filter((meta) => !seen.has(meta.userId) && seen.add(meta.userId))
      .map((meta) => ({ id: meta.userId, name: nameFor(meta.userId, meta.name) }))
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
      if (id === myKey()) return;
      const existing = linksRef.current.get(id);
      if (existing) {
        existing.name = nameFor(meta.userId, meta.name);
        existing.muted = meta.muted;
        if (existing.pc.connectionState === "closed") closeLink(id);
        else return;
      }
      ensureLink(id, meta);
      // Exactly one side offers, and it is always the same side: comparing
      // the two keys gives both browsers the same answer with no extra
      // round trip and no glare to resolve.
      if (me < id) void offerTo(id);
    });

    // Anything that hasn't connected by now is stuck rather than slow.
    // Nothing else notices this case: a dropped offer never fails, so no
    // state change fires and both browsers wait forever. This is the check
    // that turns "it just doesn't work sometimes" into a retry.
    const now = Date.now();
    linksRef.current.forEach((link, id) => {
      if (link.state === "live" || now - link.since < STALL_MS) return;
      recover(id);
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

    pendingRef.current = [];
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
      key: myKey(),
      userId,
      name: nameFor(userId, "Player"),
      muted: mutedRef.current,
    } satisfies PresenceMeta);

    reconcile();
    // Whatever arrived while the mic prompt was open is now answerable.
    const held = pendingRef.current.splice(0);
    for (const signal of held) void onSignal(signal);
    timersRef.current.level = window.setInterval(measure, LEVEL_INTERVAL_MS);
    timersRef.current.sweep = window.setInterval(reconcile, SWEEP_MS);
  };

  const trackPresence = () => {
    const me = idRef.current;
    if (!channelRef.current || !me || !liveRef.current) return;
    void channelRef.current.track({
      key: myKey(),
      userId: me,
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
      config: {
        broadcast: { self: false },
        // Per tab, so two tabs are two peers and a reload replaces nothing.
        presence: { key: `${userId}::${sessionId()}`, enabled: true },
      },
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

  /**
   * Tell the room we've gone before the tab closes.
   *
   * Without this the server carries a dead presence entry for up to half a
   * minute, and everyone else keeps a peer connection to a tab that no
   * longer exists — the thing that made a reload take the audio down with
   * it. `pagehide` rather than `beforeunload` because Safari on iOS doesn't
   * reliably fire the latter.
   */
  useEffect(() => {
    const bye = () => {
      const channel = channelRef.current;
      if (channel && liveRef.current) void channel.untrack();
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

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
