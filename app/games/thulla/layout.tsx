import type { Metadata } from "next";

/**
 * Thulla's own section title. The pages themselves are client components and
 * can't export metadata, so it lives here — and it means the tab says
 * "Thulla — Desi Card Games" rather than the platform name alone.
 */
export const metadata: Metadata = {
  title: "Thulla",
  description:
    "Thulla online — follow the suit, dodge the pile. Against the computer or with friends, 2 to 8 players.",
};

export default function ThullaLayout({
  children,
}: LayoutProps<"/games/thulla">) {
  return children;
}
