import { asc, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analytics, chatMessages, posts } from "@/db/schema";
import { getSettings, logActivity, todayKey } from "@/lib/core";
import { chatBotReply } from "@/lib/gpt";
import { fetchVkGroupInfo, isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(chatMessages)
    .orderBy(desc(chatMessages.id))
    .limit(100);
  return NextResponse.json({ messages: rows.reverse() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const userMsg = (
    await db.insert(chatMessages).values({ sender: "user", message }).returning()
  )[0];

  const history = await db
    .select()
    .from(chatMessages)
    .orderBy(desc(chatMessages.id))
    .limit(10);
  const allPosts = await db.select().from(posts);
  const published = allPosts.filter((p) => p.status === "published");
  const s = await getSettings();
  const todayRow = (
    await db.select().from(analytics).where(eq(analytics.date, todayKey()))
  )[0];
  const lastRow = (
    await db.select().from(analytics).orderBy(desc(analytics.date)).limit(1)
  )[0];

  // Живые подписчики напрямую из группы VK, если есть боевой токен.
  let liveFollowers: number | null = null;
  let groupName: string | null = null;
  if (isRealVkToken(s.vkToken) && s.groupId) {
    const info = await fetchVkGroupInfo(s.vkToken, s.groupId);
    liveFollowers = info?.followers ?? null;
    groupName = info?.name ?? null;
  }

  const context = JSON.stringify({
    posts: allPosts.length,
    published: published.length,
    drafts: allPosts.filter((p) => p.status === "draft").length,
    likes: published.reduce((a, p) => a + p.likes, 0),
    comments: published.reduce((a, p) => a + p.comments, 0),
    views: published.reduce((a, p) => a + p.views, 0),
    followers: liveFollowers ?? (todayRow ?? lastRow)?.followers ?? 1211,
    followersSource: liveFollowers != null ? "vk-live" : "db",
    groupName,
    active: s.active,
    scheduleTimes: s.scheduleTimes.split(",").length,
    tone: s.tone,
  });

  const reply = await chatBotReply({
    history: history.reverse().map((m) => ({
      sender: m.sender as "user" | "bot",
      message: m.message,
    })),
    context,
    apiKey: s.gptKey,
  });

  const botMsg = (
    await db.insert(chatMessages).values({ sender: "bot", message: reply.text }).returning()
  )[0];

  await logActivity(
    "СООБЩЕНИЕ В ЧАТЕ",
    `Ответ бота сформирован (${reply.usedModel === "gpt" ? "GPT API" : "встроенная логика"}).`,
    "info",
  );

  return NextResponse.json({ user: userMsg, bot: botMsg });
}
