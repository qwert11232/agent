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

export type Settings = typeof settings.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type AnalyticsRow = typeof analytics.$inferSelect;
