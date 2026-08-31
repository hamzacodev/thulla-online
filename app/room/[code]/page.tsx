"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoom } from "@/lib/useRoom";
import { useAuth } from "@/lib/useAuth";
import { authedFetch } from "@/lib/apiClient";
import { CardFace, CardBack } from "@/lib/CardFace";
import { Card, suitName } from "@/lib/types";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();
  const { state, loading } = useRoom(code ?? null);
  const { loading: authLoading, userId, accessToken } = useAuth();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!authLoading && !userId) router.push("/login");
  }, [authLoading, userId, router]);

  async function handleStart() {
    setStarting(true);
    setError("");
    const data = await authedFetch("/api/start-game", accessToken, { code });
    setStarting(false);
    if (data.error) setError(data.error);
  }

  async function handlePlay(card: Card) {
    setError("");
    const data = await authedFetch("/api/play-card", accessToken, { code, card });
    if (data.error) setError(data.error);
  }

  if (loading || authLoading || !state) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-slate-400">Loading room…</p>
      </main>
    );
  }

  const me = state.players.find((p) => p.id === userId);

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4 text-center">
        <div>
          <p className="mb-2">You&apos;re not in this room on this account.</p>
          <p className="text-slate-400 text-sm">Go back and join with room code {code}.</p>
        </div>
      </main>
    );
  }

  if (state.status === "waiting") {
    const seats = Array.from({ length: state.maxPlayers }, (_, i) => i);
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800 text-center">
          <p className="text-slate-400 text-sm mb-1">Room code</p>
          <p className="text-4xl font-bold tracking-widest mb-4">{code}</p>
          <p className="text-slate-400 text-sm mb-4">Share this code with your friends, wherever they are.</p>

          <div className="space-y-2 mb-5">
            {seats.map((seat) => {
              const p = state.players.find((pl) => pl.seat === seat);
              return (
                <div
                  key={seat}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    p ? "bg-slate-800" : "bg-slate-800/40 border border-dashed border-slate-700"
                  }`}
                >
                  <span className={p ? "text-slate-100" : "text-slate-500"}>
                    {p ? p.name : "Waiting for player…"}
                  </span>
                  {p && <span className="text-xs text-slate-400">Team {p.team === 0 ? "A" : "B"}</span>}
                </div>
              );
            })}
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          {me.seat === 0 ? (
            <button
              disabled={state.players.length !== state.maxPlayers || starting}
              onClick={handleStart}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {state.players.length !== state.maxPlayers
                ? `Need ${state.maxPlayers - state.players.length} more player(s)`
                : starting
                ? "Starting…"
                : "Start game"}
            </button>
          ) : (
            <p className="text-slate-400 text-sm">Waiting for the host to start the game…</p>
          )}
        </div>
      </main>
    );
  }

  if (state.status === "finished") {
    const won = state.winningTeam === me.team;
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4 text-center">
        <div>
          <p className="text-3xl font-bold mb-2">{won ? "Your team won! 🎉" : "Your team lost."}</p>
          <p className="text-slate-400">Team {state.winningTeam === 0 ? "A" : "B"} emptied their hands first.</p>
        </div>
      </main>
    );
  }

  // status === "playing"
  const isMyTurn = state.turnSeat === me.seat;
  // everyone but me, in seat order starting right after my seat, wrapping around
  const others = Array.from({ length: state.maxPlayers - 1 }, (_, i) => {
    const seat = (me.seat + 1 + i) % state.maxPlayers;
    return state.players.find((p) => p.seat === seat);
  }).filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-3xl flex justify-between items-center mb-4 text-sm text-slate-400">
        <span>Room {code}</span>
        <span>
          Team A: {state.players.filter((p) => p.team === 0).map((p) => p.name).join(", ")} · Team B:{" "}
          {state.players.filter((p) => p.team === 1).map((p) => p.name).join(", ")}
        </span>
      </div>

      {/* Everyone else, wrapped in a row, color-coded by team */}
      <div className="flex flex-wrap justify-center gap-3 mb-6 max-w-3xl">
        {others.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border ${
              state.turnSeat === p.seat
                ? "bg-emerald-900/50 border-emerald-500"
                : p.team === 0
                ? "bg-slate-900 border-emerald-800"
                : "bg-slate-900 border-sky-800"
            }`}
          >
            <span className="text-sm font-medium">{p.name}</span>
            <span className={`text-[10px] ${p.team === 0 ? "text-emerald-400" : "text-sky-400"}`}>
              Team {p.team === 0 ? "A" : "B"}
            </span>
            <div className="flex gap-0.5 items-center">
              <CardBack small />
              <span className="text-xs text-slate-400">×{p.hand.length}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pile / center */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[120px] w-full">
        <div className="flex flex-wrap gap-2 mb-2 justify-center">
          {state.pile.map((entry, i) => (
            <CardFace key={i} card={entry.card} />
          ))}
          {state.pile.length === 0 && <p className="text-slate-600 text-sm">No cards played yet this trick</p>}
        </div>
        {state.ledSuit && <p className="text-xs text-slate-500">Led suit: {suitName(state.ledSuit)}</p>}
      </div>

      {/* Log */}
      <div className="w-full max-w-2xl text-xs text-slate-500 mb-3 text-center min-h-[16px]">
        {state.log[state.log.length - 1]}
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      <p className={`text-sm font-medium mb-2 ${isMyTurn ? "text-emerald-400" : "text-slate-500"}`}>
        {isMyTurn ? "Your turn — pick a card" : `Waiting for ${state.players.find((p) => p.seat === state.turnSeat)?.name}…`}
      </p>

      {/* My hand */}
      <div className="flex flex-wrap gap-2 justify-center max-w-3xl">
        {me.hand.map((card) => (
          <button
            key={card}
            onClick={() => isMyTurn && handlePlay(card)}
            disabled={!isMyTurn}
            className={`transition ${isMyTurn ? "hover:-translate-y-2 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
          >
            <CardFace card={card} />
          </button>
        ))}
      </div>
    </main>
  );
}
