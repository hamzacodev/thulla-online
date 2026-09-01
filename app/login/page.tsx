"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { AppHeader } from "@/components/AppHeader";

function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/");
  }

  async function handleSignUp() {
    if (!name.trim()) return setError("What should we call you?");
    if (password.length < 6) return setError("Password needs at least 6 characters.");
    setBusy(true);
    setError("");
    setNotice("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() },
        // Send the confirmation link back to wherever they actually signed
        // up from, instead of Supabase's default Site URL.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setBusy(false);
    if (error) {
      // Some projects surface this directly; most don't (see below).
      if (/already registered|already exists/i.test(error.message)) {
        setError("That email already has an account. Sign in instead — or reset your password.");
        setMode("signin");
        return;
      }
      return setError(error.message);
    }

    // Supabase deliberately does NOT error when you sign up with an address
    // that already exists — it returns a decoy user with no identities and
    // no session, so an attacker can't probe which emails are registered.
    // Without this branch the screen says "check your email" for a mail that
    // is never sent, which is exactly what it looks like when nothing works.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError("That email already has an account. Sign in instead — or reset your password.");
      setMode("signin");
      return;
    }

    if (data.session) {
      router.push("/username");
    } else {
      setNotice(
        "Check your email for a confirmation link — it can take a minute, and it sometimes lands in spam."
      );
      setMode("signin");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title={mode === "signin" ? "Sign in" : "Create account"} />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
        <div className="panel p-6">
          <h2 className="font-display text-center text-2xl font-bold text-cream-50">Thulla</h2>
          <p className="mt-1 text-center text-sm text-cream-400">
            {mode === "signin" ? "Welcome back — chalo khelein!" : "Sign up to play with friends"}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                aria-pressed={mode === m}
                className={`btn !min-h-10 !text-sm ${mode === m ? "btn-primary" : "btn-ghost"}`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-cream-400">Your name</span>
                <input
                  className="field"
                  value={name}
                  maxLength={40}
                  autoComplete="name"
                  placeholder="Hamza"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-cream-400">Email</span>
              <input
                type="email"
                className="field"
                value={email}
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-cream-400">Password</span>
              <input
                type="password"
                className="field"
                value={password}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="At least 6 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-3 rounded-lg bg-mint-400/15 px-3 py-2 text-sm text-mint-300">{notice}</p>
          )}

          <button
            disabled={busy || !email || !password}
            onClick={mode === "signin" ? handleSignIn : handleSignUp}
            className="btn btn-primary mt-5 w-full"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {mode === "signin" && (
            <Link
              href="/forgot-password"
              className="mt-3 block text-center text-xs text-cream-400 underline underline-offset-4 hover:text-cream-100"
            >
              Forgot your password?
            </Link>
          )}
        </div>

        <Link href="/games/thulla/play?mode=cpu" className="btn btn-ghost mt-4 !text-xs">
          Or play vs the computer — no account needed
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-cream-400">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
