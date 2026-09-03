"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { loserName, outcomeLabel } from "@/components/HistoryCard";
import { PlayingCard } from "@/components/PlayingCard";
import { useAuth } from "@/lib/useAuth";
import {
  MigrationMissingError,
  fetchRemoteGame,
  readLocalHistory,
  type GameRecord,
} from "@/lib/gameHistory";

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function GameDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { userId, loading: authLoading } = useAuth();
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function load() {
      setLoading(true);
      const local = () => readLocalHistory().find((r) => r.id === id) ?? null;
      try {
        let found: GameRecord | null = null;
        if (userId) {
          try {
            found = await fetchRemoteGame(id);
          } catch (e) {
            if (!(e instanceof MigrationMissingError)) throw e;
            found = local();
          }
        }
        if (!found) found = local();
        if (active) setRecord(found);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load that game.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id, userId, authLoading]);

  const outcome = record ? outcomeLabel(record) : null;
  const loser = loserName(record?.game);
  const loserLabel = `${loser.icon} ${loser.text}`;

  // Trump-Patta keeps the two cards that decided the game in `details`.
  const removedCard = typeof record?.details?.removedCard === "string" ? record.details.removedCard : null;
  const remainingCard =
    typeof record?.details?.remainingCard === "string" ? record.details.remainingCard : null;

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="Game Details" back="/profile/history" />

      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4">
        {loading ? (
          <p className="mt-8 text-center text-sm text-cream-400">Loading…</p>
        ) : error ? (
          <p className="rounded-xl bg-chili-500/15 px-3 py-2 text-sm text-chili-400" role="alert">
            Oops! Kuch masla ho gaya — {error}
          </p>
        ) : !record ? (
          <div className="panel p-6 text-center">
            <p className="font-semibold text-cream-50">That game isn&apos;t here.</p>
            <p className="mt-1 text-sm text-cream-400">It may have been played on another device.</p>
            <Link href="/profile/history" className="btn btn-secondary mt-4 w-full">
              Back to history
            </Link>
          </div>
        ) : (
          <>
            <div className="panel p-4">
              <p className={`font-display text-2xl font-bold ${outcome!.tone}`}>
                <span aria-hidden>{outcome!.icon}</span> You {outcome!.text.toLowerCase()}
              </p>
              <p className="mt-1 text-sm text-cream-400">
                {new Date(record.completedAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                ["Game mode", record.mode === "cpu" ? "vs Computer" : "With Friends"],
                ["Players", String(record.playerCount)],
                ["Difficulty", record.cpuDifficulty ?? "—"],
                ["Duration", formatDuration(record.durationMs)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <dt className="text-[0.68rem] uppercase tracking-wide text-cream-400">{label}</dt>
                  <dd className="mt-0.5 font-semibold capitalize text-cream-50">{value}</dd>
                </div>
              ))}
            </dl>

            {record.game === "trump_patta" && removedCard && remainingCard && (
              <section className="mt-5">
                <h2 className="mb-2 text-sm font-semibold text-cream-100">How it ended</h2>
                <div className="flex items-start justify-center gap-6 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">
                      Left holding
                    </p>
                    <PlayingCard card={remainingCard} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-[0.68rem] uppercase tracking-wide text-cream-400">
                      Hidden card
                    </p>
                    <PlayingCard card={removedCard} />
                  </div>
                </div>
                <p className="mt-1.5 text-center text-[0.7rem] text-cream-400">
                  Same rank — they would have paired, if the hidden card had ever been dealt.
                </p>
              </section>
            )}

            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-cream-100">Final table</h2>
              <ol className="space-y-1.5">
                {[...record.players]
                  .sort((a, b) => a.position - b.position)
                  .map((p) => {
                    const isMe = p.position === record.myPosition;
                    return (
                      <li
                        key={`${p.name}-${p.position}`}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                          p.result === "thulla"
                            ? "bg-chili-500/10 ring-1 ring-chili-400/30"
                            : "bg-white/[0.04]"
                        } ${isMe ? "ring-1 ring-brass-300/50" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="tabular w-5 shrink-0 text-cream-400">{p.position + 1}.</span>
                          <span aria-hidden className="shrink-0">{p.type === "cpu" ? "🤖" : "🙂"}</span>
                          <span className="truncate font-medium text-cream-50">{p.name}</span>
                          {isMe && <span className="shrink-0 text-[0.65rem] text-brass-300">(you)</span>}
                        </span>
                        <span className="shrink-0 text-xs">
                          {p.result === "win"
                            ? "🏆 Winner"
                            : p.result === "thulla"
                            ? loserLabel
                            : `${p.position + 1}${["st", "nd", "rd"][p.position] ?? "th"}`}
                        </span>
                      </li>
                    );
                  })}
              </ol>
            </section>

            <Link href="/profile/history" className="btn btn-secondary mt-6 w-full">
              ← Back to history
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
