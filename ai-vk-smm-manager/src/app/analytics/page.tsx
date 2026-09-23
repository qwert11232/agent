import { asc } from "drizzle-orm";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import AnalyticsClient from "@/components/pages/analytics-client";
import { seedAnalyticsIfEmpty, todayKey } from "@/lib/core";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await seedAnalyticsIfEmpty();
  const [allPosts, rows] = await Promise.all([
    db.select().from(posts),
    db.select().from(analytics).orderBy(asc(analytics.date)),
  ]);

  const published = allPosts
    .filter((p) => p.status === "published")
    .sort((a, b) => (b.likes + b.views) - (a.likes + a.views));
  const series = rows.slice(-14);
  const todayRow = series.find((r) => r.date === todayKey()) ?? series.at(-1);
  const prevRow = series[series.length - 2] ?? todayRow;

  return (
    <AnalyticsClient
      totals={{
        posts: allPosts.length,
        published: published.length,
        drafts: allPosts.filter((p) => p.status === "draft").length,
        likes: published.reduce((a, p) => a + p.likes, 0),
        comments: published.reduce((a, p) => a + p.comments, 0),
        views: published.reduce((a, p) => a + p.views, 0),
        reposts: published.reduce((a, p) => a + p.reposts, 0),
        followers: todayRow?.followers ?? 0,
        followersDelta: (todayRow?.followers ?? 0) - (prevRow?.followers ?? 0),
      }}
      series={series}
      topPosts={published.slice(0, 10)}
    />
  );
}
