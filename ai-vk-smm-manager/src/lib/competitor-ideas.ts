import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { competitors, posts, settings, type Competitor } from "@/db/schema";
import { getSettings, logActivity, todayKey } from "./core";
import { aiComplete } from "./gpt";
import { buildInsights, predictLikes } from "./insights";
import { sanitizePostText, VOICE_STYLE } from "./style";
import { notifyOwner } from "./telegram";
import {
  isClosedGroupError,
  isInvalidKeyError,
  isRealVkToken,
  resolveServiceToken,
  vkServiceApi,
} from "./vk";

/**
 * Ежедневный анализ конкурентов (VK_SERVICE_TOKEN):
 *  1. wall.get по каждому конкуренту (count=20) — ТОЛЬКО через сервисный ключ;
 *  2. вирусные посты = лайки и просмотры заметно выше среднего по выборке;
 *  3. для каждого — промпт в GPT → оригинальный пост в нашем стиле;
 *  4. сохраняем в posts: status='draft', source='competitor'.
 * Ошибка одной группы никогда не роняет остальные.
 */

type RawWallItem = {
  id: number;
  owner_id?: number;
  date?: number;
  text?: string;
  is_pinned?: number;
  marked_as_ads?: number;
  copy_history?: unknown[];
  likes?: { count?: number };
  views?: { count?: number };
  comments?: { count?: number };
  reposts?: { count?: number };
};

export type ViralPost = {
  ref: string; // "owner_id_postId"
  text: string;
  likes: number;
  views: number;
  score: number; // во сколько раз лайки выше среднего
};

export type IdeasReport = {
  live: boolean;
  groups: number;
  scanned: number;
  viral: number;
  created: number;
  skipped: string[];
  errors: string[];
};

