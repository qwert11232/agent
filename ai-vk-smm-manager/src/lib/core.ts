import { db, pool } from "@/db";
import { AGENCY_PROMPT } from "./prompts";
import { activityLog, analytics, chatMessages, settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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
  schedule_times TEXT NOT NULL DEFAULT '12:30',
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
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'польза';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS predicted_likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_id INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_queue BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS queue_size INTEGER NOT NULL DEFAULT 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_time TEXT NOT NULL DEFAULT '09:30';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_carousel BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_photos BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_niche TEXT NOT NULL DEFAULT 'AI, разработка сайтов и приложений, дизайн, стартапы';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_digest_date TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'post';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'own';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS vk_service_token TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS competitor_ideas_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_competitor_scan_date TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS carousel_design TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS queue_types TEXT NOT NULL DEFAULT 'short,long,carousel';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS facts_bank TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_footer TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_days TEXT NOT NULL DEFAULT '1,3,5';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS publish_days TEXT NOT NULL DEFAULT '1,2,3,4,5';

CREATE TABLE IF NOT EXISTS design_presets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS slide_specs (
  post_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS post_images (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_images_post_idx ON post_images(post_id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tg_token TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tg_chat_id TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'comment',
  vk_comment_id TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS post_mode TEXT NOT NULL DEFAULT 'schedule';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 240;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_auto_post_at TIMESTAMPTZ;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS image_source TEXT NOT NULL DEFAULT 'ai';
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL DEFAULT 'photo.jpg',
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_reply BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS faq TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_moderate BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS use_strategy BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS competitors (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  followers INTEGER NOT NULL DEFAULT 0,
  avg_likes INTEGER NOT NULL DEFAULT 0,
  posts_week INTEGER NOT NULL DEFAULT 0,
  top_post_text TEXT NOT NULL DEFAULT '',
  top_post_likes INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  vk_comment_id TEXT NOT NULL DEFAULT '',
  vk_post_id TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  reply TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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

/** Смещение таймзоны расписания относительно UTC в миллисекундах. */
export function tzShiftMs(at = new Date()) {
  const tz = process.env.SCHEDULE_TZ;
  if (!tz) return 0;
  try {
    return new Date(at.toLocaleString("en-US", { timeZone: tz })).getTime() - at.getTime();
  } catch {
    return 0;
  }
}

/** «Сдвинутая» дата: её getUTC*-поля показывают локальное время расписания. */
export function zonedParts(at = new Date()) {
  const z = new Date(at.getTime() + tzShiftMs(at));
  return {
    year: z.getUTCFullYear(),
    month: z.getUTCMonth() + 1,
    day: z.getUTCDate(),
    weekday: z.getUTCDay(),
    hour: z.getUTCHours(),
    minute: z.getUTCMinutes(),
  };
}

/** Окно «тихих часов»: ночью ничего не публикуем (интервальный режим). */
export const QUIET_FROM = 21; // с 21:00
export const QUIET_TO = 8; // до 08:00
export function isQuietHour(at = new Date()) {
  const h = zonedParts(at).hour;
  return h >= QUIET_FROM || h < QUIET_TO;
}

/** «1,2,3» → [1,2,3] (0 = воскресенье). */
export function parseDays(csv: string, fallback: number[]): number[] {
  const list = [...new Set(String(csv ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  return list.length ? list.sort() : fallback;
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
  const row = rows[0];
  if (row) {
    // Легаси-подсказка и пустая инструкция → профильный промпт агентства.
    // Незатронутый старый дефолт (с «призывом в каждом посте» и «придумай») тоже обновляем.
    const legacy = row.instruction.startsWith("Ты ведёшь группу про технологии и digital");
    const empty = !row.instruction.trim();
    const oldDefault =
      row.instruction.startsWith("Стиль подачи и голос задаёт отдельный блок") &&
      row.instruction.includes("Призыв к действию в каждом посте");
    if (legacy || empty || oldDefault) {
      return (
        await db
          .update(settings)
          .set({ instruction: AGENCY_PROMPT })
          .where(eq(settings.id, row.id))
          .returning()
      )[0];
    }
    return row;
  }
  const created = await db.insert(settings).values({ instruction: AGENCY_PROMPT }).returning();
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
