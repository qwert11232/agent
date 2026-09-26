/**
 * Идемпотентная инициализация БД для запуска «в один клик» (Docker/локально).
 * Создаёт таблицы, если их ещё нет. Без drizzle-kit — только pg.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[init-db] DATABASE_URL is required");
  process.exit(1);
}

const DDL = `
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

const pool = new pg.Pool({ connectionString: url });

let attempt = 0;
for (;;) {
  try {
    await pool.query(DDL);
    console.log("[init-db] tables ready");
    break;
  } catch (err) {
    attempt += 1;
    if (attempt >= 20) {
      console.error("[init-db] failed after retries:", err.message);
      process.exitCode = 1;
      break;
    }
    console.log(`[init-db] waiting for database… (${attempt}/20)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await pool.end();
