"use client";

import Link from "next/link";
import { PlatformNav, Breadcrumbs } from "@/components/PlatformNav";
import { PlayingCard } from "@/components/PlayingCard";
import { NumberedCard } from "@/components/trumpPatta/TrumpPattaPieces";

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

/** A fan held out to the next player: positions, no faces. */
function FaceDownRow({ count, caption }: { count: number; caption?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div className="flex flex-wrap items-end justify-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <NumberedCard key={i} position={i + 1} faceDown />
        ))}
      </div>
      {caption && <span className="text-center text-[0.7rem] text-cream-400">{caption}</span>}
    </div>
  );
}

/** A row of numbered cards, the way they appear in a hand. */
function Row({ cards, caption }: { cards: string[]; caption?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div className="flex flex-wrap items-end justify-center gap-2">
        {cards.map((c, i) => (
          <NumberedCard key={`${c}-${i}`} card={c} position={i + 1} />
        ))}
      </div>
      {caption && <span className="text-center text-[0.7rem] text-cream-400">{caption}</span>}
    </div>
  );
}

export default function TrumpPattaRulesPage() {
  return (
    <main className="felt flex min-h-dvh flex-col">
      <PlatformNav />

      <div className="relative z-10 mx-auto w-full max-w-lg flex-1 px-4 pb-12 pt-4">
        <Breadcrumbs
          trail={[
            { label: "Games", href: "/games" },
            { label: "Trump-Patta", href: "/games/trump-patta" },
            { label: "How to Play" },
          ]}
        />

        <h1 className="font-display text-2xl font-bold text-cream-50">
          <span aria-hidden>🥷 </span>How to play Trump-Patta
        </h1>
        <p className="mt-1 text-sm text-cream-400">
          Everybody throws away pairs. One card can never be paired. Pick blind from the hand next
          to you, and don&apos;t be the one left holding it.
        </p>

        <div className="mt-5 space-y-3">
          <Step icon="🎴" title="One card goes missing">
            <p>
              A normal 52-card deck is shuffled, and then one card is taken out and hidden before
              anything is dealt. Nobody sees it — not even the player who ends up losing because of
              it.
            </p>
            <p>
              That leaves <strong>51 cards</strong>, which are dealt round the table. 51 doesn&apos;t
              divide evenly by much, so some players get one card more than others. That&apos;s
              normal, and the deal starts from a different seat each game so it isn&apos;t always the
              same people.
            </p>
            <div className="flex items-center justify-center gap-3 py-1">
              <div className="flex flex-col items-center gap-1">
                <span className="card-shell card-back block" aria-hidden />
                <span className="text-[0.7rem] text-cream-400">Hidden</span>
              </div>
              <span className="text-2xl text-cream-500" aria-hidden>+</span>
              <div className="flex flex-col items-center gap-1">
                <span className="tabular font-display text-2xl font-bold text-cream-100">51</span>
                <span className="text-[0.7rem] text-cream-400">Dealt</span>
              </div>
            </div>
          </Step>

          <Step icon="👯" title="Throw away every pair">
            <p>
              Two cards of the <strong>same rank</strong> are a pair. Suits don&apos;t matter at all
              — 7♠ and 7♥ is a pair just as much as 7♠ and 7♣.
            </p>
            <Row cards={["7S", "7H"]} caption="A pair — both cards leave your hand" />
            <p>
              As soon as you&apos;re dealt, every pair in your hand goes. It keeps happening all game:
              the moment a card you take makes a pair, both cards go straight out.
            </p>
            <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-cream-300">
              Discarded pairs are <strong>public</strong>. Everyone can see every pair that has left
              the game — which is how you work out, late on, which rank the hidden card belongs to.
            </p>
          </Step>

          <Step icon="🫱" title="Hold your hand out, face-down">
            <p>
              On your turn you fan your cards out to the player on your left —{" "}
              <strong>face-down</strong>. They can see how many you have and where each one sits,
              and nothing else. Nor can anyone else at the table.
            </p>
            <p>
              They pick one, by position. They don&apos;t know what they&apos;re taking and you
              don&apos;t get a say in which.
            </p>
            <FaceDownRow count={4} caption="What the next player sees — positions, not cards" />
          </Step>

          <Step icon="✋" title="You choose the order">
            <p>
              Your hand is yours to arrange. Drag your cards, or tap one and then tap where it should
              go. Nothing ever re-sorts them — not the deal, not taking a card, not a pair leaving,
              not refreshing the page.
            </p>
            <p>
              This is the only real decision in the game. The next player is choosing a position out
              of a fan they can&apos;t see, so where you put the card you&apos;re desperate to lose —
              and where you put the ones you want to keep — is the whole of your play. They
              can&apos;t rearrange your hand; they can only pick from it.
            </p>
          </Step>

          <Step icon="🔄" title="Then it's their turn to show">
            <p>
              Whoever just picked becomes the one showing their hand to the player after them. Round
              and round it goes.
            </p>
            <p>
              Run out of cards and you&apos;re <strong>safe</strong> — out of the game, and nobody
              can hand you anything back.
            </p>
          </Step>

          <Step icon="🥷" title="The last card decides it">
            <p>
              Every card pairs up eventually, except one — the partner of the card taken out at the
              start. When it&apos;s the only card left in the game, whoever is holding it is the{" "}
              <strong>Thief</strong>.
            </p>
            <div className="flex items-end justify-center gap-4 py-1">
              <div className="flex flex-col items-center gap-1">
                <PlayingCard card="KH" />
                <span className="text-[0.7rem] text-cream-400">Left holding</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PlayingCard card="KS" />
                <span className="text-[0.7rem] text-cream-400">Hidden all game</span>
              </div>
            </div>
            <p className="text-center text-xs text-cream-400">
              Same rank, so they would have paired — if the K♠ had ever been dealt.
            </p>
          </Step>

          <Step icon="🏆" title="Best-of series">
            <p>
              A single game, or best of 3, 5, 7 — or any odd number you like up to 99. Everyone who
              gets out is placed in the order they managed it, and whoever got out first takes the
              game.
            </p>
            <p>
              First to <strong>floor(games ÷ 2) + 1</strong> wins takes the series, and it stops the
              moment that&apos;s reached — a 3–0 in a best of 5 doesn&apos;t play games 4 and 5. Only
              odd numbers, so a series can never finish level.
            </p>
          </Step>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/games/trump-patta" className="btn btn-secondary flex-1">
            ← Back
          </Link>
          <Link href="/games/trump-patta/play?mode=cpu" className="btn btn-primary flex-1">
            🥷 Play Trump-Patta
          </Link>
        </div>
      </div>
    </main>
  );
}
