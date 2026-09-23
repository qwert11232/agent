import { db } from "@/db";
import { activityLog, analytics, chatMessages, settings } from "@/db/schema";
import { sql } from "drizzle-orm";

export function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Singleton-строка настроек (id всегда одна). */
export async function getSettings() {
  const rows = await db.select().from(settings).limit(1);
  if (rows[0]) return rows[0];
  const created = await db
    .insert(settings)
    .values({
      instruction:
        "Ты ведёшь группу про технологии и digital. Пиши про новости, лайфхаки и полезные инструменты. Избегай воды, будь конкретным и полезным.",
    })
    .returning();
  return created[0];
}

export async function logActivity(
  action: string,
  details: string,
  status: "success" | "error" | "info" = "success",
) {
  await db.insert(activityLog).values({ action, details, status });
}

/** 14 дней истории для красивых графиков на старте. */
export async function seedAnalyticsIfEmpty() {
  const c = await db.select({ count: sql<number>`count(*)::int` }).from(analytics);
  if (Number(c[0]?.count ?? 0) > 0) return;
  const rows: (typeof analytics.$inferInsert)[] = [];
  let followers = 1211;
  for (let i = 13; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    followers += rand(4, 24);
    rows.push({
      date: todayKey(d),
      followers,
      totalLikes: rand(35, 240),
      totalComments: rand(3, 42),
      postsCount: Math.random() > 0.3 ? rand(1, 2) : 0,
    });
  }
  await db.insert(analytics).values(rows);
}

export async function seedWelcomeChatIfEmpty() {
  const c = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages);
  if (Number(c[0]?.count ?? 0) > 0) return;
  await db.insert(chatMessages).values({
    sender: "bot",
    message:
      "Система BOT-9000 инициализирована. Я — ваш AI SMM-менеджер: генерирую посты, публикую по расписанию и считаю статистику. Спросите «отчёт», «сколько постов» или «как дела с охватами» — доложу обстановку.",
  });
}
