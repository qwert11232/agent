import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, type Settings } from "@/db/schema";
import { generateDraft } from "./actions";
import { getSettings, logActivity } from "./core";
import { generateQueueCarousel, resolvePostMedia } from "./carousel";
import { isRealVkToken, vkGetPostponedResult, vkPublishPost } from "./vk";

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

export function slotEpoch(zoned: Date, h: number, m: number) {
  // Собираем момент HH:MM в таймзоне расписания как абсолютный timestamp.
  const shift = tzShiftMs();
  const z = new Date(zoned.getTime() + shift);
  z.setHours(h, m, 0, 0);
  return z.getTime() - shift;
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
        const nowTz = new Date(Date.now() + shift);
        const zoned = new Date(nowTz);
        zoned.setDate(zoned.getDate() + day);
        const at = new Date(slotEpoch(zoned, slot.h, slot.m));
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

  // 1. Пытаемся прочитать очередь ВКонтакте
  const found = await vkGetPostponedResult(s.vkToken, s.groupId);
  const readLimited = !found.ok && found.readLimited;
  if (!found.ok && !found.readLimited) {
    return {
      live: false,
      inVk: 0,
      target,
      created: 0,
      errors: [`VK отложенные недоступны: ${found.error}`],
      nextAt: null,
    };
  }
  const postponed = found.ok ? found.items : [];

  // 2. Синхронизация статусов. Железное правило: пост НИКОГДА не уходит
  // из scheduled, пока его время не наступило. Это защищает витрину сайта.
  const localScheduled = await db.select().from(posts).where(eq(posts.status, "scheduled"));
  const vkIds = new Set(postponed.map((p) => String(p.id)));
  const nowMs = Date.now();

  for (const row of localScheduled) {
    const plannedMs = row.scheduledAt ? new Date(row.scheduledAt).getTime() : null;
    if (plannedMs === null) continue;
    // Время пришло → VK уже опубликовал отложенный пост сам.
    if (plannedMs <= nowMs) {
      await db
        .update(posts)
        .set({ status: "published", publishedAt: row.scheduledAt })
        .where(eq(posts.id, row.id));
      continue;
    }
    // Время ещё не пришло: в режиме полного чтения сверяем, что пост жив в VK.
    // Если владелец удалил его вручную из отложенных — возвращаем в черновики.
    if (!readLimited && row.vkPostId && !vkIds.has(row.vkPostId)) {
      await db
        .update(posts)
        .set({ status: "draft", vkPostId: null, scheduledAt: null })
        .where(eq(posts.id, row.id));
    }
  }

  // Время публикации берём из VK, если чтение доступно — панель и группа совпадают.
  for (const item of postponed) {
    await db
      .update(posts)
      .set({ scheduledAt: new Date(item.date * 1000) })
      .where(and(eq(posts.status, "scheduled"), eq(posts.vkPostId, String(item.id))));
  }

  // Актуальная очередь после синхронизации (источник правды для витрины).
  const liveQueue = await db.select().from(posts).where(eq(posts.status, "scheduled"));
  const queueForMissing = liveQueue;

  const inVk = queueForMissing.length;
  const missing = Math.max(0, target - inVk);
  const nextFromQueue = liveQueue
    .map((r) => (r.scheduledAt ? new Date(r.scheduledAt).getTime() : 0))
    .filter((ms) => ms > Date.now())
    .sort((a, b) => a - b)[0];
  if (missing === 0) {
    return {
      live: true,
      inVk,
      target,
      created: 0,
      errors: [],
      nextAt: nextFromQueue ? new Date(nextFromQueue).toISOString() : null,
    };
  }

  // 3. Считаем свободные времена после последнего запланированного
  const lastTaken = postponed.length
    ? new Date(Math.max(...postponed.map((p) => p.date)) * 1000)
    : undefined;
  // Запас кандидатов: часть времён может быть занята чужими отложенными.
  const times = nextPublishTimes(s, missing + 8, lastTaken);

  // 4. Берём готовые черновики, недостающие — генерируем.
  // Тип поста для каждого слота выбираем из settings.queueTypes,
  // не повторяя два одинаковых типа подряд: короткие, лонгриды, карусели.
  const cleanTypes = s.queueTypes
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ["short", "long", "carousel"].includes(t));
  const queueKinds = cleanTypes.length ? cleanTypes : ["short", "long", "carousel"];

  async function pickDraftForType(type: string) {
    if (type === "carousel") {
      const ready = (
        await db
          .select()
          .from(posts)
          .where(and(eq(posts.status, "draft"), eq(posts.kind, "carousel")))
          .orderBy(asc(posts.id))
          .limit(1)
      )[0];
      if (ready) return ready;
      try {
        return (await generateQueueCarousel()).post;
      } catch {
        /* нет AI-ключа или рендер не удался — ниже откат до текстового поста */
      }
    }
    return (
      (
        await db
          .select()
          .from(posts)
          .where(and(eq(posts.status, "draft"), eq(posts.kind, "post"), ne(posts.source, "competitor")))
          .orderBy(asc(posts.id))
          .limit(1)
      )[0] ?? (await generateDraft(undefined, { length: type === "long" ? "long" : "short" }))
    );
  }

  let created = 0;
  let lastType = "";
  for (let i = 0; created < missing && i < times.length; i++) {
    const at = times[i];
    if (!at) break;
    const candidates = queueKinds.filter((t) => t !== lastType);
    const slotType = (candidates.length ? candidates : queueKinds)[
      Math.floor(Math.random() * (candidates.length ? candidates.length : queueKinds.length))
    ];
    try {
      const draft = await pickDraftForType(slotType);
      lastType = slotType === "carousel" ? "carousel" : draft.size || slotType;

      const media = await resolvePostMedia(draft);

      const res = await vkPublishPost({
        token: s.vkToken,
        groupId: s.groupId,
        text: draft.text,
        ...media,
        publishAt: Math.floor(at.getTime() / 1000),
      });

      if (!res.ok || !res.postId) {
        await db.update(posts).set({ status: "draft" }).where(eq(posts.id, draft.id));
        const msg = res.error ?? "VK отклонил отложенный пост";
        if (msg.toLowerCase().includes("already scheduled")) {
          // Это время занято своим отложенным — пробуем следующее.
          continue;
        }
        errors.push(msg);
        break; // другие ошибки — принципиальные, дальше нет смысла
      }

      await db
        .update(posts)
        .set({ status: "scheduled", vkPostId: res.postId, scheduledAt: at })
        .where(eq(posts.id, draft.id));
      created++;
      if (res.photoError) errors.push(`фото к посту #${draft.id}: ${res.photoError}`);
      if (i + 1 < missing) await new Promise((r) => setTimeout(r, 350)); // rate limiting
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
    ...liveQueue.map((p) => new Date(p.scheduledAt ?? Date.now())),
    ...times.slice(0, created),
  ]
    .filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime());

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
