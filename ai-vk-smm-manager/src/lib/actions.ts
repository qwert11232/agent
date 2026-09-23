import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import { getSettings, logActivity, rand, todayKey } from "./core";
import { generateVkPost } from "./gpt";
import {
  fetchVkGroupInfo,
  fetchVkPostStats,
  simulateStatsTick,
  vkPublishPost,
} from "./vk";

/** Генерация черновика через GPT (или mock) + сохранение в БД. */
export async function generateDraft(topic?: string) {
  const s = await getSettings();
  const { text, usedModel } = await generateVkPost({
    instruction: s.instruction,
    tone: s.tone,
    topic,
    apiKey: s.gptKey,
  });
  const row = (await db.insert(posts).values({ text, status: "draft" }).returning())[0];
  await logActivity(
    "ПОСТ СГЕНЕРИРОВАН",
    `Черновик #${row.id} создан (${usedModel === "gpt" ? "GPT API" : "встроенный генератор"}).`,
  );
  return row;
}

/** Публикация поста через VK API + обновление статуса. */
export async function publishPostById(id: number, opts?: { auto?: boolean }) {
  const s = await getSettings();
  const post = (await db.select().from(posts).where(eq(posts.id, id)))[0];
  if (!post) throw new Error("Пост не найден");
  if (post.status === "published") return post;

  const res = await vkPublishPost({ token: s.vkToken, groupId: s.groupId, text: post.text });
  if (!res.ok) {
    await db.update(posts).set({ status: "failed" }).where(eq(posts.id, id));
    await logActivity(
      "ОШИБКА VK API",
      `Пост #${id}: ${res.error ?? "не удалось опубликовать"}`,
      "error",
    );
    throw new Error(res.error ?? "VK API error");
  }

  // При реальной публикации метрики стартуют с нуля (дальше подтянутся из VK).
  // В demo-режиме сразу сидим правдоподобные числа для живых графиков.
  const demoViews = rand(120, 950);
  const stats = res.simulated
    ? {
        views: demoViews,
        likes: Math.round(demoViews * (0.05 + Math.random() * 0.08)),
        comments: rand(0, 9),
        reposts: rand(0, 6),
      }
    : { views: 0, likes: 0, comments: 0, reposts: 0 };
  const updated = (
    await db
      .update(posts)
      .set({
        status: "published",
        vkPostId: res.postId,
        publishedAt: new Date(),
        ...stats,
      })
      .where(eq(posts.id, id))
      .returning()
  )[0];

  await logActivity(
    opts?.auto ? "АВТОПУБЛИКАЦИЯ ПО РАСПИСАНИЮ" : "ПОСТ ОПУБЛИКОВАН",
    `Пост #${id} → VK id ${res.postId}${res.simulated ? " (demo-симуляция)" : ""}.`,
  );
  return updated;
}

export function parseSchedule(scheduleTimes: string) {
  return scheduleTimes
    .split(",")
    .map((t) => t.trim())
    .map((t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return null;
      const h = Math.min(23, Number(m[1]));
      const min = Math.min(59, Number(m[2]));
      return { h, m: min, raw: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
    })
    .filter((x): x is { h: number; m: number; raw: string } => Boolean(x))
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
}

/** Тик автопостинга: если слот расписания наступил и поста в нём нет — генерируем/публикуем. */
export async function runTickIfDue() {
  const s = await getSettings();
  if (!s.active) return { ran: false as const, reason: "paused" as const };

  const slots = parseSchedule(s.scheduleTimes);
  const now = new Date();
  for (const slot of slots) {
    const slotStart = new Date(now);
    slotStart.setHours(slot.h, slot.m, 0, 0);
    if (now < slotStart) continue;

    const posted = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.status, "published"), gte(posts.publishedAt, slotStart)))
      .limit(1);
    if (posted.length) continue;

    const draft = (
      await db
        .select()
        .from(posts)
        .where(eq(posts.status, "draft"))
        .orderBy(asc(posts.id))
        .limit(1)
    )[0];
    const target = draft ?? (await generateDraft());
    const published = await publishPostById(target.id, { auto: true });
    return { ran: true as const, slot: slot.raw, postId: published.id };
  }
  return { ran: false as const, reason: "no-slot-due" as const };
}

/** Ближайший слот расписания (сегодня или завтра). */
export function nextSlotInfo(scheduleTimes: string) {
  const slots = parseSchedule(scheduleTimes);
  if (!slots.length) return null;
  const now = new Date();
  for (const slot of slots) {
    const at = new Date(now);
    at.setHours(slot.h, slot.m, 0, 0);
    if (at > now) return { at, raw: slot.raw };
  }
  const first = slots[0];
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(first.h, first.m, 0, 0);
  return { at, raw: first.raw };
}

/**
 * Обновление статистики: с боевым VK-токеном — реальные данные из группы
 * (wall.getById + members_count), иначе demo-симуляция.
 */
export async function refreshAllStats(opts?: { silent?: boolean }) {
  const s = await getSettings();
  const published = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.id));

  const vkIds = published
    .map((p) => p.vkPostId)
    .filter((x): x is string => Boolean(x));
  const [realStats, groupInfo] = await Promise.all([
    fetchVkPostStats(s.vkToken, s.groupId, vkIds),
    fetchVkGroupInfo(s.vkToken, s.groupId),
  ]);

  let realApplied = 0;
  for (const p of published) {
    const real = p.vkPostId ? realStats?.get(p.vkPostId) : undefined;
    if (real) {
      await db.update(posts).set(real).where(eq(posts.id, p.id));
      realApplied++;
    } else {
      const next = simulateStatsTick(p);
      await db.update(posts).set(next).where(eq(posts.id, p.id));
    }
  }

  const totals = await db.select().from(posts).where(eq(posts.status, "published"));
  const totalLikes = totals.reduce((a, p) => a + p.likes, 0);
  const totalComments = totals.reduce((a, p) => a + p.comments, 0);
  const postsCount = totals.length;

  const today = todayKey();
  const existing = await db.select().from(analytics).where(eq(analytics.date, today));
  if (existing.length) {
    await db
      .update(analytics)
      .set({
        totalLikes,
        totalComments,
        postsCount,
        ...(groupInfo?.followers != null ? { followers: groupInfo.followers } : {}),
      })
      .where(eq(analytics.date, today));
  } else {
    const last = (await db.select().from(analytics).orderBy(desc(analytics.date)).limit(1))[0];
    await db.insert(analytics).values({
      date: today,
      followers: groupInfo?.followers ?? (last?.followers ?? 1211) + rand(4, 24),
      totalLikes,
      totalComments,
      postsCount,
    });
  }

  if (!opts?.silent) {
    const mode = realStats ? `VK wall.getById · реальных ${realApplied}` : "demo-симуляция";
    await logActivity(
      "СТАТИСТИКА ОБНОВЛЕНА",
      `Постов обработано: ${published.length} (${mode})${groupInfo?.followers != null ? `, подписчиков: ${groupInfo.followers}` : ""}.`,
      "info",
    );
  }

  return { real: Boolean(realStats), followers: groupInfo?.followers ?? null };
}
