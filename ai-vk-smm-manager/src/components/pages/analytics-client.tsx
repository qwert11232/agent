"use client";

import {
  Activity,
  Eye,
  Heart,
  ListOrdered,
  MessageSquare,
  RefreshCw,
  Repeat2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AnalyticsRow, Post } from "@/db/schema";
import { fmt, Panel, PixelLoader, StatBlock } from "@/components/ui";

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

function StepLineChart({ data, color = "#4dff9d" }: { data: { label: string; value: number }[]; color?: string }) {
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
        <line key={g} x1={PAD} x2={W - PAD} y1={H * g} y2={H * g} stroke="#2e3657" strokeWidth="1" strokeDasharray="4 4" />
      ))}
      <path d={area} fill={color} opacity="0.12" />
      <path d={dPath} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="miter" />
      {data.map((d, i) => (
        <rect key={i} x={PAD + i * stepX - 3} y={y(d.value) - 3} width="6" height="6" fill="#0b0e17" stroke={color} strokeWidth="2" />
      ))}
      <text x={PAD} y={H - 1} fontSize="11" fill="#8f97bd" fontFamily="inherit">{data[0].label}</text>
      <text x={W - PAD} y={H - 1} fontSize="11" fill="#8f97bd" textAnchor="end" fontFamily="inherit">{data.at(-1)?.label}</text>
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
        <line key={g} x1={PAD} x2={W - PAD} y1={H * g} y2={H * g} stroke="#2e3657" strokeWidth="1" strokeDasharray="4 4" />
      ))}
      {data.map((d, i) => {
        const h = ((H - PAD * 2 - 16) * d.value) / max;
        return (
          <g key={i}>
            <rect x={PAD + i * bw + 3} y={H - PAD - h} width={Math.max(bw - 6, 2)} height={h} fill="#ff6ad5" />
            <rect x={PAD + i * bw + 3} y={H - PAD - h} width={Math.max(bw - 6, 2)} height="4" fill="#ffd1f0" />
            <text x={PAD + i * bw + bw / 2} y={H - PAD - h - 5} fontSize="10" fill="#e9edff" textAnchor="middle" fontFamily="inherit">
              {d.value > 0 ? d.value : ""}
            </text>
          </g>
        );
      })}
      <text x={PAD} y={H - 1} fontSize="11" fill="#8f97bd" fontFamily="inherit">{data[0].label}</text>
      <text x={W - PAD} y={H - 1} fontSize="11" fill="#8f97bd" textAnchor="end" fontFamily="inherit">{data.at(-1)?.label}</text>
    </svg>
  );
}

export default function AnalyticsClient({
  totals,
  series,
  topPosts,
}: {
  totals: Totals;
  series: AnalyticsRow[];
  topPosts: Post[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/analytics", { method: "POST" });
      router.refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }

  const label = (d: string) => d.slice(5).split("-").reverse().join(".");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm uppercase tracking-widest text-ink">
          <TrendingUp size={16} className="mr-2 inline text-neon" />
          Аналитика группы
        </h2>
        <button onClick={refresh} disabled={refreshing} className="btn btn-sm btn-cyan ml-auto">
          {refreshing ? <PixelLoader label="sync" /> : (
            <>
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Обновить статистику
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatBlock icon={Users} label="Подписчики" value={fmt.num(totals.followers)} sub={`${totals.followersDelta >= 0 ? "+" : ""}${totals.followersDelta}/день`} color="violet" />
        <StatBlock icon={Heart} label="Лайки" value={fmt.num(totals.likes)} color="pink" />
        <StatBlock icon={MessageSquare} label="Комменты" value={fmt.num(totals.comments)} color="cyan" />
        <StatBlock icon={Eye} label="Просмотры" value={fmt.num(totals.views)} color="yellow" />
        <StatBlock icon={Repeat2} label="Репосты" value={fmt.num(totals.reposts)} color="neon" />
        <StatBlock icon={Activity} label="Постов" value={totals.published} sub={`всего: ${totals.posts}`} color="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Подписчики · 14 дней" icon={Users}>
          <StepLineChart
            data={series.map((r) => ({ label: label(r.date), value: r.followers }))}
            color="#8f7bff"
          />
        </Panel>
        <Panel title="Лайки в день · 14 дней" icon={Heart}>
          <BarChart data={series.map((r) => ({ label: label(r.date), value: r.totalLikes }))} />
        </Panel>
      </div>

      <Panel title="Метрики постов" icon={ListOrdered} bodyClassName="overflow-x-auto p-0 md:p-0">
        {topPosts.length === 0 ? (
          <div className="p-5 text-base text-muted">
            Опубликованных постов пока нет — опубликуйте первый, и статистика появится здесь. Автообновление происходит при каждом запросе sync.
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
                  <td className="text-center text-pink">{fmt.num(p.likes)}</td>
                  <td className="text-center text-cyan">{fmt.num(p.comments)}</td>
                  <td className="text-center text-yellow">{fmt.num(p.views)}</td>
                  <td className="text-center text-neon">{fmt.num(p.reposts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
