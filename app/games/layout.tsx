import type { Metadata } from "next";

export const metadata: Metadata = {
  // `default` titles this segment and still runs through the root template,
  // so it must not carry the suffix itself. `template` is re-declared because
  // a plain string here would end the chain and leave a game's tab reading
  // just its own name.
  title: {
    default: "Games",
    template: "%s — Desi Card Games",
  },
  description: "Every game on Desi Card Games — Thulla now, more on the way.",
};

export default function GamesLayout({ children }: LayoutProps<"/games">) {
  return children;
}
