import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { db, pool } from "@/db";
import { analytics, posts, settings } from "@/db/schema";
import { getSettings, logActivity, rand, todayKey } from "./core";
import { generateVkPost } from "./gpt";
import { planForDay } from "./insights";
import { sanitizePostText } from "./style";
import { notifyOwner } from "./telegram";
import { processComments } from "./comments";
import { markMediaUsed, getMedia, pickNextMedia } from "./media";
import { resolvePostMedia } from "./carousel";
import {
  buildImageUrl,
  formatSearchContext,
  imagePromptFromPost,
  webSearch,
} from "./research";
import { slotEpoch, tzShiftMs } from "./queue";
import {
  fetchVkGroupInfo,
  fetchVkPostStats,
  isRealVkToken,
  resolveServiceToken,
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
    length?: "short" | "long";
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
      ? plan.brief
      : topic;
  const category = captionBrief ? "фото" : useStrategy ? plan.category : "польза";

  let searchContext = "";
  let sources: string | null = null;
  if (useSearch) {
    const query = captionBrief?.slice(0, 120) ?? topic?.trim() ?? plan.event ?? "новости недели";
    const hits = await webSearch(query);
    if (hits.length) {
      searchContext = formatSearchContext(hits);
      sources = JSON.stringify(hits.map((h) => ({ title: h.title, url: h.url })));
    }
  }

  // Антиповтор: отдаём модели последние тексты и переспрашиваем при дубле.
  const recentRows = await db
    .select({ id: posts.id, text: posts.text })
    .from(posts)
    .orderBy(desc(posts.id))
    .limit(10);
  const recent = recentRows.map((r) => r.text);
  // Монотонный счётчик — соседние посты всегда получают разные углы подачи.
  const variantBase = (recentRows[0]?.id ?? 0) + 1;

  let text = "";
  let usedModel: "gpt" | "mock" = "mock";
  for (let attempt = 0; attempt < 2; attempt++) {
    const gen = await generateVkPost({
      instruction: s.instruction,
      tone: s.tone,
      topic: effectiveTopic,
      apiKey: s.gptKey,
      searchContext,
      recent,
      variant: variantBase + attempt,
      length: opts?.length,
    });
    text = gen.text;
    usedModel = gen.usedModel;
    text = sanitizePostText(text);
    if (!isDuplicate(text, recent)) break;
  }

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
        size: opts?.length ?? "",
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

  // Слайды карусели / фото из библиотеки отдаём байтами — быстро и надёжно.
  const media = await resolvePostMedia(post);

  const res = await vkPublishPost({
    token: s.vkToken,
    groupId: s.groupId,
    text: post.text,
    ...media,
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
  void notifyOwner(
    `✅ Пост опубликован (id ${updated.id}${opts?.reason ? `, ${opts.reason}` : ""}).\n${post.text.slice(0, 120)}…`,
  ).catch(() => null);
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

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Каденсы фоновых задач (на одном инстансе; пингер дёргает тик каждую 30–60 с). */
const cadence = { statsAt: 0, commentsAt: 0, rivalsAt: 0 };
function dueEvery(key: keyof typeof cadence, everyMs: number, now: number) {
  if (now - cadence[key] < everyMs) return false;
  cadence[key] = now;
  return true;
}

/** Грубая проверка на дубль: совпадение по первым словам или общей лексике. */
function isDuplicate(text: string, recent: string[]) {
  const norm = (t: string) =>
    t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const a = norm(text);
  if (!a) return false;
  const head = a.slice(0, 80);
  for (const r of recent) {
    const b = norm(r);
    if (!b) continue;
    if (b.slice(0, 80) === head) return true;
    const aw = new Set(a.split(" ").filter((w) => w.length > 4));
    const bw = new Set(b.split(" ").filter((w) => w.length > 4));
    if (!aw.size) continue;
    let common = 0;
    for (const w of aw) if (bw.has(w)) common++;
    if (common / aw.size > 0.75) return true;
  }
  return false;
}

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
      // Идеи из постов конкурентов публикуются только после ручной проверки.
      .where(and(eq(posts.status, "draft"), eq(posts.kind, "post"), ne(posts.source, "competitor")))
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

    // ---------- ЕЖЕДНЕВНЫЙ ДАЙДЖЕСТ ----------
    {
      const { runDigestIfDue } = await import("./digest");
      await runDigestIfDue(s).catch(() => null);
    }

    // ---------- ЕЖЕДНЕВНЫЙ АНАЛИЗ КОНКУРЕНТОВ (сервисный ключ) ----------
    // Раз в сутки: вирусные посты конкурентов → черновики source='competitor'.
    {
      const { runCompetitorIdeasIfDue } = await import("./competitor-ideas");
      await runCompetitorIdeasIfDue().catch(() => null);
    }

    // ---------- ОЧЕРЕДЬ ОТЛОЖЕННЫХ ПОСТОВ В VK ----------
    // Основной механизм: VK сам публикует точно по времени.
    if (s.autoQueue && isRealVkToken(s.vkToken) && s.groupId) {
      const { syncVkQueue } = await import("./queue");
      const q = await syncVkQueue();
      if (s.autoReply || s.autoModerate) await processComments().catch(() => null);
      return {
        ran: q.created > 0,
        reason: "vk-queue" as const,
        queued: q.inVk,
        target: q.target,
        created: q.created,
        nextAt: q.nextAt,
        errors: q.errors,
      };
    }

    // ---------- JOB: ЛОКАЛЬНЫЕ ОТЛОЖЕННЫЕ ПОСТЫ ----------
    // Посты, где пользователь задал «запланировать на…» без постановки в VK.
    const dueLocal = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.status, "scheduled"),
          lte(posts.scheduledAt, new Date()),
        ),
      )
      .orderBy(asc(posts.scheduledAt))
      .limit(3);
    for (const pending of dueLocal) {
      if (pending.vkPostId) {
        // Синхронизирован с VK-очередью — сконвертирует syncVkQueue.
        continue;
      }
      await publishPostById(pending.id, {
        auto: true,
        reason: "отложенный пост: время наступило",
      });
      await sleep(350); // rate limiting VK
    }
    if (dueLocal.some((p) => !p.vkPostId)) {
      return { ran: true as const, slot: "due-post" as const, postId: dueLocal[0].id };
    }

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

    const now = new Date();
    const zNow = new Date(now.getTime() + tzShiftMs());

    const grace = Math.max(0, s.catchUpMinutes) * 60_000;
    const dayKey = `${zNow.getFullYear()}-${String(zNow.getMonth() + 1).padStart(2, "0")}-${String(zNow.getDate()).padStart(2, "0")}`;
    const doneKeys = new Set(s.lastSlotKey.split(",").filter(Boolean));

    const slots = parseSchedule(s.scheduleTimes);
    // Идём от позднего слота к раннему: публикуем самый актуальный, а не старый.
    for (const slot of [...slots].reverse()) {
      const slotKey = `${dayKey} ${slot.raw}`;
      if (doneKeys.has(slotKey)) continue;

      const slotStartMs = slotEpoch(zNow, slot.h, slot.m);
      if (zNow.getTime() < slotStartMs) continue; // ещё не наступил

      const lateMs = zNow.getTime() - slotStartMs;
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
      const slotStart = new Date(slotStartMs);
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
    // ---------- JOB: КОММЕНТАРИИ каждые 5 минут ----------
    if ((s.autoReply || s.autoModerate) && dueEvery("commentsAt", 5 * 60_000, Date.now())) {
      await processComments().catch(() => null);
    }

    // ---------- JOB: АНАЛИЗ КОНКУРЕНТОВ каждые 6 часов ----------
    if (isRealVkToken(resolveServiceToken(s.vkServiceToken)) && dueEvery("rivalsAt", 6 * 3600_000, Date.now())) {
      const { runCompetitorScan } = await import("./trends");
      await runCompetitorScan().catch(() => null);
    }

    // ---------- JOB: СТАТИСТИКА каждые 15 минут ----------
    if (dueEvery("statsAt", 15 * 60_000, Date.now())) {
      await refreshAllStats({ silent: true }).catch(() => null);
    }

    // Автоответы вне каденса при режиме мгновенной обработки — не нужны.
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

  // Групповой токен: чтение стены у VK запрещено → метрики постов недоступны,
  // подписчики доступны. Честно сообщаем, не обнуляем в истории.
  if (!realStats && published.length && groupInfo) {
    if (!opts?.silent) {
      await logActivity(
        "СТАТИСТИКА ОГРАНИЧЕНА",
        "Групповой токен VK запрещает чтение стены. Доступны: публикация, подписчики (" +
          `${groupInfo.followers ?? 0}), ЛС. Подробности — в настройках.`,
        "info",
      );
    }
    const today = todayKey();
    if (groupInfo.followers != null) {
      const existing = await db.select().from(analytics).where(eq(analytics.date, today));
      if (existing.length) {
        await db.update(analytics).set({ followers: groupInfo.followers }).where(eq(analytics.date, today));
      } else {
        await db.insert(analytics).values({
          date: today,
          followers: groupInfo.followers,
          totalLikes: 0,
          totalComments: 0,
          postsCount: published.length,
        });
      }
    }
    return { real: false, followers: groupInfo.followers, updated: 0, readLimited: true };
  }

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
