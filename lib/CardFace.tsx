import { Card, rankOf, suitOf, suitSymbol } from "./types";

export function CardFace({ card, small }: { card: Card; small?: boolean }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const red = suit === "H" || suit === "D";
  return (
    <div
      className={`${small ? "w-10 h-14 text-sm" : "w-14 h-20 text-lg"} rounded-lg bg-white border border-slate-300 shadow flex flex-col items-center justify-center font-bold ${
        red ? "text-red-600" : "text-slate-900"
      }`}
    >
      <span>{rank === "T" ? "10" : rank}</span>
      <span>{suitSymbol(suit)}</span>
    </div>
  );
}

export function CardBack({ small }: { small?: boolean }) {
  return (
    <div
      className={`${small ? "w-10 h-14" : "w-14 h-20"} rounded-lg bg-emerald-700 border border-emerald-900 shadow`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 8px)",
      }}
    />
  );
}
