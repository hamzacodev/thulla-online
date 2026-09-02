import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "@/lib/settings";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  // The site is the platform; a game titles its own pages.
  title: {
    default: "Desi Card Games",
    template: "%s — Desi Card Games",
  },
  description:
    "A modern collection of classic Pakistani card games. Play the computer on your own, or deal your friends in from anywhere. Free.",
};

export const viewport: Viewport = {
  themeColor: "#0a3228",
  // The game is a single fixed screen; letting it zoom just breaks the layout.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      {/*
        Browser extensions get at <body> before React hydrates — ColorZilla
        adds cz-shortcut-listen, Grammarly adds data-gr-*, and there are
        plenty more. React then finds a body that doesn't match what it
        rendered and throws a hydration error at a visitor who has done
        nothing wrong and cannot be asked to uninstall anything.

        This suppresses the warning for <body>'s own attributes only. It
        does not cascade, so a genuine hydration mismatch anywhere inside
        the app still surfaces normally.
      */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
