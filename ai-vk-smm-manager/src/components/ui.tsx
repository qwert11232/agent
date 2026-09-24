import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* ---------- Panel ---------- */
export function Panel({
  title,
  icon: Icon,
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <div className="panel-header">
          <span className="dot" />
          {Icon ? <Icon size={13} strokeWidth={2.5} /> : null}
          <span className="truncate">{title}</span>
          {right ? <span className="ml-auto flex items-center gap-2">{right}</span> : null}
        </div>
      ) : null}
      <div className={`p-4 md:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* ---------- Badge ---------- */
const BADGE_TONES: Record<string, string> = {
  neon: "bg-[#34d576] text-[#05340f]",
  pink: "bg-[#f983c0] text-[#54062f]",
  yellow: "bg-[#fbcb45] text-[#4a3000]",
  cyan: "bg-[#56cdee] text-[#05384a]",
  red: "bg-[#fa7a7a] text-[#530a0a]",
  violet: "bg-[#b9a6ff] text-[#26136b]",
  ghost: "bg-panel3 text-muted",
};

export function Badge({
  tone = "ghost",
  children,
  led,
}: {
  tone?: string;
  children: ReactNode;
  led?: boolean;
}) {
  return (
    <span className={`badge ${BADGE_TONES[tone] ?? BADGE_TONES.ghost}`}>
      {led ? <span className="led blink" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "published") return <Badge tone="neon" led>Опубликован</Badge>;
  if (status === "draft") return <Badge tone="cyan">Черновик</Badge>;
  if (status === "failed") return <Badge tone="red" led>Ошибка</Badge>;
  return <Badge tone="ghost">{status}</Badge>;
}

/* ---------- Stat block ---------- */
const STAT_COLORS: Record<string, string> = {
  neon: "text-neon-dim border-neon",
  pink: "text-pink-deep border-pink",
  yellow: "text-yellow-deep border-yellow",
  cyan: "text-cyan-deep border-cyan",
  violet: "text-violet-deep border-violet",
  red: "text-red-deep border-red",
};

export function StatBlock({
  icon: Icon,
  label,
  value,
  sub,
  color = "cyan",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.cyan;
  const [text, border] = c.split(" ");
  return (
    <div className={`panel border-l-8 ${border} flex items-center gap-3 p-4`}>
      <span className={`shrink-0 ${text}`}>
        <Icon size={26} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[8px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className={`block font-display text-lg leading-6 ${text}`}>{value}</span>
        {sub ? <span className="block truncate text-sm text-muted">{sub}</span> : null}
      </span>
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-[3px] border-dashed border-line px-6 py-10 text-center">
      <Icon size={30} strokeWidth={1.8} className="text-linebright" />
      <p className="font-display text-[10px] uppercase tracking-widest text-muted">{title}</p>
      {sub ? <p className="max-w-sm text-base text-muted">{sub}</p> : null}
    </div>
  );
}

/* ---------- Pixel loader ---------- */
export function PixelLoader({ label = "ЗАГРУЗКА" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1">
        <span className="tdot" />
        <span className="tdot" />
        <span className="tdot" />
      </span>
      <span className="font-display text-[8px] uppercase tracking-widest">{label}</span>
    </span>
  );
}

/* ---------- Format helpers ---------- */
export const fmt = {
  num(n: number) {
    return new Intl.NumberFormat("ru-RU").format(n);
  },
  dateTime(v: string | Date | null | undefined) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
  timeAgo(v: string | Date | null | undefined) {
    if (!v) return "—";
    const d = new Date(v);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "только что";
    if (min < 60) return `${min} мин. назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч. назад`;
    return `${Math.floor(h / 24)} дн. назад`;
  },
};
