"use client";

import {
  Brain,
  CalendarDays,
  Clock3,
  Flame,
  Lightbulb,
  Swords,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { Insights } from "@/lib/insights";
import { Badge, EmptyState, fmt, Panel, StatBlock } from "@/components/ui";

export default function InsightsClient({
  insights,
  plan,
  digest,
  weekStats,
}: {
  insights: Insights;
  plan: { category: string; brief: string; event: string | null };
  digest: string | null;
  weekStats: { posts: number; likes: number; followers: number };
}) {
  const maxCatLikes = Math.max(...insights.categories.map((c) => c.avgLikes), 1);
  const maxHourLikes = Math.max(...insights.hours.map((h) => h.avgLikes), 1);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm uppercase tracking-widest text-ink">
          <Brain size={16} className="mr-2 inline text-violet-deep" />
          Умная аналитика
        </h2>
        <Badge tone={insights.hasData ? "neon" : "yellow"} led={insights.hasData}>
          {insights.hasData ? "Данные собраны" : "Копим статистику"}
        </Badge>
      </div>

      {/* ===== Рубрика дня ===== */}
      <Panel title="Контент-план на сегодня" icon={CalendarDays} className="panel-bright">
        <div className="flex flex-wrap items-center gap-4">
          <span className="border-[3px] border-violet bg-[#f3f0ff] px-4 py-3 font-display text-[11px] uppercase tracking-widest text-violet-deep">
            {plan.category}
          </span>
          <p className="min-w-0 flex-1 text-base leading-6 text-ink">
            {plan.brief}
            {plan.event ? (
              <span className="mt-1 block font-display text-[9px] uppercase tracking-widest text-pink-deep">
                🎉 Сегодня: {plan.event}
              </span>
            ) : null}
          </p>
          <Link href="/posts" className="btn btn-sm btn-neon">
            Сгенерировать
          </Link>
        </div>
      </Panel>

      {/* ===== Средние показатели ===== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock icon={TrendingUp} label="Ср. лайков" value={insights.avgLikes} color="pink" />
        <StatBlock icon={Target} label="Вовлечённость" value={`${insights.engagementRate}%`} sub="лайки+комм / просмотры" color="cyan" />
        <StatBlock icon={Flame} label="Постов за неделю" value={weekStats.posts} sub={`${fmt.num(weekStats.likes)} лайков`} color="yellow" />
        <StatBlock icon={Clock3} label="Лучшее время" value={insights.bestHour !== null ? `${String(insights.bestHour).padStart(2, "0")}:00` : "—"} color="violet" />
      </div>

      {/* ===== Рекомендации ===== */}
      <Panel title="Что говорит AI-аналитик" icon={Lightbulb} className="panel-bright">
        <ul className="flex flex-col gap-2">
          {insights.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-3 border-b-2 border-line/50 pb-2 last:border-0">
              <span className="mt-0.5 font-display text-[10px] text-neon-dim">▸</span>
              <span className="text-base leading-6 text-ink">{r}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ===== Эффективность рубрик ===== */}
        <Panel title="Что работает лучше" icon={Target}>
          {insights.categories.length ? (
            <ul className="flex flex-col gap-3">
              {insights.categories.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-base">
                    <span className="text-ink">{c.category}</span>
                    <span className="text-muted">
                      {c.avgLikes} ♥ · {c.posts} постов
                    </span>
                  </div>
                  <div className="h-4 w-full border-2 border-line bg-panel2">
                    <div
                      className="h-full bg-[#f983c0]"
                      style={{ width: `${Math.max(4, (c.avgLikes / maxCatLikes) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Target} title="Нет данных" sub="Нужны опубликованные посты с метриками из VK." />
          )}
        </Panel>

        {/* ===== Тепловая карта часов ===== */}
        <Panel title="Когда публиковать" icon={Clock3}>
          {insights.hours.length ? (
            <div className="flex flex-col gap-2">
              {insights.hours.map((h) => (
                <div key={h.hour} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-display text-[9px] text-muted">
                    {String(h.hour).padStart(2, "0")}:00
                  </span>
                  <div className="h-4 flex-1 border-2 border-line bg-panel2">
                    <div
                      className={`h-full ${h.hour === insights.bestHour ? "bg-[#34d576]" : "bg-[#56cdee]"}`}
                      style={{ width: `${Math.max(4, (h.avgLikes / maxHourLikes) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm text-muted">{h.avgLikes} ♥</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock3} title="Нет данных" sub="Опубликуйте посты в разное время — бот найдёт лучший час." />
          )}
        </Panel>
      </div>

      {/* ===== Формула поста ===== */}
      <Panel title="Формула вашего поста" icon={Flame}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Оптимальная длина", value: insights.bestLength ?? "копим данные" },
            { label: "Вопрос в конце", value: insights.questionBoost !== null ? `${insights.questionBoost > 0 ? "+" : ""}${insights.questionBoost}% лайков` : "копим данные" },
            { label: "Картинка в посте", value: insights.imageBoost !== null ? `${insights.imageBoost > 0 ? "+" : ""}${insights.imageBoost}% лайков` : "копим данные" },
          ].map((x) => (
            <div key={x.label} className="border-[3px] border-line bg-panel2 p-4">
              <span className="block font-display text-[8px] uppercase tracking-widest text-muted">
                {x.label}
              </span>
              <span className="mt-1 block text-lg text-ink">{x.value}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ===== Дайджест конкурентов ===== */}
      <Panel
        title="Дайджест конкурентов"
        icon={Swords}
        right={
          <Link href="/competitors" className="font-display text-[8px] uppercase tracking-widest text-neon-dim hover:text-ink">
            Управлять →
          </Link>
        }
      >
        {digest ? (
          <p className="whitespace-pre-wrap text-base leading-6 text-ink">{digest}</p>
        ) : (
          <EmptyState
            icon={Swords}
            title="Конкуренты не добавлены"
            sub="Добавьте 3–5 сообществ — бот будет следить за их постами и подсказывать идеи."
          />
        )}
      </Panel>
    </div>
  );
}
