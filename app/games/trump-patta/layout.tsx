import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trump-Patta",
  description:
    "Trump-Patta online — one card is pulled out before the deal, pairs are thrown away, and whoever is left holding its partner is the Thief. 2 to 8 players.",
};

export default function TrumpPattaLayout({ children }: LayoutProps<"/games/trump-patta">) {
  return children;
}
