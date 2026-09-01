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
      <body className="flex min-h-full flex-col">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
