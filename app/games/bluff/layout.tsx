import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bluff",
  description:
    "Bluff online — play your cards face down and say what they are. Lying is allowed; getting caught isn't. 2 to 8 players, 1 to 3 decks.",
};

export default function BluffLayout({ children }: LayoutProps<"/games/bluff">) {
  return children;
}
