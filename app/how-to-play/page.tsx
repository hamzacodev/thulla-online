"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card } from "@/lib/engine/cards";

function Mini({ cards, labels }: { cards: Card[]; labels?: string[] }) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-2 py-1">
      {cards.map((c, i) => (
        <div key={`${c}-${i}`} className="flex flex-col items-center gap-1">
          <PlayingCard card={c} />
          {labels?.[i] && <span className="text-[0.65rem] text-cream-400">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function Step({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="font-display text-lg font-bold text-cream-50">
        <span aria-hidden>{icon}</span> {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-cream-100/90">{children}</div>
    </section>
  );
}

export default function HowToPlayPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="How to Play" />

      <div className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-12 pt-4">
        <p className="text-center text-sm text-cream-400">
          Thulla (also called Thulla) — the last player still holding cards loses. Simple as that.
        </p>

        <Step icon="🃏" title="The Goal">
          <p>
            Get rid of all your cards. Everyone who empties their hand is <strong>safe</strong>. The
            one player left holding cards at the end becomes the <strong>Thulla</strong> 😂
          </p>
        </Step>

        <Step icon="👥" title="Players">
          <p>
            2 to 8 players, one standard 52-card deck, all of it dealt out. With counts that don&apos;t
            divide evenly, some hands get one extra card — same as dealing round a real table.
          </p>
        </Step>

        <Step icon="🂡" title="Starting the Game">
          <p>Whoever is dealt the Ace of Spades starts, and must lead it.</p>
          <Mini cards={["AS"]} labels={["Leads the first trick"]} />
          <p className="text-xs text-cream-400">
            That&apos;s a real rule, not a coin flip — the game finds the Ace and gives that player
            the lead.
          </p>
        </Step>

        <Step icon="♠️" title="Follow the Suit">
          <p>
            You <strong>must</strong> play the suit that was led if you have it. Play continues
            round the table.
          </p>
          <Mini cards={["7H", "TH", "QH"]} labels={["led", "follows", "follows"]} />
          <p>
            Highest card of the led suit takes the trick. Those cards are thrown away for good, and
            the winner leads next.
          </p>
        </Step>

        <Step icon="🆓" title="The First Trick Is Free">
          <p>
            The opening Ace of Spades round is a <strong>free round</strong>. If you have no
            spades there, throw anything you like — it&apos;s not a thulla and nobody picks
            anything up. Play just carries on and the highest spade takes the trick.
          </p>
          <p className="text-xs text-cream-400">Pehli baari maaf hai 😄</p>
        </Step>

        <Step icon="🎴" title="No Cards of That Suit? (Thulla)">
          <p>
            After the first round, if you can&apos;t follow suit, throw <em>any</em> card. The
            trick stops right there —
            and whoever played the <strong>highest card of the led suit</strong> has to pick up the
            whole pile.
          </p>
          <Mini cards={["7H", "QH", "2C"]} labels={["led", "highest 😬", "can't follow"]} />
          <p className="rounded-lg bg-chili-500/10 px-3 py-2 text-xs text-chili-400 ring-1 ring-chili-400/25">
            The player holding the Queen picks up all three cards — not the one who threw the club.
            That&apos;s the whole game right there: winning a trick is good, being the highest when
            somebody runs out is bad.
          </p>
        </Step>

        <Step icon="😂" title="Becoming Thulla">
          <p>
            Empty your hand and you&apos;re out safe. Play continues without you. When only one
            player still has cards, they&apos;re the Thulla — and everyone gets to enjoy it.
          </p>
          <p className="text-xs text-cream-400">Ohooo! Thulla ban gaya 😄</p>
        </Step>

        <Step icon="💡" title="A Bit of Strategy">
          <p>
            Throwing low cards keeps you out of trouble. Dumping your high cards when you can&apos;t
            follow suit is the best moment you&apos;ll get. Watch who runs out of a suit — they&apos;re
            the danger.
          </p>
        </Step>

        <Link href="/play?mode=cpu" className="btn btn-primary !min-h-14 w-full text-base">
          🎮 Chalo, try it out
        </Link>
      </div>
    </main>
  );
}
