"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AppHeader } from "@/components/AppHeader";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    // Always report success: whether an address has an account is not
    // something an unauthenticated form should confirm.
    setSent(true);
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="Reset password" back="/login" />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
        <div className="panel p-6">
          {sent ? (
            <>
              <p className="text-3xl" aria-hidden>📬</p>
              <h2 className="mt-2 font-display text-xl font-bold text-cream-50">Check your inbox</h2>
              <p className="mt-1 text-sm text-cream-400">
                If there&apos;s an account for <span className="text-cream-100">{email}</span>,
                we&apos;ve sent a reset link.
              </p>
              <Link href="/login" className="btn btn-secondary mt-5 w-full">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-cream-50">Forgot your password?</h2>
              <p className="mt-1 text-sm text-cream-400">
                Koi baat nahi — enter your email and we&apos;ll send you a reset link.
              </p>

              <label className="mt-5 block">
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

              {error && (
                <p className="mt-3 rounded-lg bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">
                  {error}
                </p>
              )}

              <button disabled={busy || !email} onClick={handleReset} className="btn btn-primary mt-5 w-full">
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
