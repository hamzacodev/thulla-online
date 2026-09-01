"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";

/**
 * The platform's own navigation — the thing that makes this a shelf of games
 * rather than one game with extra screens.
 *
 * Deliberately absent from the card tables themselves (`/game`, `/room/*`),
 * which are full-screen and have their own controls. Nav that follows you
 * onto the table would just eat the felt.
 *
 * Labels collapse to icons below `sm` instead of hiding behind a menu: these
 * fit across a phone, and a tap beats a tap-then-tap.
 *
 * The account lives here too. It used to sit at the bottom of the home page,
 * which meant signing out was somewhere you had to scroll to find, and only
 * from one page of the whole site.
 */
const LINKS = [
  { href: "/games", label: "Games", icon: "🃏" },
  { href: "/profile/history", label: "History", icon: "🕘" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function PlatformNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, username, displayName, avatarUrl, loading } = useAuth();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const name = username ?? displayName ?? "You";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-md">
      <nav
        className="mx-auto flex w-full max-w-5xl items-center gap-1 px-3 py-2"
        aria-label="Main"
      >
        <Link
          href="/"
          className="mr-auto flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5"
        >
          <span aria-hidden className="text-lg">🃏</span>
          <span className="font-display truncate text-sm font-bold text-cream-50 sm:text-base">
            Desi Card Games
          </span>
        </Link>

        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`btn !min-h-9 !gap-1.5 !px-2.5 !text-xs ${
                active ? "btn-secondary !border-brass-400/40 !text-brass-200" : "btn-ghost"
              }`}
            >
              <span aria-hidden>{link.icon}</span>
              <span className="hidden sm:inline">{link.label}</span>
              <span className="sr-only sm:hidden">{link.label}</span>
            </Link>
          );
        })}

        {/* Account. The avatar is the way into the profile, so it replaces a
            separate Profile link rather than adding to the row. */}
        {!loading &&
          (userId ? (
            <>
              <Link
                href="/profile"
                title={`Signed in as ${name}`}
                aria-label={`Profile — signed in as ${name}`}
                className={`btn !min-h-9 !gap-1.5 !px-1.5 !text-xs sm:!px-2.5 ${
                  pathname === "/profile" ? "btn-secondary !border-brass-400/40" : "btn-ghost"
                }`}
              >
                <Avatar src={avatarUrl} name={name} size={22} />
                <span className="hidden max-w-[7rem] truncate text-cream-100 md:inline">{name}</span>
              </Link>
              <button
                type="button"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className="btn btn-ghost !min-h-9 !gap-1.5 !px-2 !text-xs"
              >
                <span aria-hidden>⏻</span>
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-secondary !min-h-9 !px-3 !text-xs">
              Sign in
            </Link>
          ))}
      </nav>
    </header>
  );
}

/**
 * "Games → Thulla". The way back out of a game, so nobody ever feels stuck
 * inside one. Collapses to a plain back link on a phone.
 */
export function Breadcrumbs({ trail }: { trail: Array<{ label: string; href?: string }> }) {
  const parent = [...trail].reverse().find((c) => c.href);

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      {/* Phone: one tap back to where you came from. */}
      {parent && (
        <Link href={parent.href!} className="btn btn-ghost !min-h-8 !px-2 !text-xs sm:hidden">
          ← {parent.label}
        </Link>
      )}

      <ol className="hidden items-center gap-1.5 text-xs text-cream-400 sm:flex">
        {trail.map((crumb, i) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-cream-400/40">→</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="transition-colors hover:text-cream-100">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-semibold text-cream-100">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
