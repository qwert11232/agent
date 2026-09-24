"use client";

import {
  Activity,
  Eraser,
  Eye,
  Heart,
  ListOrdered,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Repeat2,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AnalyticsRow, Post } from "@/db/schema";
import { Badge, fmt, Panel, PixelLoader, StatBlock } from "@/components/ui";

type Totals = {
  posts: number;
  published: number;
  drafts: number;
  likes: number;
  comments: number;
  views: number;
  reposts: number;
  followers: number;
  followersDelta: number;
};

const W = 640;
const H = 190;
const PAD = 10;

function StepLineChart({
  data,
  color = "#7c5cff",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value));
  const span = Math.max(max - min, 1);
  const stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2 - 14);

  let dPath = `M ${PAD} ${y(data[0].value)}`;
  data.forEach((d, i) => {
    if (i === 0) return;
    const x = PAD + i * stepX;
    dPath += ` H ${x} V ${y(d.value)}`;
  });
  const area = `${dPath} L ${PAD + (data.length - 1) * stepX} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={PAD} x2={W - PAD} y1={H * g} y2={H * g} stroke="#cfd6e6" strokeWidth="1" strokeDasharray="4 4" />
      ))}
      <path d={area} fill={color} opacity="0.14" />
      <path d={dPath} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="miter" />
      {data.map((d, i) => (
        <rect key={i} x={PAD + i * stepX - 3} y={y(d.value) - 3} width="6" height="6" fill="#ffffff" stroke={color} strokeWidth="2" />
      ))}
      <text x={PAD} y={H - 1} fontSize="11" fill="#6b7490" fontFamily="inherit">{data[0].label}</text>
      <text x={W - PAD} y={H - 1} fontSize="11" fill="#6b7490" textAnchor="end" fontFamily="inherit">{data.at(-1)?.label}</text>
      <text x={W - PAD} y={14} fontSize="11" fill={color} textAnchor="end" fontFamily="inherit">max {fmt.num(max)}</text>
    </svg>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = (W - PAD * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={PAD} x2={W - PAD} y1={H * g} y2={H * g} stroke="#cfd6e6" strokeWidth="1" strokeDasharray="4 4" />
      ))}
      {data.map((d, i) => {
        const h = ((H - PAD * 2 - 16) * d.value) / max;
        return (
          <g key={i}>
            <rect x={PAD + i * bw + 3} y={H - PAD - h} width={Math.max(bw - 6, 2)} height={h} fill="#e0479e" />
            <rect x={PAD + i * bw + 3} y={H - PAD - h} width={Math.max(bw - 6, 2)} height="4" fill="#ff9ad0" />
            <text x={PAD + i * bw + bw / 2} y={H - PAD - h - 5} fontSize="10" fill="#3b4258" textAnchor="middle" fontFamily="inherit">
              {d.value > 0 ? d.value : ""}
            </text>
          </g>
        );
      })}
      <text x={PAD} y={H - 1} fontSize="11" fill="#6b7490" fontFamily="inherit">{data[0].label}</text>
      <text x={W - PAD} y={H - 1} fontSize="11" fill="#6b7490" textAnchor="end" fontFamily="inherit">{data.at(-1)?.label}</text>
    </svg>
  );
}

export default function AnalyticsClient({
  connected,
  groupId,
  totals,
  series,
  topPosts,
}: {
  connected: boolean;
  groupId: string;
  totals: Totals;
  series: AnalyticsRow[];
  topPosts: Post[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function resetStats() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3500);
      return;
    }
    setConfirmReset(false);
    setRefreshing(true);
    try {
      await fetch("/api/analytics", { method: "DELETE" });
      router.refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }

  const refresh = async (manual = true) => {
    if (manual) setRefreshing(true);
    try {
      await fetch("/api/analytics", { method: "POST" });
      setSyncedAt(new Date().toLocaleTimeString("ru-RU"));
      router.refresh();
    } finally {
      if (manual) setTimeout(() => setRefreshing(false), 400);
    }
  };

  // Статистика в реальном времени: автообновление раз в минуту.
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => void refresh(false), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const label = (d: string) => d.slice(5).split("-").reverse().join(".");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm uppercase tracking-widest text-ink">
          <TrendingUp size={16} className="mr-2 inline text-neon-dim" />
          Аналитика группы
        </h2>
        {connected ? (
          <Badge tone="neon" led>
            VK LIVE · {groupId}
          </Badge>
        ) : (
          <Badge tone="yellow">Нет подключения к VK</Badge>
        )}
        {syncedAt ? (
          <span className="text-sm text-muted">обновлено в {syncedAt}</span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={resetStats}
            disabled={refreshing}
            className={`btn btn-sm ${confirmReset ? "btn-red" : "btn-ghost"}`}
            title="Очистить историю замеров и обнулить метрики постов"
          >
            <Eraser size={13} /> {confirmReset ? "Точно сбросить?" : "Сбросить данные"}
          </button>
          <button onClick={() => refresh(true)} disabled={refreshing} className="btn btn-sm btn-cyan">
            {refreshing ? <PixelLoader label="sync" /> : (
              <>
                <RefreshCw size={13} /> Обновить статистику
              </>
            )}
          </button>
        </span>
      </div>

      {!connected ? (
        <div className="panel flex flex-wrap items-center gap-4 border-l-8 border-l-yellow p-4">
          <PlugZap size={24} className="text-yellow-deep" />
          <p className="min-w-0 flex-1 text-base leading-6 text-ink">
            <b className="font-display text-[10px] uppercase tracking-widest">Реальные цифры недоступны.</b>
            <br />
            Метрики берутся напрямую из VK API (<span className="text-cyan-deep">wall.getById</span> и{" "}
            <span className="text-cyan-deep">groups.getById</span>). Укажите VK Access Token и Group ID —
            и статистика группы появится здесь в реальном времени. Выдуманные данные мы не показываем.
          </p>
          <Link href="/settings" className="btn btn-sm btn-neon">
            Открыть настройки
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatBlock icon={Users} label="Подписчики" value={fmt.num(totals.followers)} sub={connected ? `${totals.followersDelta >= 0 ? "+" : ""}${totals.followersDelta}/день` : "нет данных VK"} color="violet" />
        <StatBlock icon={Heart} label="Лайки" value={fmt.num(totals.likes)} color="pink" />
        <StatBlock icon={MessageSquare} label="Комменты" value={fmt.num(totals.comments)} color="cyan" />
        <StatBlock icon={Eye} label="Просмотры" value={fmt.num(totals.views)} color="yellow" />
        <StatBlock icon={Repeat2} label="Репосты" value={fmt.num(totals.reposts)} color="neon" />
        <StatBlock icon={Activity} label="Постов" value={totals.published} sub={`всего: ${totals.posts}`} color="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Подписчики · история замеров" icon={Users}>
          {series.length > 1 ? (
            <StepLineChart data={series.map((r) => ({ label: label(r.date), value: r.followers }))} />
          ) : (
            <p className="py-10 text-center text-base text-muted">
              История копится по одному замеру в день.
              {connected ? " Первая точка уже записана — график появится завтра." : " Подключите VK для сбора данных."}
            </p>
          )}
        </Panel>
        <Panel title="Лайки по дням" icon={Heart}>
          {series.length ? (
            <BarChart data={series.map((r) => ({ label: label(r.date), value: r.totalLikes }))} />
          ) : (
            <p className="py-10 text-center text-base text-muted">Пока нет замеров.</p>
          )}
        </Panel>
      </div>

      <Panel title="Метрики постов · VK wall.getById" icon={ListOrdered} bodyClassName="overflow-x-auto p-0 md:p-0">
        {topPosts.length === 0 ? (
          <div className="p-5 text-base text-muted">
            Опубликованных постов пока нет. Опубликуйте первый — и метрики подтянутся из VK.
          </div>
        ) : (
          <table className="pxtable w-full min-w-[720px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Текст</th>
                <th>Дата</th>
                <th className="text-center">Лайки</th>
                <th className="text-center">Комм.</th>
                <th className="text-center">Просмотры</th>
                <th className="text-center">Репосты</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.map((p) => (
                <tr key={p.id}>
                  <td className="text-muted">#{p.id}</td>
                  <td className="max-w-[340px]">
                    <span className="line-clamp-1 text-ink">{p.text}</span>
                    <span className="text-sm text-muted">vk id: {p.vkPostId}</span>
                  </td>
                  <td className="whitespace-nowrap text-muted">{fmt.dateTime(p.publishedAt)}</td>
                  <td className="text-center text-pink-deep">{fmt.num(p.likes)}</td>
                  <td className="text-center text-cyan-deep">{fmt.num(p.comments)}</td>
                  <td className="text-center text-yellow-deep">{fmt.num(p.views)}</td>
                  <td className="text-center text-neon-dim">{fmt.num(p.reposts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
