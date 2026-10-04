import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export type HubTab = { id: string; label: string; icon: LucideIcon };

/** Горизонтальная панель вкладок внутри разделов (Контент, Аудитория, Аналитика). */
export function HubBar({ base, active, tabs }: { base: string; active: string; tabs: HubTab[] }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id || (t.id === tabs[0].id && !tabs.some((x) => x.id === active));
        return (
          <Link
            key={t.id}
            href={`${base}?tab=${t.id}`}
            scroll={false}
            className={`btn btn-sm ${isActive ? "btn-neon" : "btn-ghost"}`}
          >
            <Icon size={13} /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
