import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { analytics, chatMessages, leads, posts } from "@/db/schema";
import PostsClient from "@/components/pages/posts-client";
import LibraryClient from "@/components/pages/library-client";
import CommentsClient from "@/components/pages/comments-client";
import ChatClient from "@/components/pages/chat-client";
import AnalyticsClient from "@/components/pages/analytics-client";
import InsightsClient from "@/components/pages/insights-client";
import TrendsClient from "@/components/pages/trends-client";
import CompetitorsClient from "@/components/pages/competitors-client";
import { refreshAllStats } from "@/lib/actions";
import { listComments } from "@/lib/comments";
import { competitorDigest, listCompetitors } from "@/lib/competitors";
import { ensureSchema, getSettings, todayKey } from "@/lib/core";
import { buildInsights, planForDay } from "@/lib/insights";
import { listMediaLite } from "@/lib/media";
import { listCompetitorRows } from "@/lib/trends";
import { isRealVkToken, resolveServiceToken } from "@/lib/vk";

/** Серверные вкладки же, что были отдельными страницами, — теперь в хабах. */

export async function PostsTab() {
  await ensureSchema();
  const [rows, s] = await Promise.all([
    db.select().from(posts).orderBy(desc(posts.id)).limit(100),
    getSettings(),
  ]);
  return (
    <PostsClient
      initial={rows}
      tone={s.tone}
      groupId={s.groupId}
      defaultSearch={s.useWebSearch}
      defaultImage={s.useImages}
      queueSize={s.queueSize}
      vkLive={isRealVkToken(s.vkToken) && Boolean(s.groupId)}
    />
  );
}

export async function LibraryTab() {
  await ensureSchema();
  const [items, s] = await Promise.all([listMediaLite(), getSettings()]);
  return <LibraryClient initial={items} imageSource={s.imageSource} />;
}

export async function CommentsTab() {
  await ensureSchema();
  const [rows, s, leadRows] = await Promise.all([
    listComments(),
    getSettings(),
    db.select().from(leads).orderBy(desc(leads.id)).limit(100),
  ]);
  return (
    <CommentsClient
      initial={rows}
      autoReply={s.autoReply}
      autoModerate={s.autoModerate}
      faq={s.faq}
      live={isRealVkToken(s.vkToken) && Boolean(s.groupId)}
      leads={leadRows}
    />
  );
}

export async function ChatTab() {
  await ensureSchema();
  const [messages, s] = await Promise.all([
    db.select().from(chatMessages).orderBy(asc(chatMessages.id)).limit(100),
    getSettings(),
  ]);
  return <ChatClient initial={messages} groupId={s.groupId} />;
}

export async function StatsTab() {
  await ensureSchema();
  const s = await getSettings();
  const connected = isRealVkToken(s.vkToken) && Boolean(s.groupId);

  if (connected) await refreshAllStats({ silent: true });

  const [allPosts, rows] = await Promise.all([
    db.select().from(posts),
    db.select().from(analytics).orderBy(asc(analytics.date)),
  ]);

  const published = allPosts
    .filter((p) => p.status === "published")
    .sort((a, b) => b.likes + b.views - (a.likes + a.views));
  const series = rows.slice(-14);
  const todayRow = series.find((r) => r.date === todayKey()) ?? series.at(-1);
  const prevRow = series[series.length - 2] ?? todayRow;

  return (
    <AnalyticsClient
      connected={connected}
      groupId={s.groupId}
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

async function insightsElement() {
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

export async function TrendsTab() {
  await ensureSchema();
  const [rivals, s] = await Promise.all([listCompetitorRows(), getSettings()]);
  return <TrendsClient rivals={rivals} live={isRealVkToken(s.vkToken)} />;
}

export async function CompetitorsTab() {
  await ensureSchema();
  const [rows, s] = await Promise.all([listCompetitors(), getSettings()]);
  return <CompetitorsClient initial={rows} live={isRealVkToken(resolveServiceToken(s.vkServiceToken))} />;
}

export async function InsightsTab() {
  await ensureSchema();
  return insightsElement();
}
