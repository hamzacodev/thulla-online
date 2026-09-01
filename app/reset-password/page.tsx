"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AppHeader } from "@/components/AppHeader";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Supabase turns the emailed recovery link into a session in the browser.
   * Until that has happened there's nothing to update, so the form waits.
   */
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleUpdate() {
    if (password.length < 6) return setError("Password needs at least 6 characters.");
    if (password !== confirm) return setError("Those two passwords don't match.");
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/");
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="New password" back="/login" />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
        <div className="panel p-6">
          <h2 className="font-display text-xl font-bold text-cream-50">Set a new password</h2>

          {!ready ? (
            <>
              <p className="mt-2 text-sm text-cream-400">
                Open this page from the reset link in your email — that&apos;s what lets us change
                your password.
              </p>
              <Link href="/forgot-password" className="btn btn-secondary mt-5 w-full">
                Send me a new link
              </Link>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cream-400">New password</span>
                  <input
                    type="password"
                    className="field"
                    value={password}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-cream-400">Confirm password</span>
                  <input
                    type="password"
                    className="field"
                    value={confirm}
                    autoComplete="new-password"
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p className="mt-3 rounded-lg bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">
                  {error}
                </p>
              )}

              <button disabled={busy || !password} onClick={handleUpdate} className="btn btn-primary mt-5 w-full">
                {busy ? "Saving…" : "Update password"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
