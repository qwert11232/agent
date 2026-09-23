import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Pixelify_Sans, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import {
  getSettings,
  seedAnalyticsIfEmpty,
  seedWelcomeChatIfEmpty,
} from "@/lib/core";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-press-start",
});

const pixelify = Pixelify_Sans({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-pixelify",
});

export const metadata: Metadata = {
  title: "BOT-9000 // AI SMM Панель",
  description:
    "Пиксельная панель управления AI SMM-ботом ВКонтакте: генерация постов, автопостинг, аналитика и чат.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = await getSettings();
  await seedAnalyticsIfEmpty();
  await seedWelcomeChatIfEmpty();

  return (
    <html lang="ru">
      <body className={`${pressStart.variable} ${pixelify.variable}`}>
        <div className="crt-flicker" aria-hidden />
        <div className="vignette" aria-hidden />
        <div className="scanlines" aria-hidden />
        <Shell active={s.active}>{children}</Shell>
      </body>
    </html>
  );
}