const MIN_TEXT = 60; // слишком короткие посты не анализируем
const MIN_SAMPLE = 5; // минимальная выборка для статистики
const MAX_PER_GROUP = 2;
const MAX_TOTAL = 6;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Находит вирусные посты: лайки (и просмотры, если они есть) значительно выше среднего. */
export function findViralPosts(items: RawWallItem[]): ViralPost[] {
  // Для статистики берём все «органические» посты: без закрепа, рекламы и репостов.
  const organic = items.filter(
    (i) => !i.is_pinned && !i.marked_as_ads && !(i.copy_history && i.copy_history.length),
  );
  if (organic.length < MIN_SAMPLE) return [];

  const likes = organic.map((i) => i.likes?.count ?? 0);
  const views = organic.map((i) => i.views?.count ?? 0);
  const avgLikes = mean(likes);
  const sdLikes = stdev(likes);
  const avgViews = mean(views);
  const hasViews = views.filter((v) => v > 0).length >= organic.length / 2;

  // порог: > 1.5× среднего И выше среднего на одно стандартное отклонение
  const likeThreshold = Math.max(avgLikes * 1.5, avgLikes + sdLikes, 3);

  return organic
    .filter((i) => {
      const text = (i.text ?? "").trim();
      if (text.length < MIN_TEXT) return false;
      const l = i.likes?.count ?? 0;
      const v = i.views?.count ?? 0;
      if (l < likeThreshold) return false;
      if (hasViews && v < avgViews * 1.2) return false; // охваты тоже выше среднего
      return true;
    })
    .map((i) => ({
      ref: `${i.owner_id ?? 0}_${i.id}`,
      text: (i.text ?? "").trim(),
      likes: i.likes?.count ?? 0,
      views: i.views?.count ?? 0,
      score: avgLikes ? (i.likes?.count ?? 0) / avgLikes : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Проверка сервисного ключа: utils.getServerTime доступен любому валидному ключу. */
export async function checkServiceKey(serviceToken: string) {
  const r = await vkServiceApi<number>(serviceToken, "utils.getServerTime", {});
  return { ok: r.ok, error: r.error };
}

/** Промпт из ТЗ: анализ причины успеха + оригинальный пост в нашем стиле. */
function buildPrompt(competitorText: string) {
  return (
    `У конкурента залетел пост: ${competitorText.slice(0, 1800)}\n\n` +
    `Проанализируй почему он зашёл.\n` +
    `Напиши уникальный экспертный пост для нашего AI-агентства на похожую тему.\n` +
    `Не копируй, а создай оригинальный контент в нашем стиле.\n\n` +
    `В ответе выдай ТОЛЬКО готовый текст нашего поста, без анализа, без заголовков и пояснений.`
  );
}

async function generateIdea(
  apiKey: string,
  instruction: string,
  competitorText: string,
): Promise<string | null> {
  const system =
    `${VOICE_STYLE}\n\nНИШЕВОЙ КОНТЕКСТ ВЛАДЕЛЬЦА: ` +
    `${instruction || "AI-агентство по разработке сайтов и приложений."}\n` +
    `Пост должен быть оригинальным: другие формулировки, другая структура, свои примеры.`;
  const out = await aiComplete(
    apiKey,
    [
      { role: "system", content: system },
      { role: "user", content: buildPrompt(competitorText) },
    ],
    900,
  );
  if (!out) return null;
  const text = sanitizePostText(out);
  return text.length >= 80 ? text : null;
}

async function fetchWall(serviceToken: string, row: Competitor) {
  const isNumeric = /^\d+$/.test(row.groupId);
  return vkServiceApi<{ items?: RawWallItem[] }>(
    serviceToken,
    "wall.get",
    isNumeric
      ? { owner_id: `-${row.groupId}`, count: "20" }
      : { domain: row.groupId, count: "20" },
  );
}

export async function runCompetitorIdeas(opts?: { maxTotal?: number }): Promise<IdeasReport> {
  const s = await getSettings();
  const report: IdeasReport = {
    live: false,
    groups: 0,
    scanned: 0,
    viral: 0,
    created: 0,
    skipped: [],
    errors: [],
  };

  const serviceToken = resolveServiceToken(s.vkServiceToken);
  if (!isRealVkToken(serviceToken)) {
    report.errors.push("Сервисный ключ VK_SERVICE_TOKEN не задан.");
    await logActivity("КОНКУРЕНТЫ: НЕТ КЛЮЧА", report.errors[0], "error");
    return report;
  }
  report.live = true;

  const rows = await db.select().from(competitors);
  report.groups = rows.length;
  if (!rows.length) {
    report.skipped.push("Список конкурентов пуст — добавьте сообщества на странице «Конкуренты».");
    return report;
  }
  if (!s.gptKey.trim() && !process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
    report.errors.push("Не задан AI API Key — идеи генерировать нечем.");
    await logActivity("КОНКУРЕНТЫ: НЕТ AI-КЛЮЧА", report.errors[0], "error");
    return report;
  }

  const maxTotal = opts?.maxTotal ?? MAX_TOTAL;
  const allPosts = await db.select().from(posts);
  const insights = buildInsights(allPosts);

  for (const row of rows) {
    if (report.created >= maxTotal) break;
    const label = row.name || row.groupId;
    try {
      const wall = await fetchWall(serviceToken, row);

      if (!wall.ok) {
        if (isInvalidKeyError(wall.error)) {
          // Ключ не принят — выясняем, валиден ли он вообще, и прекращаем прогон.
          const check = await checkServiceKey(serviceToken);
          const msg = check.ok
            ? `«${label}»: ключ валиден, но доступа к стене нет (${wall.error}).`
            : `Сервисный ключ недействителен: ${check.error}. Проверьте VK_SERVICE_TOKEN.`;
          report.errors.push(msg);
          await logActivity("КОНКУРЕНТЫ: КЛЮЧ", msg, "error");
          if (!check.ok) break;
          continue;
        }
        if (isClosedGroupError(wall.error)) {
          const msg = `«${label}»: сообщество закрыто или стена недоступна — пропущено.`;
          report.skipped.push(msg);
          await logActivity("КОНКУРЕНТЫ: ПРОПУСК", msg, "info");
          continue;
        }
        report.errors.push(`«${label}»: ${wall.error}`);
        await logActivity("КОНКУРЕНТЫ: ОШИБКА", `«${label}»: ${wall.error}`, "error");
        continue;
      }

      const items = wall.data?.items ?? [];
      report.scanned++;
      const viral = findViralPosts(items).slice(0, MAX_PER_GROUP);
      report.viral += viral.length;
      if (!viral.length) {
        report.skipped.push(`«${label}»: вирусных постов в последних 20 нет.`);
        continue;
      }

      // Не генерируем повторно по одному и тому же посту.
      const refs = viral.map((v) => v.ref);
      const known = new Set(
        (
          await db
            .select({ ref: posts.sourceRef })
            .from(posts)
            .where(and(eq(posts.source, "competitor"), inArray(posts.sourceRef, refs)))
        ).map((r) => r.ref),
      );

      for (const v of viral) {
        if (report.created >= maxTotal) break;
        if (known.has(v.ref)) {
          report.skipped.push(`«${label}»: пост ${v.ref} уже разобран ранее.`);
          continue;
        }
        const text = await generateIdea(s.gptKey, s.instruction, v.text);
        if (!text) {
          report.errors.push(`«${label}»: AI не вернул текст для поста ${v.ref}.`);
          continue;
        }
        const forecast = predictLikes(text, "идея конкурента", false, insights);
        const created = (
          await db
            .insert(posts)
            .values({
              text,
              status: "draft",
              source: "competitor",
              sourceRef: v.ref,
              category: "идея конкурента",
              predictedLikes: forecast.likes,
            })
            .returning({ id: posts.id })
        )[0];
        report.created++;
        await logActivity(
          "ИДЕЯ ИЗ КОНКУРЕНТА",
          `Черновик #${created.id} по посту «${label}» (${v.likes} лайков, ${v.views} просмотров, ×${v.score.toFixed(1)} к среднему).`,
          "info",
        );
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 350)); // лимит VK ~3 зап/сек
    } catch (e) {
      // Одна группа не должна ронять остальные.
      const msg = `«${label}»: ${e instanceof Error ? e.message : "неизвестная ошибка"}`;
      report.errors.push(msg);
      await logActivity("КОНКУРЕНТЫ: ОШИБКА", msg, "error").catch(() => null);
    }
  }

  await logActivity(
    "АНАЛИЗ КОНКУРЕНТОВ",
    `Групп: ${report.groups}, прочитано: ${report.scanned}, вирусных: ${report.viral}, ` +
      `черновиков создано: ${report.created}.` +
      (report.errors.length ? ` Ошибок: ${report.errors.length}.` : ""),
    report.errors.length && !report.created ? "error" : "info",
  );
  if (report.created) {
    void notifyOwner(
      `🕵️ Анализ конкурентов: создано черновиков — ${report.created}. Загляните в «Посты» (источник: конкурент).`,
    ).catch(() => null);
  }
  return report;
}

/** Раз в сутки: запускает анализ, если сегодня ещё не запускали. */
export async function runCompetitorIdeasIfDue() {
  const s = await getSettings();
  if (!s.competitorIdeasEnabled) return null;
  const today = todayKey();
  if (s.lastCompetitorScanDate === today) return null;
  if (!isRealVkToken(resolveServiceToken(s.vkServiceToken))) return null;

  // Отмечаем дату ДО запуска: упавший прогон не должен молотить API каждую минуту.
  await db
    .update(settings)
    .set({ lastCompetitorScanDate: today })
    .where(eq(settings.id, s.id));
  return runCompetitorIdeas();
}
