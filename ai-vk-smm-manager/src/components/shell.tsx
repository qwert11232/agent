"use client";

import {
  BarChart3,
  Bot,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  Power,
  Settings as SettingsIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/chat", label: "Чат с ботом", icon: MessagesSquare },
  { href: "/posts", label: "Посты", icon: FileText },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: SettingsIcon },
];

const TICKER = [
  "AI SMM-AGENT ЗАГРУЖЕН",
  "VK API MODULE READY",
  "GPT GENERATOR ONLINE",
  "POSTGRESQL: CONNECTED",
  "SCHEDULER: APSTABLE",
  "WALL.POST DRIVER v5.199",
  "АНАЛИТИКА ОБНОВЛЯЕТСЯ КАЖДЫЙ ЧАС",
  "INSERT COIN TO CONTINUE",
];

function Clock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const t = () =>
      setNow(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{now}</span>;
}

/** Глобальный автопилот: любая открытая страница панели тикает планировщик. */
function AutopilotPoller() {
  const router = useRouter();
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/tick", { method: "POST" });
        const data = (await res.json()) as { ran?: boolean };
        if (data.ran) router.refresh();
      } catch {
        /* offline? retry next tick */
      }
    };
    const id = setInterval(run, 30_000);
    const first = setTimeout(run, 5_000);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [router]);
  return null;
}

export function Shell({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = NAV.find((n) => pathname.startsWith(n.href));

  return (
    <div className="relative z-10 flex h-dvh flex-col md:flex-row">
      <AutopilotPoller />
      {/* ============ SIDEBAR ============ */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-[3px] border-line bg-panel md:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 border-b-[3px] border-line p-4 transition-colors hover:bg-panel2"
        >
          <span className="relative block h-12 w-12 shrink-0 overflow-hidden border-[3px] border-linebright bg-bg">
            <Image
              src="/img/bot-avatar.png"
              alt="BOT-9000"
              fill
              sizes="48px"
              className="pixelated object-cover glow-pulse"
            />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[11px] leading-4 text-ink">
              BOT-9000
            </span>
            <span className="block text-sm text-muted">AI SMM AGENT v1.0</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 border-[3px] px-3 py-2.5 font-display text-[9px] uppercase tracking-wider transition-all ${
                  isActive
                    ? "border-ink bg-[#34d576] text-[#05340f] shadow-[4px_4px_0_0_var(--color-ink)]"
                    : "border-transparent text-muted hover:border-line hover:bg-panel2 hover:text-ink"
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={2.4}
                  className={isActive ? "" : "text-linebright group-hover:text-neon-dim"}
                />
                {item.label}
                {isActive && <span className="ml-auto blink">▮</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <div className="panel p-3">
            <div className="mb-2 flex items-center gap-2 font-display text-[8px] uppercase tracking-widest text-muted">
              <Power size={12} /> System
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 blink ${
                  active ? "bg-neon shadow-[0_0_8px_#4dff9d]" : "bg-red shadow-[0_0_8px_#ff5c6a]"
                }`}
              />
              <span
                className={`font-display text-[9px] uppercase ${
                  active ? "text-neon-dim" : "text-red-deep"
                }`}
              >
                {active ? "Active" : "Standby"}
              </span>
            </div>
            <div className="mt-2 h-2 w-full border-2 border-line bg-bg">
              <div
                className={`h-full ${active ? "bg-neon" : "bg-red"}`}
                style={{ width: active ? "96%" : "12%" }}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* ============ MAIN COLUMN ============ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b-[3px] border-line bg-panel px-4 py-3">
          <span className="font-display text-[10px] uppercase tracking-widest text-neon-dim">
            {"//"}
          </span>
          <h1 className="font-display text-[10px] uppercase tracking-widest text-ink">
            {current?.label ?? "Панель"}
          </h1>

          <div className="mx-4 hidden min-w-0 flex-1 overflow-hidden lg:block">
            <div className="marquee-track font-display text-[8px] uppercase tracking-widest text-muted">
              {[...TICKER, ...TICKER].map((t, i) => (
                <span key={i} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-cyan-deep">▸</span> {t}
                </span>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 border-[3px] border-line bg-bg px-3 py-1.5 font-display text-[9px] text-cyan-deep sm:flex">
              <Clock />
            </span>
            <span
              className={`badge ${active ? "bg-[#34d576] text-[#05340f]" : "bg-[#fa7a7a] text-[#530a0a]"}`}
            >
              <span className="led" />
              {active ? "Online" : "Paused"}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </main>

        <footer className="hidden items-center gap-4 border-t-[3px] border-line bg-panel px-4 py-2 font-display text-[8px] uppercase tracking-widest text-muted md:flex">
          <span className="flex items-center gap-2">
            <Bot size={12} className="text-neon-dim" /> BOT-9000 core v1.0
          </span>
          <span>mem: 64k ok</span>
          <span className="hidden xl:inline">db: postgres/online</span>
          <span className="ml-auto">F1 — помощь · F5 — обновить статы</span>
        </footer>
      </div>

      {/* ============ MOBILE NAV ============ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t-[3px] border-line bg-panel md:hidden">
        {NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 ${
                isActive ? "bg-panel3 text-neon-dim" : "text-muted"
              }`}
            >
              <Icon size={18} strokeWidth={2.4} />
              <span className="font-display text-[7px] uppercase">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
