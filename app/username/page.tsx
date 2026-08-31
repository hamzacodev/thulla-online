"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabaseClient";

export default function UsernamePage() {
  const router = useRouter();
  const { loading, userId, username } = useAuth();
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
    const { error } = await supabase.from("profiles").update({ username: clean }).eq("id", userId);
    setBusy(false);
    if (error) {
      if (error.code === "23505") return setError("That username is taken — try another.");
      return setError(error.message);
    }
    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
        <h1 className="text-2xl font-bold text-center mb-1">Pick a username</h1>
        <p className="text-slate-400 text-center text-sm mb-6">This is what other players will see.</p>

        <input
          className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="e.g. hamza_shakoor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          disabled={busy || !value}
          onClick={handleSave}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
