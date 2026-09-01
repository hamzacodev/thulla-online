"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/useRoomChat";

/**
 * Table chat. Two shapes from one component: an always-open panel for the
 * lobby and the results screen, and a drawer over the table during a game,
 * where the screen is already full of cards.
 */

/**
 * Tapping beats typing when it's your turn and the table is waiting. These
 * are the things people actually say at a Thulla table.
 */
const QUICK = ["Chalo! 🏃", "Wah! 👏", "😂", "Meri baari?", "Ek minute ⏳", "GG 🤝"];

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Bubble({
  message,
  mine,
  avatarUrl,
  showName,
}: {
  message: ChatMessage;
  mine: boolean;
  avatarUrl?: string | null;
  showName: boolean;
}) {
  return (
    <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
      <span className={showName && !mine ? "" : "invisible"}>
        <Avatar src={avatarUrl} name={message.name} size={22} />
      </span>
      <div className={`min-w-0 max-w-[78%] ${mine ? "text-right" : ""}`}>
        {showName && !mine && (
          <p className="mb-0.5 px-1 text-[0.65rem] font-semibold text-cream-400">{message.name}</p>
        )}
        <div
          className={`inline-block break-words rounded-2xl px-3 py-1.5 text-sm ${
            mine
              ? "rounded-br-sm bg-brass-400/25 text-cream-50"
              : "rounded-bl-sm bg-white/[0.07] text-cream-100"
          } ${message.pending ? "opacity-60" : ""}`}
        >
          {message.body}
        </div>
        <p className="tabular mt-0.5 px-1 text-[0.6rem] text-cream-400/60">{timeOf(message.at)}</p>
      </div>
    </div>
  );
}

interface RoomChatProps {
  messages: ChatMessage[];
  userId: string | null;
  avatars?: Record<string, string>;
  onSend: (body: string) => void;
  /** Compact drawer body for in-game use. */
  compact?: boolean;
}

export function RoomChat({ messages, userId, avatars, onSend, compact }: RoomChatProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Follow the conversation, but never yank the view away from someone who
  // has scrolled up to read something.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    if (nearBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit(body: string) {
    const clean = body.trim();
    if (!clean) return;
    onSend(clean);
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        className={`min-h-0 flex-1 space-y-2 overflow-y-auto px-1 ${compact ? "max-h-[38vh]" : "max-h-64"}`}
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-cream-400/70">
            No messages yet. Say something!
          </p>
        ) : (
          messages.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              mine={m.userId === userId}
              avatarUrl={avatars?.[m.userId]}
              showName={messages[i - 1]?.userId !== m.userId}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => submit(q)}
            className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-cream-200 transition-colors hover:bg-white/10"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <input
          className="field flex-1"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Message the table…"
          aria-label="Message the table"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim()} className="btn btn-primary !px-4">
          Send
        </button>
      </form>
    </div>
  );
}

/**
 * The in-game entry point: a button in the header that opens the chat over
 * the table. Closed by default, because the table is what you came for.
 */
export function ChatDrawer({
  messages,
  unread,
  userId,
  avatars,
  onSend,
  onOpenChange,
}: {
  messages: ChatMessage[];
  unread: number;
  userId: string | null;
  avatars?: Record<string, string>;
  onSend: (body: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  function toggle() {
    const next = !open;
    setOpen(next);
    onOpenChange(next);
  }

  /**
   * Escape, or a tap anywhere else, puts the chat away. Deliberately not a
   * full-screen backdrop: that would swallow taps meant for the mute button
   * sitting right next to this one.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };

    window.addEventListener("keydown", onKey);
    // Capture, so it still fires for handlers that stop propagation.
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Close chat" : "Open chat"}
        aria-label={open ? "Close chat" : `Open chat${unread ? `, ${unread} unread` : ""}`}
        className="btn btn-secondary relative !min-h-9 !gap-1 !px-2.5 !text-xs"
      >
        <span aria-hidden>{open ? "✕" : "💬"}</span>
        {!open && unread > 0 && (
          <span className="tabular absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-chili-500 px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="absolute inset-x-2 top-full z-40 mt-1">
          <div className="panel anim-rise flex max-h-[70vh] flex-col p-3">
            <RoomChat
              messages={messages}
              userId={userId}
              avatars={avatars}
              onSend={onSend}
              compact
            />
          </div>
        </div>
      )}
    </>
  );
}
