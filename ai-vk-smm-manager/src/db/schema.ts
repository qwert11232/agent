import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  vkToken: text("vk_token").notNull().default(""),
  gptKey: text("gpt_key").notNull().default(""),
  groupId: text("group_id").notNull().default(""),
  instruction: text("instruction").notNull().default(""),
  scheduleTimes: text("schedule_times").notNull().default("12:00,18:00"),
  tone: text("tone").notNull().default("friendly"), // friendly | business | funny
  active: boolean("active").notNull().default(false),
  // Последний отработанный слот в формате "YYYY-MM-DD HH:MM" — защита от
  // публикаций «не вовремя» после долгого простоя.
  lastSlotKey: text("last_slot_key").notNull().default(""),
  // Максимальное опоздание публикации (минут). 0 = догон выключен.
  catchUpMinutes: integer("catch_up_minutes").notNull().default(60),
  useWebSearch: boolean("use_web_search").notNull().default(false),
  useImages: boolean("use_images").notNull().default(false),
  autoReply: boolean("auto_reply").notNull().default(false),
  faq: text("faq").notNull().default(""),
  autoModerate: boolean("auto_moderate").notNull().default(true),
  useStrategy: boolean("use_strategy").notNull().default(true),
  // Режим автопостинга: schedule | interval | both
  postMode: text("post_mode").notNull().default("schedule"),
  intervalMinutes: integer("interval_minutes").notNull().default(240),
  lastAutoPostAt: timestamp("last_auto_post_at", { withTimezone: true }),
  // Источник картинок: none | ai | library
  imageSource: text("image_source").notNull().default("ai"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  vkPostId: text("vk_post_id"),
  status: text("status").notNull().default("draft"), // draft | published | failed
  publishedAt: timestamp("published_at", { withTimezone: true }),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  views: integer("views").notNull().default(0),
  reposts: integer("reposts").notNull().default(0),
  // Когда метрики реально подтянулись из VK (null → цифр ещё нет).
  statsSyncedAt: timestamp("stats_synced_at", { withTimezone: true }),
  imageUrl: text("image_url"),
  sources: text("sources"), // JSON-массив ссылок из веб-поиска
  category: text("category").notNull().default("польза"), // рубрика контент-плана
  predictedLikes: integer("predicted_likes").notNull().default(0),
  mediaId: integer("media_id"), // фото из библиотеки
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sender: text("sender").notNull(), // user | bot
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("success"), // success | error | info
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  followers: integer("followers").notNull().default(0),
  totalLikes: integer("total_likes").notNull().default(0),
  totalComments: integer("total_comments").notNull().default(0),
  postsCount: integer("posts_count").notNull().default(0),
});

/* ===================== v2.0 ===================== */

/** Библиотека фото пользователя: байты в БД + микро-ТЗ к каждому снимку. */
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull().default("photo.jpg"),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  data: text("data").notNull(), // base64
  caption: text("caption").notNull().default(""), // микро-ТЗ для генерации текста
  usedCount: integer("used_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  groupId: text("group_id").notNull(),
  name: text("name").notNull().default(""),
  followers: integer("followers").notNull().default(0),
  avgLikes: integer("avg_likes").notNull().default(0),
  postsWeek: integer("posts_week").notNull().default(0),
  topPostText: text("top_post_text").notNull().default(""),
  topPostLikes: integer("top_post_likes").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  vkCommentId: text("vk_comment_id").notNull().default(""),
  vkPostId: text("vk_post_id").notNull().default(""),
  authorName: text("author_name").notNull().default(""),
  text: text("text").notNull(),
  sentiment: text("sentiment").notNull().default("neutral"), // positive|question|negative|spam|neutral
  reply: text("reply"),
  status: text("status").notNull().default("new"), // new|replied|hidden|alert
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type AnalyticsRow = typeof analytics.$inferSelect;
