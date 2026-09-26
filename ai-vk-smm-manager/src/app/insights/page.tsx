import { desc } from "drizzle-orm";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import InsightsClient from "@/components/pages/insights-client";
import { competitorDigest } from "@/lib/competitors";
import { ensureSchema } from "@/lib/core";
import { buildInsights, planForDay } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  await ensureSchema();
  const all = await db.select().from(posts);
  const last = (await db.select().from(analytics).orderBy(desc(analytics.date)).limit(1))[0];
  const insights = buildInsights(all, last?.followers ?? 0);

  const weekAgo = Date.now() - 7 * 86400_000;
  const postsWeek = all.filter(
    (p) => p.publishedAt && new Date(p.publishedAt).getTime() >= weekAgo,
  ).length;
  const digest = await competitorDigest(insights.avgLikes, postsWeek);

  return (
    <InsightsClient
      insights={insights}
      plan={planForDay()}
      digest={digest}
      weekStats={{
        posts: postsWeek,
        likes: all
          .filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= weekAgo)
          .reduce((a, p) => a + p.likes, 0),
        followers: last?.followers ?? 0,
      }}
    />
  );
}
