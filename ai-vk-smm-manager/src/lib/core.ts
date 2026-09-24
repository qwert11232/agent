import { db, pool } from "@/db";
import { activityLog, analytics, chatMessages, settings } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Идемпотентная схема БД. Применяется один раз на инстанс при первом запросе —
 * поэтому деплой на Vercel не требует drizzle-kit push в Build Command.
 * CREATE TABLE IF NOT EXISTS повторно ничего не ломает и не замедляет.
 */
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  vk_token TEXT NOT NULL DEFAULT '',
  gpt_key TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL DEFAULT '',
  schedule_times TEXT NOT NULL DEFAULT '12:00,18:00',
  tone TEXT NOT NULL DEFAULT 'friendly',
  active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_slot_key TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS catch_up_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS use_web_search BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS use_images BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  vk_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS stats_synced_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sources TEXT;
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analytics (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  total_comments INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0
);
`;

let schemaPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = pool
      .query(SCHEMA_DDL)
      .then(() => undefined)
      .catch((err) => {
        schemaPromise = null; // повторим при следующем запросе
        throw err;
      });
  }
  return schemaPromise;
}

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
  await ensureSchema();
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

/**
 * Демо-данные больше НЕ генерируются: вся статистика приходит из VK API.
 * История графиков накапливается из реальных замеров (одна строка в день).
 */

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
