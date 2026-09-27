import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, type Settings } from "@/db/schema";
import { generateDraft } from "./actions";
import { getSettings, logActivity } from "./core";
import { getMedia, mediaBuffer } from "./media";
import { isRealVkToken, vkGetPostponed, vkPublishPost } from "./vk";

export const MAX_QUEUE = 20;

/* ---------- Время и таймзона ---------- */

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

/** Форматирование в таймзоне расписания — панель и VK показывают одно время. */
export function formatInTz(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const tz = process.env.SCHEDULE_TZ;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

function parseSlots(scheduleTimes: string) {
  return scheduleTimes
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return { h: Math.min(23, h), m: Math.min(59, m) };
    })
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
}

/**
 * Ближайшие N моментов публикации (абсолютное время, UTC-таймстемпы).
 * Режим schedule — по слотам; interval/both — равные промежутки круглосуточно.
 * Если слоты не заданы — работает интервал, публикация возможна в любое время суток.
 */
export function nextPublishTimes(s: Settings, count: number, after?: Date): Date[] {
  const out: Date[] = [];
  const startFrom = after ? after.getTime() : Date.now();
  const base = Math.max(startFrom, Date.now()) + 60_000; // VK требует будущее время

  const slots = parseSlots(s.scheduleTimes);
  const useSlots = (s.postMode === "schedule" || s.postMode === "both") && slots.length > 0;

  if (useSlots) {
    const shift = tzShiftMs();
    for (let day = 0; out.length < count && day < 60; day++) {
      for (const slot of slots) {
        // Строим момент в таймзоне расписания, затем переводим в абсолютное время.
        const zoned = new Date(Date.now() + shift);
        zoned.setDate(zoned.getDate() + day);
        zoned.setHours(slot.h, slot.m, 0, 0);
        const at = new Date(zoned.getTime() - shift);
        if (at.getTime() <= base) continue;
        out.push(at);
        if (out.length >= count) break;
      }
    }
    if (out.length) return out;
  }

  // Интервальный режим: круглосуточно, каждые N минут.
  const everyMs = Math.max(5, s.intervalMinutes) * 60_000;
  for (let i = 0; i < count; i++) {
    out.push(new Date(base + everyMs * (i + 1)));
  }
  return out;
}

/* ---------- Синхронизация очереди с VK ---------- */

export type QueueSyncResult = {
  live: boolean;
  inVk: number;
  target: number;
  created: number;
  errors: string[];
  nextAt: string | null;
};

/**
 * Держим в VK запас отложенных постов (по умолчанию 10).
 * VK публикует их сам точно в срок — даже если сайт и интернет недоступны.
 */
