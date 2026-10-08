import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, type Post, type Settings } from "@/db/schema";
import { planForDay } from "./insights";
import { generateDraft } from "./actions";
import { getSettings, logActivity, parseDays, tzShiftMs, zonedParts, QUIET_FROM, QUIET_TO } from "./core";
export { tzShiftMs };
import { generateQueueCarousel, resolvePostMedia } from "./carousel";
import { isRealVkToken, vkGetPostponedResult, vkPublishPost } from "./vk";

export const MAX_QUEUE = 20;

/* ---------- Время и таймзона ---------- */

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
  // Момент HH:MM того же календарного дня в таймзоне расписания (абсолютный timestamp).
  // Все операции в UTC-полях «сдвинутой» даты: результат не зависит от таймзоны сервера.
  const shift = tzShiftMs(zoned);
  const z = new Date(zoned.getTime() + shift);
  z.setUTCHours(h, m, 0, 0);
  return z.getTime() - tzShiftMs(new Date(z.getTime() - shift));
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

const DEFAULT_SLOT = { h: 12, m: 30 };
const WORKDAYS = [1, 2, 3, 4, 5];

/** Сдвигает момент вперёд, пока он не попадёт в рабочий день и вне «тихих часов». */
function nextAllowedMoment(ms: number, days: number[]): number {
  let t = ms;
  for (let guard = 0; guard < 30; guard++) {
    const p = zonedParts(new Date(t));
    if (!days.includes(p.weekday)) {
      t = slotEpoch(new Date(t + 86_400_000), QUIET_TO, 0);
      continue;
    }
    if (p.hour >= QUIET_FROM) {
      t = slotEpoch(new Date(t + 86_400_000), QUIET_TO, 0);
      continue;
    }
    if (p.hour < QUIET_TO) {
      t = slotEpoch(new Date(t), QUIET_TO, 0);
      continue;
    }
    return t;
  }
  return t;
}

/**
 * Ближайшие N моментов публикации (абсолютное время, UTC-таймстемпы).
 * Режим schedule - по слотам в рабочие дни (publishDays), без слотов - 12:30;
 * interval - равные промежутки, но без ночи (QUIET_FROM-QUIET_TO) и вне рабочих дней.
 */
export function nextPublishTimes(s: Settings, count: number, after?: Date): Date[] {
  const out: Date[] = [];
  const startFrom = after ? after.getTime() : Date.now();
  const base = Math.max(startFrom, Date.now()) + 60_000; // VK требует будущее время
  const days = parseDays(s.publishDays, WORKDAYS);

  let slots = parseSlots(s.scheduleTimes);
  const slotMode = s.postMode === "schedule" || s.postMode === "both";
  if (slotMode && !slots.length) slots = [DEFAULT_SLOT];

  if (slotMode && slots.length) {
    const now = new Date();
    for (let day = 0; out.length < count && day < 90; day++) {
      const dayRef = new Date(now.getTime() + day * 86_400_000);
      if (!days.includes(zonedParts(dayRef).weekday)) continue;
      for (const slot of slots) {
        const at = slotEpoch(dayRef, slot.h, slot.m);
        if (at <= base) continue;
        out.push(new Date(at));
        if (out.length >= count) break;
      }
    }
    if (out.length) return out;
  }

  // Интервальный режим: каждые N минут, но только в «дневное» окно рабочих дней.
  const everyMs = Math.max(5, s.intervalMinutes) * 60_000;
  let t = base;
  for (let i = 0; i < count; i++) {
    t = nextAllowedMoment(t + everyMs, days);
    out.push(new Date(t));
  }
  return out;
}

type SlotPlan = ReturnType<typeof planForDay>;
const draftSize = (p: Post) => p.size || (p.text.length >= 1800 ? "long" : "short");

/**
 * Готовый черновик нужного типа (без пометки проверки) или новая генерация под рубрику слота.
 * Тип слота учитывается: короткий слот не берёт лонгрид и наоборот; рубрика слота в приоритете.
 */
export async function pickOrCreateDraft(type: string, at: Date, plan: SlotPlan): Promise<Post> {
  if (type === "carousel") {
    const ready = (
      await db
        .select()
        .from(posts)
        .where(and(eq(posts.status, "draft"), eq(posts.kind, "carousel"), eq(posts.reviewNote, "")))
        .orderBy(asc(posts.id))
        .limit(1)
    )[0];
    if (ready) return ready;
    try {
      return (await generateQueueCarousel({ plan, forDate: at })).post;
    } catch {
      /* нет AI-ключа или рендер не удался - ниже откат до текстового поста */
      type = "short";
    }
  }
  const drafts = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.status, "draft"),
        eq(posts.kind, "post"),
        ne(posts.source, "competitor"),
        eq(posts.reviewNote, ""),
      ),
    )
    .orderBy(asc(posts.id))
    .limit(60);
  const sameType = drafts.filter((d) => draftSize(d) === type);
  const match = sameType.find((d) => d.category === plan.category) ?? sameType[0];
  if (match) return match;
  return generateDraft(undefined, { length: type === "long" ? "long" : "short", forDate: at });
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

  const pickDraftForType = pickOrCreateDraft;

  let created = 0;
  let flagged = 0;
  let lastType = "";
  for (let i = 0; created < missing && i < times.length; i++) {
    const at = times[i];
    if (!at) break;
    // Формат слота задаёт план недели по дате ПУБЛИКАЦИИ; если он выключен в настройках - выбор из разрешённых.
    const plan = planForDay(at);
    let slotType: string = plan.format;
    if (!queueKinds.includes(slotType)) {
      const candidates = queueKinds.filter((t) => t !== lastType);
      const list = candidates.length ? candidates : queueKinds;
      slotType = list[Math.floor(Math.random() * list.length)];
    }
    try {
      const draft = await pickDraftForType(slotType, at, plan);
      lastType = slotType;
      if (draft.reviewNote) {
        // Число без опоры или служебная фраза: в очередь не ставим, ждём ручной проверки.
        flagged++;
        errors.push(`пост #${draft.id} на ручной проверке: ${draft.reviewNote}`);
        if (flagged >= 3) break;
        continue;
      }

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
          // Это время занято своим отложенным - пробуем следующее.
          continue;
        }
        errors.push(msg);
        break; // другие ошибки - принципиальные, дальше нет смысла
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
