import { desc } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, analytics, posts } from "@/db/schema";
import DashboardClient from "@/components/pages/dashboard-client";
import { ensureSchema, getSettings } from "@/lib/core";
import { listScheduled } from "@/lib/queue";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await ensureSchema();
  const [s, allPosts, activity, lastAnalytics, scheduled] = await Promise.all([
    getSettings(),
    db.select().from(posts).orderBy(desc(posts.id)).limit(50),
    db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(8),
    db.select().from(analytics).orderBy(desc(analytics.date)).limit(2),
    listScheduled(),
  ]);

  const published = allPosts.filter((p) => p.status === "published");
  const followers = lastAnalytics[0]?.followers ?? 0;
  const followersDelta =
    (lastAnalytics[0]?.followers ?? 0) - (lastAnalytics[1]?.followers ?? 0);

  return (
    <DashboardClient
      settings={s}
      totals={{
        posts: allPosts.length,
        published: published.length,
        drafts: allPosts.filter((p) => p.status === "draft").length,
        failed: allPosts.filter((p) => p.status === "failed").length,
        likes: published.reduce((a, p) => a + p.likes, 0),
        comments: published.reduce((a, p) => a + p.comments, 0),
        views: published.reduce((a, p) => a + p.views, 0),
        followers,
        followersDelta,
      }}
      scheduled={scheduled.map((p) => ({
        id: p.id,
        text: p.text,
        scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
        vkPostId: p.vkPostId,
      }))}
      queueLive={isRealVkToken(s.vkToken) && Boolean(s.groupId)}
      recentPosts={allPosts.slice(0, 4)}
      activity={activity}
    />
  );
}