export async function syncVkQueue(opts?: { silent?: boolean }): Promise<QueueSyncResult> {
  const s = await getSettings();
  const target = Math.min(MAX_QUEUE, Math.max(0, s.queueSize));
  const errors: string[] = [];

  if (!s.autoQueue || target === 0) {
    return { live: false, inVk: 0, target, created: 0, errors: ["очередь выключена"], nextAt: null };
  }
  if (!isRealVkToken(s.vkToken) || !s.groupId) {
    return {
      live: false,
      inVk: 0,
      target,
      created: 0,
      errors: ["нужен VK Access Token и Group ID"],
      nextAt: null,
    };
  }

  // 1. Что уже стоит в очереди ВКонтакте
  const postponed = await vkGetPostponed(s.vkToken, s.groupId);
  if (postponed === null) {
    return {
      live: false,
      inVk: 0,
      target,
      created: 0,
      errors: ["VK не отдал список отложенных (проверьте права токена: wall, groups)"],
      nextAt: null,
    };
  }

  // 2. Приводим локальную базу в соответствие с VK
  const vkIds = new Set(postponed.map((p) => String(p.id)));
  const localScheduled = await db.select().from(posts).where(eq(posts.status, "scheduled"));
  for (const row of localScheduled) {
    if (row.vkPostId && !vkIds.has(row.vkPostId)) {
      // VK уже опубликовал этот отложенный пост
      await db
        .update(posts)
        .set({ status: "published", publishedAt: row.scheduledAt ?? new Date() })
        .where(eq(posts.id, row.id));
    }
  }
  // Время публикации берём из VK — панель и группа показывают одно и то же.
  for (const item of postponed) {
    await db
      .update(posts)
      .set({ scheduledAt: new Date(item.date * 1000) })
      .where(and(eq(posts.status, "scheduled"), eq(posts.vkPostId, String(item.id))));
  }

  const inVk = postponed.length;
  const missing = Math.max(0, target - inVk);
  if (missing === 0) {
    const next = postponed.map((p) => p.date).sort((a, b) => a - b)[0];
    return {
      live: true,
      inVk,
      target,
      created: 0,
      errors: [],
      nextAt: next ? new Date(next * 1000).toISOString() : null,
    };
  }

  // 3. Считаем свободные времена после последнего запланированного
  const lastTaken = postponed.length
    ? new Date(Math.max(...postponed.map((p) => p.date)) * 1000)
    : undefined;
  const times = nextPublishTimes(s, missing, lastTaken);

  // 4. Берём готовые черновики, недостающие — генерируем
  let created = 0;
  for (let i = 0; i < missing; i++) {
    const at = times[i];
    if (!at) break;
    try {
      const draft =
        (
          await db
            .select()
            .from(posts)
            .where(eq(posts.status, "draft"))
            .orderBy(asc(posts.id))
            .limit(1)
        )[0] ?? (await generateDraft());

      let imageBytes: ArrayBuffer | null = null;
      let imageMime: string | undefined;
      if (draft.mediaId) {
        const row = await getMedia(draft.mediaId);
        if (row) {
          imageBytes = mediaBuffer(row);
          imageMime = row.mimeType;
        }
      }

      const res = await vkPublishPost({
        token: s.vkToken,
        groupId: s.groupId,
        text: draft.text,
        imageUrl: imageBytes ? null : draft.imageUrl,
        imageBytes,
        imageMime,
        publishAt: Math.floor(at.getTime() / 1000),
      });

      if (!res.ok || !res.postId) {
        errors.push(res.error ?? "VK отклонил отложенный пост");
        await db.update(posts).set({ status: "draft" }).where(eq(posts.id, draft.id));
        break; // дальше смысла нет — та же ошибка повторится
      }

      await db
        .update(posts)
        .set({ status: "scheduled", vkPostId: res.postId, scheduledAt: at })
        .where(eq(posts.id, draft.id));
      created++;
      if (res.photoError) errors.push(`фото к посту #${draft.id}: ${res.photoError}`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "ошибка постановки в очередь");
      break;
    }
  }

  if (created && !opts?.silent) {
    await logActivity(
      "ОЧЕРЕДЬ VK ПОПОЛНЕНА",
      `Добавлено отложенных постов: ${created}. Всего в запасе: ${inVk + created} из ${target}. ВКонтакте опубликует их сам точно по времени.`,
    );
  }
  if (errors.length && !opts?.silent) {
    await logActivity("ОЧЕРЕДЬ VK: ОШИБКА", errors.join("; ").slice(0, 300), "error");
  }

  const allTimes = [
    ...postponed.map((p) => new Date(p.date * 1000)),
    ...times.slice(0, created),
  ].sort((a, b) => a.getTime() - b.getTime());

  return {
    live: true,
    inVk: inVk + created,
    target,
    created,
    errors,
    nextAt: allTimes[0]?.toISOString() ?? null,
  };
}

/** Список запланированных постов из локальной базы. */
export async function listScheduled() {
  return db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["scheduled"]))
    .orderBy(asc(posts.scheduledAt))
    .limit(50);
}

/** Сбросить локальные пометки, если пользователь очистил очередь в VK вручную. */
export async function resetQueueFlags() {
  await db
    .update(posts)
    .set({ status: "draft", vkPostId: null, scheduledAt: null })
    .where(eq(posts.status, "scheduled"));
  await db.update(settings).set({ updatedAt: new Date() });
}
