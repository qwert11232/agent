import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db, pool } from "@/db";
import { analytics, posts, settings } from "@/db/schema";
import { getSettings, logActivity, rand, todayKey } from "./core";
import { generateVkPost } from "./gpt";
import { planForDay, seasonHint } from "./insights";
import { processComments } from "./comments";
import { markMediaUsed, mediaBuffer, getMedia, pickNextMedia } from "./media";
import {
  buildImageUrl,
  formatSearchContext,
  imagePromptFromPost,
  webSearch,
} from "./research";
import {
  fetchVkGroupInfo,
  fetchVkPostStats,
  isRealVkToken,
  vkPublishPost,
} from "./vk";

/** Генерация черновика: веб-поиск (опц.) → текст через AI → картинка (опц.). */
export async function generateDraft(
  topic?: string,
  opts?: {
    withSearch?: boolean;
    withImage?: boolean;
    imageSource?: "none" | "ai" | "library";
    mediaId?: number;
  },
) {
  const s = await getSettings();
  const useSearch = opts?.withSearch ?? s.useWebSearch;
  const useImage = opts?.withImage ?? s.useImages;
  const imageSource = opts?.imageSource ?? (useImage ? s.imageSource : "none");

  // Фото из библиотеки: берём конкретное или следующее по ротации.
  let libMedia = null;
  if (imageSource === "library") {
    libMedia = opts?.mediaId ? await getMedia(opts.mediaId) : await pickNextMedia();
  }

  // Контент-стратегия: рубрика дня + реакция на праздники и сезон.
  const plan = planForDay();
  const captionBrief = libMedia?.caption?.trim();
  const useStrategy = s.useStrategy && !topic?.trim() && !captionBrief;

  // Микро-ТЗ к фото имеет наивысший приоритет — текст пишется под снимок.
  const effectiveTopic = captionBrief
    ? `Напиши пост к прикреплённой фотографии. Микро-ТЗ от владельца (следуй ему точно): ${captionBrief}${topic?.trim() ? `. Дополнительно: ${topic.trim()}` : ""}`
    : useStrategy
      ? `${plan.brief}. Сезонный контекст: ${seasonHint()}`
      : topic;
  const category = captionBrief ? "фото" : useStrategy ? plan.category : "польза";

  let searchContext = "";
  let sources: string | null = null;
  if (useSearch) {
    const query = topic?.trim() || plan.event || s.instruction.slice(0, 120) || "новости недели";
    const hits = await webSearch(query);
    if (hits.length) {
      searchContext = formatSearchContext(hits);
      sources = JSON.stringify(hits.map((h) => ({ title: h.title, url: h.url })));
    }
  }

  const { text, usedModel } = await generateVkPost({
    instruction: s.instruction,
    tone: s.tone,
    topic: effectiveTopic,
    apiKey: s.gptKey,
    searchContext,
  });

  const imageUrl = libMedia
    ? `/api/media/${libMedia.id}/raw`
    : imageSource === "ai"
      ? buildImageUrl(imagePromptFromPost(text, topic))
      : null;

  const { buildInsights, predictLikes } = await import("./insights");
  const allPosts = await db.select().from(posts);
  const forecast = predictLikes(text, category, Boolean(imageUrl), buildInsights(allPosts));

  const row = (
    await db
      .insert(posts)
      .values({
        text,
        status: "draft",
        imageUrl,
        sources,
        category,
        predictedLikes: forecast.likes,
        mediaId: libMedia?.id ?? null,
      })
      .returning()
  )[0];

  await logActivity(
    "ПОСТ СГЕНЕРИРОВАН",
    `Черновик #${row.id} (${usedModel === "gpt" ? "AI" : "встроенный генератор"})` +
      ` · рубрика «${category}» · прогноз ~${forecast.likes} лайков` +
      (searchContext ? " · с веб-поиском" : "") +
      (libMedia ? ` · фото из библиотеки #${libMedia.id}` : imageUrl ? " · с AI-картинкой" : ""),
  );
  if (libMedia) await markMediaUsed(libMedia.id);
  return row;
}

