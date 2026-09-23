import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import { refreshAllStats } from "@/lib/actions";
import { getSettings, seedAnalyticsIfEmpty, todayKey } from "@/lib/core";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

async function buildPayload() {
  const allPosts = await db.select().from(posts);
  const published = allPosts
    .filter((p) => p.status === "published")
    .sort((a, b) => b.likes - a.likes);
  const rows = await db.select().from(analytics).orderBy(asc(analytics.date));
  const series = rows.slice(-14);
  const todayRow = series.find((r) => r.date === todayKey()) ?? series.at(-1);
  const prevRow = series[series.length - 2] ?? todayRow;

  return {
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
    topPosts: published.slice(0, 8),
  };
}

export async function GET() {
  await seedAnalyticsIfEmpty();
  // Если настроен боевой VK-токен — подтягиваем живые данные из группы.
  const s = await getSettings();
  if (isRealVkToken(s.vkToken) && s.groupId) {
    await refreshAllStats({ silent: true });
  }
  return NextResponse.json(await buildPayload());
}

/** Ручное обновление статистики (VK wall.getById по каждому посту). */
export async function POST() {
  await seedAnalyticsIfEmpty();
  await refreshAllStats();
  return NextResponse.json(await buildPayload());
}
