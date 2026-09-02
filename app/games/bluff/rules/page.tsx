"use client";

import Link from "next/link";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { PlayingCard } from "@/components/PlayingCard";

function Step({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="font-display text-lg font-bold text-cream-50">
        <span aria-hidden>{icon}</span> {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-cream-100/90">{children}</div>
    </section>
  );
}

function Hand({ cards, caption }: { cards: string[]; caption?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <div className="flex items-end justify-center gap-2">
        {cards.map((c, i) => (
          <PlayingCard key={`${c}-${i}`} card={c} />
        ))}
      </div>
      {caption && <span className="text-[0.65rem] text-cream-400">{caption}</span>}
    </div>
  );
}

export default function BluffRulesPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-12 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Bluff", href: "/games/bluff" },
            { label: "How to Play" },
          ]}
        />
        <h1 className="font-display text-2xl font-bold text-cream-50">How to Play Bluff</h1>
        <p className="text-sm text-cream-400">
          Get rid of all your cards. You&apos;re allowed to lie — you&apos;re just not allowed to
          get caught.
        </p>

        <Step icon="🎯" title="The Goal">
          <p>
            Be the first to get rid of every card in your hand. Whoever is left holding cards at
            the end comes last.
          </p>
        </Step>

        <Step icon="🃏" title="Play face down">
          <p>
            On your turn, pick one or more cards and play them into the middle{" "}
            <strong>face down</strong>. Nobody sees what they are.
          </p>
        </Step>

        <Step icon="🗣️" title="Say what they are">
          <p>
            As you play them, you announce a rank — &ldquo;<strong>3 Kings</strong>&rdquo;. That
            claim is public. The cards are not.
          </p>
          <Hand cards={["KS", "KH", "KC"]} caption="…is what you said" />
        </Step>

        <Step icon="😈" title="You may lie">
          <p>
            The game never checks your claim as you make it. You can say &ldquo;3 Kings&rdquo; and
            play whatever you like — which is how you shed a lot of cards at once.
          </p>
          <Hand cards={["7S", "KH", "3D"]} caption="…is what you actually played" />
        </Step>

        <Step icon="🚨" title="The next player calls it — nobody else">
          <p>
            One play, one chance to challenge it, and it belongs to{" "}
            <strong>the next player round</strong>. They either shout{" "}
            <strong className="text-chili-400">BLUFF!</strong> or{" "}
            <strong>PASS</strong>.
          </p>
          <p>
            Pass and the claim is accepted for good — nobody further round can come back to it
            later. Then you simply take your own turn.
          </p>
          <p className="text-cream-400">
            Hamza claims 3 Kings → Ali is next → Ali passes → Hamza&apos;s play is settled, and
            Ahmed can never challenge it.
          </p>
        </Step>

        <Step icon="🔍" title="The reveal">
          <p>The challenged cards are turned face up, and one of two things happens.</p>
        </Step>

        <Step icon="😂" title="Caught">
          <p>
            If the claim was false — <strong>Bluff pakra gaya!</strong> — the liar picks up the
            entire pile.
          </p>
        </Step>

        <Step icon="😭" title="Wrong call">
          <p>
            If the claim was true — <strong>Oho! Sach bol raha tha</strong> — whoever called it
            picks up the pile instead. So don&apos;t call every hand.
          </p>
        </Step>

        <Step icon="🏆" title="Winning">
          <p>
            Play your last card and survive the challenge on it, and you&apos;re out — safe, and
            first. If someone calls your last play and catches you, the pile comes back and
            you&apos;re very much still playing.
          </p>
        </Step>

        <Step icon="🃏🃏🃏" title="One, two or three decks">
          <p>
            Whoever sets up the game picks the deck count: <strong>1 deck</strong> is 52 cards,{" "}
            <strong>2 decks</strong> is 104, <strong>3 decks</strong> is 156. More decks means more
            copies of every rank — so a claim of four Kings stops being impossible, and calling
            bluffs gets much harder.
          </p>
        </Step>

        <Link href="/games/bluff/play?mode=cpu" className="btn btn-primary !min-h-14 w-full text-base">
          🎮 Chalo, try it out
        </Link>
      </div>
    </main>
  );
}
