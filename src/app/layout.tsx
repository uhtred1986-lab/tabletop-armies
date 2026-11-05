import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/i18n/server";
import { LocaleProvider } from "@/i18n/client";
import { currentGame } from "@/lib/current-game";
import "@/theme/tokens.css";
import "@/theme/worlds.css";
import "@/theme/base.css";

export const metadata: Metadata = {
  title: "Tabletop Armies",
  description: "Private companion for miniature games",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bangers&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Condensed:wght@400;600&family=Limelight&family=Michroma&family=Saira+Stencil+One&family=Spectral+SC:wght@600&display=swap";

/** The world is chosen on the server from the game cookie, so the first paint is already in the right look. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, game] = await Promise.all([getLocale(), currentGame()]);
  return (
    <html lang={locale} data-world={game.world} data-theme={game.world}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