/** Публикация поста через VK API + обновление статуса. */
export async function publishPostById(
  id: number,
  opts?: { auto?: boolean; reason?: string },
) {
  const s = await getSettings();
  const post = (await db.select().from(posts).where(eq(posts.id, id)))[0];
  if (!post) throw new Error("Пост не найден");
  if (post.status === "published") return post;

  // Для фото из библиотеки отдаём байты напрямую — быстро и надёжно.
  let imageBytes: ArrayBuffer | null = null;
  let imageMime: string | undefined;
  if (post.mediaId) {
    const row = await getMedia(post.mediaId);
    if (row) {
      imageBytes = mediaBuffer(row);
      imageMime = row.mimeType;
    }
  }

  const res = await vkPublishPost({
    token: s.vkToken,
    groupId: s.groupId,
    text: post.text,
    imageUrl: imageBytes ? null : post.imageUrl,
    imageBytes,
    imageMime,
  });
  if (!res.ok) {
    await db.update(posts).set({ status: "failed" }).where(eq(posts.id, id));
    await logActivity(
      "ОШИБКА VK API",
      `Пост #${id}: ${res.error ?? "не удалось опубликовать"}`,
      "error",
    );
    throw new Error(res.error ?? "VK API error");
  }

  // Метрики всегда стартуют с нуля и наполняются реальными данными из VK.
  const updated = (
    await db
      .update(posts)
      .set({
        status: "published",
        vkPostId: res.postId,
        publishedAt: new Date(),
        views: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
      })
      .where(eq(posts.id, id))
      .returning()
  )[0];

  await logActivity(
    opts?.auto ? "АВТОПУБЛИКАЦИЯ" : "ПОСТ ОПУБЛИКОВАН",
    `Пост #${id} → VK id ${res.postId}${res.simulated ? " (demo-симуляция)" : ""}` +
      (opts?.reason ? ` · ${opts.reason}` : ""),
  );
  if (res.photoError) {
    await logActivity(
      "ФОТО НЕ ПРИКРЕПИЛОСЬ",
      `Пост #${id} опубликован без картинки. Причина: ${res.photoError}. Проверьте, что VK-токен выдан с правами photos и wall.`,
      "error",
    );
  }
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

const TICK_LOCK_KEY = 707001;

function formatInterval(min: number) {
  if (min % 1440 === 0) return `${min / 1440} дн.`;
  if (min % 60 === 0) return `${min / 60} ч.`;
  return `${min} мин.`;
}

/** Время последней публикации (мс) — точка отсчёта для интервала. */
async function lastPublishedAtMs(): Promise<number | null> {
  const row = (
    await db
      .select({ at: posts.publishedAt })
      .from(posts)
      .where(eq(posts.status, "published"))
      .orderBy(desc(posts.publishedAt))
      .limit(1)
  )[0];
  return row?.at ? new Date(row.at).getTime() : null;
}

/** Берём готовый черновик или генерируем новый и публикуем. */
async function publishNextPost(reason: string) {
  const draft = (
    await db
      .select()
      .from(posts)
      .where(eq(posts.status, "draft"))
      .orderBy(asc(posts.id))
      .limit(1)
  )[0];
  const target = draft ?? (await generateDraft());
  return publishPostById(target.id, { auto: true, reason });
}

/** Фиксируем отработанный слот (храним последние 20 ключей). */
async function markSlotDone(
  settingsId: number,
  current: string,
  slotKey: string,
) {
  const keys = [...current.split(",").filter(Boolean), slotKey].slice(-20);
  await db
    .update(settings)
    .set({ lastSlotKey: keys.join(",") })
    .where(eq(settings.id, settingsId));
}

/**
 * Тик автопостинга: если слот расписания наступил и поста в нём нет —
 * берём старший черновик (или генерируем новый) и публикуем.
 * pg advisory lock защищает от дублей при параллельных тиках
 * (несколько вкладок + внешний пингер одновременно).
 * SCHEDULE_TZ задаёт таймзону расписания (на хостингах сервер обычно в UTC).
 */
export async function runTickIfDue() {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(${TICK_LOCK_KEY}) AS ok`,
    );
    if (!lock.rows[0]?.ok) return { ran: false as const, reason: "locked" as const };

    const s = await getSettings();
    if (!s.active) return { ran: false as const, reason: "paused" as const };

    // ---------- РЕЖИМ «КАЖДЫЕ N МИНУТ» ----------
    if (s.postMode === "interval" || s.postMode === "both") {
      const everyMs = Math.max(5, s.intervalMinutes) * 60_000;
      const last = s.lastAutoPostAt
        ? new Date(s.lastAutoPostAt).getTime()
        : await lastPublishedAtMs();
      const due = !last || Date.now() - last >= everyMs;
      if (due) {
        const published = await publishNextPost(
          `интервал ${formatInterval(s.intervalMinutes)}`,
        );
        await db
          .update(settings)
          .set({ lastAutoPostAt: new Date() })
          .where(eq(settings.id, s.id));
        return {
          ran: true as const,
          slot: `every ${s.intervalMinutes}m`,
          postId: published.id,
        };
      }
      if (s.postMode === "interval") {
        const waitMin = Math.max(0, Math.ceil((everyMs - (Date.now() - (last ?? 0))) / 60000));
        return { ran: false as const, reason: "interval-wait" as const, waitMin };
      }
    }

    const tz = process.env.SCHEDULE_TZ;
    const now = new Date();
    const zNow = tz
      ? new Date(now.toLocaleString("en-US", { timeZone: tz }))
      : now;
    const tzShiftMs = zNow.getTime() - now.getTime();

    const grace = Math.max(0, s.catchUpMinutes) * 60_000;
    const dayKey = `${zNow.getFullYear()}-${String(zNow.getMonth() + 1).padStart(2, "0")}-${String(zNow.getDate()).padStart(2, "0")}`;
    const doneKeys = new Set(s.lastSlotKey.split(",").filter(Boolean));

    const slots = parseSchedule(s.scheduleTimes);
    // Идём от позднего слота к раннему: публикуем самый актуальный, а не старый.
    for (const slot of [...slots].reverse()) {
      const slotKey = `${dayKey} ${slot.raw}`;
      if (doneKeys.has(slotKey)) continue;

      const slotStartZoned = new Date(zNow);
      slotStartZoned.setHours(slot.h, slot.m, 0, 0);
      if (zNow < slotStartZoned) continue; // ещё не наступил

      const lateMs = zNow.getTime() - slotStartZoned.getTime();
      // Слот просрочен сильнее окна догона — помечаем пропущенным, НЕ публикуем.
      if (lateMs > grace) {
        await markSlotDone(s.id, s.lastSlotKey, slotKey);
        await logActivity(
          "СЛОТ ПРОПУЩЕН",
          `Слот ${slot.raw} просрочен на ${Math.round(lateMs / 60000)} мин (окно догона ${s.catchUpMinutes} мин) — публикация отменена.`,
          "info",
        );
        continue;
      }

      // Страховка: если в этот слот уже что-то вышло — не дублируем.
      const slotStart = new Date(slotStartZoned.getTime() - tzShiftMs);
      const posted = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.status, "published"), gte(posts.publishedAt, slotStart)))
        .limit(1);
      if (posted.length) {
        await markSlotDone(s.id, s.lastSlotKey, slotKey);
        continue;
      }

      const published = await publishNextPost(`слот ${slot.raw}`);
      await markSlotDone(s.id, s.lastSlotKey, slotKey);
      return { ran: true as const, slot: slot.raw, postId: published.id };
    }
    // Автоответы на комментарии выполняются на каждом тике.
    if (s.autoReply || s.autoModerate) {
      await processComments().catch(() => null);
    }
    return { ran: false as const, reason: "no-slot-due" as const };
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(${TICK_LOCK_KEY})`);
    } catch {
      /* no-op */
    }
    client.release();
  }
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
 * Обновление статистики ТОЛЬКО реальными данными из VK
 * (wall.getById по постам + members_count по группе).
 * Без боевого токена ничего не выдумываем — метрики остаются нулевыми.
 */
