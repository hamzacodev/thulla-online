"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/lib/settings";
import { t } from "@/lib/copy";
import { CardBack, PlayingCard } from "@/components/PlayingCard";

/**
 * Home. Deliberately playable without an account: single-player runs entirely
 * in the browser, so signing in is only asked for where it actually buys
 * something — playing with friends, and stats that follow you between devices.
 */
export default function Home() {
  const router = useRouter();
  const { userId, username, loading } = useAuth();
  const { settings } = useSettings();
  const lang = settings.lang;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <main className="felt flex min-h-dvh flex-col">
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        {/* Brand */}
        <div className="flex flex-col items-center pt-6 text-center">
          <div
            className="relative mb-6"
            style={{ width: "calc(var(--card-w) * 2.9)", height: "calc(var(--card-h) * 1.18)" }}
            aria-hidden
          >
            <CardBack
              className="absolute bottom-0 left-0"
              style={{ transform: "rotate(-16deg)", transformOrigin: "bottom right" }}
            />
            <CardBack
              className="absolute bottom-0 right-0"
              style={{ transform: "rotate(16deg)", transformOrigin: "bottom left" }}
            />
            <PlayingCard
              card="AS"
              className="absolute bottom-0 left-1/2"
              style={{ transform: "translateX(-50%) translateY(-6%)" }}
            />
          </div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-cream-50">BHABHI</h1>
          <p className="mt-1 text-sm font-medium uppercase tracking-[0.22em] text-brass-300">
            {t("tagline", lang)}
          </p>
          <p className="mt-3 max-w-xs text-sm italic text-cream-400">“{t("hook", lang)}” 😄</p>
        </div>

        <div className="brass-rule my-7" />

        {/* Primary actions */}
        <div className="flex flex-col gap-2.5">
          <Link href="/play?mode=cpu" className="btn btn-primary !min-h-14 text-base">
            🤖 {t("playCpu", lang)}
          </Link>
          <Link href="/play?mode=friends" className="btn btn-secondary !min-h-14 text-base">
            👥 {t("playFriends", lang)}
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Link href="/how-to-play" className="btn btn-secondary !min-h-16 flex-col !gap-1 !px-2 text-xs">
            <span aria-hidden className="text-lg">📖</span>
            {t("howToPlay", lang)}
          </Link>
          <Link href="/profile" className="btn btn-secondary !min-h-16 flex-col !gap-1 !px-2 text-xs">
            <span aria-hidden className="text-lg">👤</span>
            {t("profile", lang)}
          </Link>
          <Link href="/settings" className="btn btn-secondary !min-h-16 flex-col !gap-1 !px-2 text-xs">
            <span aria-hidden className="text-lg">⚙️</span>
            {t("settings", lang)}
          </Link>
        </div>

        {/* Account strip */}
        <div className="mt-auto pt-8 text-center text-xs">
          {loading ? (
            <span className="text-cream-400/50">…</span>
          ) : userId ? (
            <div className="flex items-center justify-center gap-2 text-cream-400">
              <span>
                Signed in as <span className="font-semibold text-cream-100">{username ?? "…"}</span>
              </span>
              <button onClick={handleSignOut} className="btn btn-ghost !min-h-8 !px-2 !text-xs">
                {t("signOut", lang)}
              </button>
            </div>
          ) : (
            <p className="text-cream-400">
              <Link href="/login" className="font-semibold text-brass-300 underline underline-offset-4">
                Sign in
              </Link>{" "}
              to play with friends and save your stats
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
