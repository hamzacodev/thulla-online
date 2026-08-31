"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    localStorage.setItem(`thulla-player-${data.code}`, data.playerId);
    router.push(`/room/${data.code}`);
  }

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name.");
    if (!joinCode.trim()) return setError("Enter a room code.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/join-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code: joinCode }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    localStorage.setItem(`thulla-player-${data.code}`, data.playerId);
    router.push(`/room/${data.code}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
        <h1 className="text-2xl font-bold text-center mb-1">Thulla</h1>
        <p className="text-slate-400 text-center text-sm mb-6">Play with friends anywhere, 4 players</p>

        <div className="flex mb-5 rounded-lg overflow-hidden border border-slate-700">
          <button
            className={`flex-1 py-2 text-sm font-medium ${mode === "create" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
            onClick={() => setMode("create")}
          >
            Create room
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${mode === "join" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
            onClick={() => setMode("join")}
          >
            Join room
          </button>
        </div>

        <label className="block text-sm text-slate-400 mb-1">Your name</label>
        <input
          className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="e.g. Hamza"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />

        {mode === "join" && (
          <>
            <label className="block text-sm text-slate-400 mb-1">Room code</label>
            <input
              className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 uppercase tracking-widest"
              placeholder="ABCDE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={5}
            />
          </>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          disabled={busy}
          onClick={mode === "create" ? handleCreate : handleJoin}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {busy ? "Please wait…" : mode === "create" ? "Create room" : "Join room"}
        </button>

        <p className="text-slate-500 text-xs text-center mt-5">
          Rooms hold exactly 4 players, seated in 2 teams of 2 (opposite seats are partners).
        </p>
      </div>
    </main>
  );
}
