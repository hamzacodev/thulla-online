"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { authedFetch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";
import { PLAYER_COUNT_OPTIONS, PlayerCount } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { loading, userId, username, accessToken } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) router.push("/login");
    else if (!username) router.push("/username");
  }, [loading, userId, username, router]);

  if (loading || !userId || !username) return null;

  async function handleCreate() {
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/create-room", accessToken, { maxPlayers: playerCount });
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push(`/room/${data.code}`);
  }

  async function handleJoin() {
    if (!joinCode.trim()) return setError("Enter a room code.");
    setBusy(true);
    setError("");
    const data = await authedFetch("/api/join-room", accessToken, { code: joinCode });
    setBusy(false);
    if (data.error) return setError(data.error);
    router.push(`/room/${data.code}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Thulla</h1>
          {username && (
            <button onClick={handleSignOut} className="text-xs text-slate-500 hover:text-slate-300">
              Sign out
            </button>
          )}
        </div>
        <p className="text-slate-400 text-sm mb-6">
          {username ? `Playing as ${username}` : "Play with friends anywhere"}
        </p>

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

        {mode === "create" ? (
          <>
            <label className="block text-sm text-slate-400 mb-2">Number of players</label>
            <div className="flex gap-2 mb-5">
              {PLAYER_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    playerCount === n
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
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
          Rooms split into two even teams by seat — pick 4, 6, or 8 players.
        </p>
      </div>
    </main>
  );
}
