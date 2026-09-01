"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";

export default function UsernamePage() {
  const router = useRouter();
  const { loading, userId, displayName, username } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) router.push("/login");
    else if (username) router.push("/");
  }, [loading, userId, username, router]);

  if (loading || !userId || username) return null;

  async function handleSave() {
    const clean = value.trim();
    if (clean.length < 2) return setError("Username needs to be at least 2 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) return setError("Letters, numbers, and underscores only.");

    setBusy(true);
    setError("");

    /**
     * Upsert, not update. Accounts created before the sign-up trigger
     * existed have no `profiles` row, and an UPDATE that matches nothing
     * is not an error — it reports success, saves nothing, and leaves the
     * player stuck on this screen forever. Inserting the row when it's
     * missing is the only version of this that can't lie.
     *
     * Reading the row back is the proof: whatever the write claimed, this
     * is what the database will hand the next page.
     */
    const { data, error: saveError } = await supabase
      .from("profiles")
      .upsert({ id: userId, username: clean, display_name: displayName }, { onConflict: "id" })
      .select("username")
      .single();

    setBusy(false);

    if (saveError) {
      if (saveError.code === "23505") return setError("That username is taken — try another.");
      return setError(saveError.message);
    }
    if (data?.username !== clean) {
      return setError("That didn't save. Try again, or sign out and back in.");
    }

    router.push("/");
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="Pick a username" back="/" />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
        <div className="panel p-6">
          <h2 className="font-display text-center text-2xl font-bold text-cream-50">
            Pick a username
          </h2>
          <p className="mt-1 text-center text-sm text-cream-400">
            This is what other players see at the table.
          </p>

          <label className="mt-5 block">
            <span className="mb-1 block text-xs font-medium text-cream-400">Username</span>
            <input
              className="field"
              value={value}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              placeholder="e.g. hamza_shakoor"
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) void handleSave();
              }}
            />
          </label>

          <p className="mt-1.5 text-xs text-cream-400/70">
            2–20 characters. Letters, numbers and underscores.
          </p>

          {error && (
            <p className="mt-3 rounded-lg bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">
              {error}
            </p>
          )}

          <button
            disabled={busy || !value.trim()}
            onClick={handleSave}
            className="btn btn-primary mt-5 w-full"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}
