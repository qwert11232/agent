import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import { refreshAllStats } from "@/lib/actions";
import { ensureSchema, getSettings, logActivity, todayKey } from "@/lib/core";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

async function buildPayload() {
  const s = await getSettings();
  const connected = isRealVkToken(s.vkToken) && Boolean(s.groupId);
  const allPosts = await db.select().from(posts);
  const published = allPosts
    .filter((p) => p.status === "published")
    .sort((a, b) => b.likes - a.likes);
  const rows = await db.select().from(analytics).orderBy(asc(analytics.date));
  const series = rows.slice(-14);
  const todayRow = series.find((r) => r.date === todayKey()) ?? series.at(-1);
  const prevRow = series[series.length - 2] ?? todayRow;

  return {
    connected,
    updatedAt: new Date().toISOString(),
    totals: {
      posts: allPosts.length,
      published: published.length,
      drafts: allPosts.filter((p) => p.status === "draft").length,
      failed: allPosts.filter((p) => p.status === "failed").length,
      likes: published.reduce((a, p) => a + p.likes, 0),
      comments: published.reduce((a, p) => a + p.comments, 0),
      views: published.reduce((a, p) => a + p.views, 0),
      reposts: published.reduce((a, p) => a + p.reposts, 0),
      followers: todayRow?.followers ?? 0,
      followersDelta: (todayRow?.followers ?? 0) - (prevRow?.followers ?? 0),
    },
    series,
    topPosts: published.slice(0, 10),
  };
}

/** Живые данные: при каждом запросе тянем свежие метрики из VK. */
export async function GET() {
  await ensureSchema();
  await refreshAllStats({ silent: true });
  return NextResponse.json(await buildPayload());
}

/** Ручное обновление (кнопка) — то же самое, но с записью в журнал. */
export async function POST() {
  await ensureSchema();
  await refreshAllStats();
  return NextResponse.json(await buildPayload());
}

/**
 * Сброс накопленной статистики: чистит историю замеров и обнуляет метрики постов.
 * Нужен, чтобы удалить демо-данные из старых версий панели.
 */
export async function DELETE() {
  await ensureSchema();
  await db.delete(analytics);
  await db.update(posts).set({ likes: 0, comments: 0, views: 0, reposts: 0 });
  await logActivity(
    "СТАТИСТИКА СБРОШЕНА",
    "История замеров очищена, метрики постов обнулены. Дальше — только реальные данные VK.",
    "info",
  );
  await refreshAllStats({ silent: true });
  return NextResponse.json(await buildPayload());
}
