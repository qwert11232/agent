"use client";

import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Heart,
  Info,
  MessagesSquare,
  Rocket,
  Send,
  Sparkles,
  TerminalSquare,
  Users,
  Wand2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ActivityEntry, Post, Settings } from "@/db/schema";
import { Badge, EmptyState, fmt, Panel, StatBlock, StatusBadge } from "@/components/ui";

type Totals = {
  posts: number;
  published: number;
  drafts: number;
  failed: number;
  likes: number;
  comments: number;
  views: number;
  followers: number;
  followersDelta: number;
};

function nextSlot(schedule: string): { at: Date; raw: string } | null {
  const slots = schedule
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!slots.length) return null;
  const now = new Date();
  for (const raw of slots) {
    const [h, m] = raw.split(":").map(Number);
    const at = new Date(now);
    at.setHours(h || 0, m || 0, 0, 0);
    if (at > now) return { at, raw };
  }
  const [h, m] = slots[0].split(":").map(Number);
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(h || 0, m || 0, 0, 0);
  return { at, raw: slots[0] };
}

function Countdown({ schedule }: { schedule: string }) {
  const [label, setLabel] = useState("--:--:--");
  const slot = useMemo(() => nextSlot(schedule), [schedule]);
  useEffect(() => {
    const t = () => {
      const s = nextSlot(schedule);
      if (!s) return setLabel("—");
      const diff = Math.max(0, s.at.getTime() - Date.now());
      const hh = Math.floor(diff / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      setLabel(
        `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
      );
    };
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, [schedule]);
  return (
    <span>
      <span className="block font-display text-2xl leading-8 text-cyan tabular-nums">
        {label}
      </span>
      <span className="text-base text-muted">
        {slot ? `слот ${slot.raw}` : "нет слотов"}
      </span>
    </span>
  );
}

export default function DashboardClient({
  settings,
  totals,
  recentPosts,
  activity,
}: {
  settings: Settings;
  totals: Totals;
  recentPosts: Post[];
  activity: ActivityEntry[];
}) {
  const router = useRouter();
  const [active, setActive] = useState(settings.active);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busyGen, setBusyGen] = useState(false);

  // Тик автопостинга каждые 45 секунд — заменяет cron в serverless-среде.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/tick", { method: "POST" });
        const data = (await res.json()) as { ran?: boolean };
        if (data.ran) router.refresh();
      } catch {
        /* ignore */
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [router]);

  async function toggle() {
    setBusyToggle(true);
    try {
      const res = await fetch("/api/toggle", { method: "POST" });
      const data = (await res.json()) as { settings: Settings };
      setActive(data.settings.active);
      router.refresh();
    } finally {
      setBusyToggle(false);
    }
  }

  async function generateAndGo() {
    setBusyGen(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      router.push("/posts");
    } finally {
      setBusyGen(false);
    }
  }

  const slots = settings.scheduleTimes.split(",").map((t) => t.trim());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ============ HERO ============ */}
      <div className="panel panel-bright relative overflow-hidden">
        <div className="absolute right-0 top-0 hidden h-full w-1/2 opacity-25 md:block">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,transparent_0_10px,rgba(92,225,255,0.25)_10px_11px)]" />
        </div>
        <div className="relative flex flex-col gap-6 p-5 md:flex-row md:items-center md:p-7">
          <div className="floaty relative h-28 w-28 shrink-0 overflow-hidden border-[3px] border-linebright bg-bg md:h-36 md:w-36">
            <Image
              src="/img/bot-avatar.png"
              alt="BOT-9000"
              fill
              sizes="144px"
              className="pixelated object-cover glow-pulse"
              priority
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-1 font-display text-[8px] uppercase tracking-widest text-muted">
              AI SMM AGENT · VK GROUP {settings.groupId || "#NO-GROUP"}
            </p>
            <h2
              className={`font-display text-xl leading-8 md:text-2xl md:leading-9 ${
                active ? "text-neon" : "text-red"
              }`}
            >
              {active ? "БОТ АКТИВЕН" : "БОТ НА ПАУЗЕ"}
              <span className="blink">_</span>
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="violet">тон: {settings.tone}</Badge>
              {slots.map((t) => (
                <Badge key={t} tone="ghost">
                  <Clock3 size={10} /> {t}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t-[3px] border-line pt-4 md:w-56 md:border-l-[3px] md:border-t-0 md:pl-5 md:pt-0">
            <div>
              <p className="mb-1 font-display text-[8px] uppercase tracking-widest text-muted">
                До поста осталось
              </p>
              <Countdown schedule={settings.scheduleTimes} />
            </div>
            <button
              onClick={toggle}
              disabled={busyToggle}
              className={`btn ${active ? "btn-red" : "btn-neon"}`}
            >
              {active ? "Остановить" : "Запустить"}
            </button>
            <div className="flex items-center gap-3">
              <div
                className="pxtoggle"
                data-on={active}
                onClick={busyToggle ? undefined : toggle}
                role="switch"
                aria-checked={active}
              />
              <span className="font-display text-[8px] uppercase text-muted">
                автопилот
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============ STATS ============ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatBlock icon={FileText} label="Постов" value={totals.posts} sub={`черновиков: ${totals.drafts}`} color="cyan" />
        <StatBlock icon={Send} label="Опубликовано" value={totals.published} sub={totals.failed ? `ошибок: ${totals.failed}` : "без ошибок"} color="neon" />
        <StatBlock icon={Heart} label="Лайки" value={fmt.num(totals.likes)} sub="суммарно по постам" color="pink" />
        <StatBlock icon={Eye} label="Просмотры" value={fmt.num(totals.views)} sub={`${fmt.num(totals.comments)} комментариев`} color="yellow" />
        <StatBlock
          icon={Users}
          label="Подписчики"
          value={fmt.num(totals.followers)}
          sub={`${totals.followersDelta >= 0 ? "+" : ""}${totals.followersDelta} за день`}
          color="violet"
        />
      </div>

      {/* ============ QUICK ACTIONS ============ */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Быстрые действия" icon={Rocket} className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            <button onClick={generateAndGo} disabled={busyGen} className="btn btn-neon w-full">
              <Wand2 size={14} />
              {busyGen ? "Генерация…" : "Сгенерировать пост"}
            </button>
            <Link href="/chat" className="btn btn-cyan w-full">
              <MessagesSquare size={14} /> Открыть чат с ботом
            </Link>
            <Link href="/analytics" className="btn btn-ghost w-full">
              <Activity size={14} /> Обновить аналитику
            </Link>
            <div className="mt-1 border-[3px] border-line bg-bg p-3 text-base leading-6 text-muted">
              <TerminalSquare size={13} className="mr-2 inline text-neon" />
              Автопостинг: по наступлении слота бот берёт готовый черновик или
              генерирует новый и публикует через <span className="text-cyan">wall.post</span>.
            </div>
          </div>
        </Panel>

        {/* ============ ACTIVITY ============ */}
        <Panel
          title="Журнал активности"
          icon={Activity}
          className="lg:col-span-3"
          bodyClassName="max-h-[420px] overflow-y-auto"
          right={<Link href="/analytics" className="text-muted hover:text-neon"><CalendarClock size={13} /></Link>}
        >
          {activity.length === 0 ? (
            <EmptyState icon={Info} title="Журнал пуст" sub="Действия бота будут фиксироваться здесь (последние 100 записей)." />
          ) : (
            <ul className="flex flex-col">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 border-b-2 border-line/50 py-2.5 last:border-0"
                >
                  <span className="mt-0.5 shrink-0">
                    {a.status === "error" ? (
                      <AlertTriangle size={15} className="text-red" />
                    ) : a.status === "info" ? (
                      <Info size={15} className="text-cyan" />
                    ) : (
                      <CheckCircle2 size={15} className="text-neon" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[9px] uppercase tracking-wider text-ink">
                      {a.action}
                    </span>
                    <span className="block truncate text-base text-muted">{a.details}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">
                    {fmt.timeAgo(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ============ RECENT POSTS ============ */}
      <Panel
        title="Последние посты"
        icon={FileText}
        right={
          <Link
            href="/posts"
            className="font-display text-[8px] uppercase tracking-widest text-neon hover:text-ink"
          >
            Все посты →
          </Link>
        }
      >
        {recentPosts.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Постов пока нет"
            sub="Нажмите «Сгенерировать пост» — бот создаст первый черновик."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentPosts.map((p) => (
              <Link
                key={p.id}
                href="/posts"
                className="group border-[3px] border-line bg-panel2 p-4 transition-colors hover:border-neon"
              >
                <div className="mb-2 flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <span className="text-sm text-muted">#{p.id}</span>
                  <span className="ml-auto text-sm text-muted">
                    {p.status === "published" ? fmt.dateTime(p.publishedAt) : fmt.timeAgo(p.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-base leading-6 text-ink">
                  {p.text}
                </p>
                {p.status === "published" ? (
                  <div className="mt-2 flex gap-4 text-sm text-muted">
                    <span className="flex items-center gap-1"><Heart size={12} className="text-pink" /> {p.likes}</span>
                    <span className="flex items-center gap-1"><Eye size={12} className="text-yellow" /> {p.views}</span>
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
