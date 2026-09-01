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
  title: "Bhabhi — The Desi Card Game",
  description:
    "Play Bhabhi (Thulla) online — against the computer or with friends anywhere. 2 to 8 players, free.",
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
