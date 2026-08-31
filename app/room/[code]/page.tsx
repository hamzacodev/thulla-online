"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRoom } from "@/lib/useRoom";
import { CardFace, CardBack } from "@/lib/CardFace";
import { Card, suitName } from "@/lib/types";

export default function RoomPage() {
  const params = useParams();
  const code = (params.code as string)?.toUpperCase();
  const { state, loading } = useRoom(code ?? null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (code) setPlayerId(localStorage.getItem(`thulla-player-${code}`));
  }, [code]);

  async function handleStart() {
    setStarting(true);
    setError("");
    const res = await fetch("/api/start-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId }),
    });
    const data = await res.json();
    setStarting(false);
    if (data.error) setError(data.error);
  }

  async function handlePlay(card: Card) {
    setError("");
    const res = await fetch("/api/play-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId, card }),
    });
    const data = await res.json();
    if (data.error) setError(data.error);
  }

  if (loading || !state) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-slate-400">Loading room…</p>
      </main>
    );
  }

  const me = state.players.find((p) => p.id === playerId);

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4 text-center">
        <div>
          <p className="mb-2">You&apos;re not recognized in this room on this device.</p>
          <p className="text-slate-400 text-sm">Go back and join with room code {code}.</p>
        </div>
      </main>
    );
  }

  if (state.status === "waiting") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800 text-center">
          <p className="text-slate-400 text-sm mb-1">Room code</p>
          <p className="text-4xl font-bold tracking-widest mb-4">{code}</p>
          <p className="text-slate-400 text-sm mb-4">Share this code with your friends, wherever they are.</p>

          <div className="space-y-2 mb-5">
            {[0, 1, 2, 3].map((seat) => {
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
              disabled={state.players.length !== 4 || starting}
              onClick={handleStart}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {state.players.length !== 4 ? `Need ${4 - state.players.length} more player(s)` : starting ? "Starting…" : "Start game"}
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
  const rel = (seat: number) => (seat - me.seat + 4) % 4; // 0=me,1=right,2=partner,3=left
  const bySeat = (seat: number) => state.players.find((p) => p.seat === seat)!;
  const isMyTurn = state.turnSeat === me.seat;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-2xl flex justify-between items-center mb-2 text-sm text-slate-400">
        <span>Room {code}</span>
        <span>
          Team A: {state.players.filter((p) => p.team === 0).map((p) => p.name).join(" & ")} · Team B:{" "}
          {state.players.filter((p) => p.team === 1).map((p) => p.name).join(" & ")}
        </span>
      </div>

      {/* Partner (top) */}
      <PlayerBadge player={bySeat((me.seat + 2) % 4)} isTurn={state.turnSeat === (me.seat + 2) % 4} />

      <div className="flex items-center justify-between w-full max-w-2xl my-4">
        {/* Left opponent */}
        <PlayerBadge player={bySeat((me.seat + 3) % 4)} isTurn={state.turnSeat === (me.seat + 3) % 4} vertical />

        {/* Pile / center */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[120px]">
          <div className="flex gap-2 mb-2">
            {state.pile.map((entry, i) => (
              <CardFace key={i} card={entry.card} />
            ))}
            {state.pile.length === 0 && <p className="text-slate-600 text-sm">No cards played yet this trick</p>}
          </div>
          {state.ledSuit && <p className="text-xs text-slate-500">Led suit: {suitName(state.ledSuit)}</p>}
        </div>

        {/* Right opponent */}
        <PlayerBadge player={bySeat((me.seat + 1) % 4)} isTurn={state.turnSeat === (me.seat + 1) % 4} vertical />
      </div>

      {/* Log */}
      <div className="w-full max-w-2xl text-xs text-slate-500 mb-3 text-center min-h-[16px]">
        {state.log[state.log.length - 1]}
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      <p className={`text-sm font-medium mb-2 ${isMyTurn ? "text-emerald-400" : "text-slate-500"}`}>
        {isMyTurn ? "Your turn — pick a card" : `Waiting for ${bySeat(state.turnSeat).name}…`}
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

function PlayerBadge({
  player,
  isTurn,
  vertical,
}: {
  player: { name: string; hand: string[]; team: 0 | 1 };
  isTurn: boolean;
  vertical?: boolean;
}) {
  return (
    <div
      className={`flex ${vertical ? "flex-col" : "flex-col"} items-center gap-1 px-3 py-2 rounded-xl ${
        isTurn ? "bg-emerald-900/50 ring-1 ring-emerald-500" : "bg-slate-900"
      }`}
    >
      <span className="text-sm font-medium">{player.name}</span>
      <div className="flex gap-0.5">
        <CardBack small />
        <span className="text-xs text-slate-400 self-center">×{player.hand.length}</span>
      </div>
    </div>
  );
}