export async function refreshAllStats(opts?: { silent?: boolean }) {
  const s = await getSettings();
  const connected = isRealVkToken(s.vkToken) && Boolean(s.groupId.replace(/[^0-9]/g, ""));
  if (!connected) {
    if (!opts?.silent) {
      await logActivity(
        "СТАТИСТИКА НЕ ОБНОВЛЕНА",
        "Не задан VK Access Token или Group ID — реальные метрики недоступны.",
        "info",
      );
    }
    return { real: false, followers: null, updated: 0 };
  }

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
  let missing = 0;
  for (const p of published) {
    const real = p.vkPostId ? realStats?.get(p.vkPostId) : undefined;
    if (real) {
      await db
        .update(posts)
        .set({ ...real, statsSyncedAt: new Date() })
        .where(eq(posts.id, p.id));
      realApplied++;
    } else {
      // Поста нет в группе (демо-публикация или удалён) — обнуляем,
      // чтобы в панели не висели цифры «из ниоткуда».
      missing++;
      await db
        .update(posts)
        .set({ likes: 0, comments: 0, views: 0, reposts: 0, statsSyncedAt: null })
        .where(eq(posts.id, p.id));
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
    await db.insert(analytics).values({
      date: today,
      followers: groupInfo?.followers ?? 0,
      totalLikes,
      totalComments,
      postsCount,
    });
  }

  if (!opts?.silent) {
    await logActivity(
      "СТАТИСТИКА ОБНОВЛЕНА",
      `VK wall.getById: реальных постов ${realApplied} из ${published.length}` +
        (missing ? `, не найдено в группе: ${missing}` : "") +
        (groupInfo?.followers != null ? `, подписчиков: ${groupInfo.followers}` : ""),
      "info",
    );
  }

  return { real: true, followers: groupInfo?.followers ?? null, updated: realApplied };
}
