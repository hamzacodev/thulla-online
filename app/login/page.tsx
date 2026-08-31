"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) {
      // email confirmation is off — straight in
      router.push("/username");
    } else {
      setNotice("Check your email for a confirmation link, then come back and sign in.");
      setMode("signin");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
        <h1 className="text-2xl font-bold text-center mb-1">Thulla</h1>
        <p className="text-slate-400 text-center text-sm mb-6">Sign in to play with friends</p>

        <div className="flex mb-5 rounded-lg overflow-hidden border border-slate-700">
          <button
            className={`flex-1 py-2 text-sm font-medium ${mode === "signin" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
            onClick={() => {
              setMode("signin");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${mode === "signup" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Sign up
          </button>
        </div>

        <label className="block text-sm text-slate-400 mb-1">Email</label>
        <input
          type="email"
          className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block text-sm text-slate-400 mb-1">Password</label>
        <input
          type="password"
          className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {notice && <p className="text-emerald-400 text-sm mb-3">{notice}</p>}

        <button
          disabled={busy || !email || !password}
          onClick={mode === "signin" ? handleSignIn : handleSignUp}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </div>
    </main>
  );
}
