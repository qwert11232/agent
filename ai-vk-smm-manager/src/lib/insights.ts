import type { Post } from "@/db/schema";

/* ============ КОНТЕНТ-СТРАТЕГИЯ ============ */

import { AGENCY_EVENTS, AGENCY_WEEK, type PlanFormat } from "./prompts";
import { zonedParts } from "./core";

/** Календарные события: только мягкая рубрика «вовлечение», без дежурных поздравлений. */
const EVENTS = AGENCY_EVENTS;

export function eventForDate(d = new Date()) {
  const p = zonedParts(d);
  const md = `${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return EVENTS.find((e) => e.md === md) ?? null;
}

export type DayPlan = {
  category: string;
  brief: string;
  event: string | null;
  format: PlanFormat;
  /** Ступень лестницы призывов 0-4. */
  cta: number;
  weekday: number;
};

/**
 * Рубрика, формат и бриф на конкретную дату (в таймзоне расписания).
 * Для очереди дата - это время ПУБЛИКАЦИИ слота, а не момент генерации черновика.
 */
export function planForDay(d = new Date()): DayPlan {
  const p = zonedParts(d);
  const weekIndex = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000 / 7);
  const variants = AGENCY_WEEK[p.weekday] ?? AGENCY_WEEK[1];
  const plan = variants[weekIndex % 2];
  const event = eventForDate(d);
  if (event) {
    return {
      category: "событие",
      brief: `короткий человеческий пост к событию «${event.name}»: одна мысль про работу и бизнес, без дежурных поздравлений, без пафоса и без продажи`,
      event: event.name,
      format: "short",
      cta: 0,
      weekday: p.weekday,
    };
  }
  return { category: plan.category, brief: plan.brief, event: null, format: plan.format, cta: plan.cta, weekday: p.weekday };
}

/* ============ УМНАЯ АНАЛИТИКА ============ */

export type CategoryStat = {
  category: string;
  posts: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
};

export type HourStat = { hour: number; posts: number; avgLikes: number };

export type Insights = {
  hasData: boolean;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  engagementRate: number;
  categories: CategoryStat[];
  bestCategory: CategoryStat | null;
  worstCategory: CategoryStat | null;
  hours: HourStat[];
  bestHour: number | null;
  bestLength: string | null;
  questionBoost: number | null;
  emojiBoost: number | null;
  imageBoost: number | null;
  recommendations: string[];
};

const avg = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

function boost(withF: Post[], withoutF: Post[]) {
  if (withF.length < 2 || withoutF.length < 2) return null;
  const a = avg(withF.map((p) => p.likes));
  const b = avg(withoutF.map((p) => p.likes));
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}

export function buildInsights(posts: Post[], followers = 0): Insights {
  const pub = posts.filter((p) => p.status === "published" && p.statsSyncedAt);
  const empty: Insights = {
    hasData: false,
    avgLikes: 0,
    avgComments: 0,
    avgViews: 0,
    engagementRate: 0,
    categories: [],
    bestCategory: null,
    worstCategory: null,
    hours: [],
    bestHour: null,
    bestLength: null,
    questionBoost: null,
    emojiBoost: null,
    imageBoost: null,
    recommendations: [
      "Данных пока нет. Опубликуйте 3–5 постов с подключённым VK-токеном — и бот начнёт находить закономерности.",
    ],
  };
  if (!pub.length) return empty;

  const avgLikes = avg(pub.map((p) => p.likes));
  const avgComments = avg(pub.map((p) => p.comments));
  const avgViews = avg(pub.map((p) => p.views));
  const engagementRate = avgViews
    ? Math.round(((avgLikes + avgComments) / avgViews) * 1000) / 10
    : 0;

  // По рубрикам
  const byCat = new Map<string, Post[]>();
  for (const p of pub) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  const categories: CategoryStat[] = [...byCat.entries()]
    .map(([category, list]) => ({
      category,
      posts: list.length,
      avgLikes: avg(list.map((p) => p.likes)),
      avgComments: avg(list.map((p) => p.comments)),
      avgViews: avg(list.map((p) => p.views)),
    }))
    .sort((a, b) => b.avgLikes - a.avgLikes);

  // По часам публикации
  const byHour = new Map<number, Post[]>();
  for (const p of pub) {
    if (!p.publishedAt) continue;
    const h = new Date(p.publishedAt).getHours();
    const list = byHour.get(h) ?? [];
    list.push(p);
    byHour.set(h, list);
  }
  const hours: HourStat[] = [...byHour.entries()]
    .map(([hour, list]) => ({ hour, posts: list.length, avgLikes: avg(list.map((p) => p.likes)) }))
    .sort((a, b) => a.hour - b.hour);
  const bestHour = hours.length
    ? [...hours].sort((a, b) => b.avgLikes - a.avgLikes)[0].hour
    : null;

  // Длина текста
  const buckets = [
    { label: "до 120 слов", min: 0, max: 120 },
    { label: "120–200 слов", min: 120, max: 200 },
    { label: "200–280 слов", min: 200, max: 280 },
    { label: "280+ слов", min: 280, max: 99999 },
  ];
  const lengthStats = buckets
    .map((b) => {
      const list = pub.filter((p) => {
        const w = p.text.split(/\s+/).length;
        return w >= b.min && w < b.max;
      });
      return { label: b.label, n: list.length, avgLikes: avg(list.map((p) => p.likes)) };
    })
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avgLikes - a.avgLikes);
  const bestLength = lengthStats.length ? lengthStats[0].label : null;

  // Влияние приёмов
  const questionBoost = boost(
    pub.filter((p) => p.text.includes("?")),
    pub.filter((p) => !p.text.includes("?")),
  );
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const emojiBoost = boost(
    pub.filter((p) => (p.text.match(new RegExp(emojiRe, "gu")) ?? []).length >= 5),
    pub.filter((p) => (p.text.match(new RegExp(emojiRe, "gu")) ?? []).length < 5),
  );
  const imageBoost = boost(
    pub.filter((p) => Boolean(p.imageUrl)),
    pub.filter((p) => !p.imageUrl),
  );

  // Рекомендации
  const recommendations: string[] = [];
  if (categories.length > 1) {
    const best = categories[0];
    const worst = categories[categories.length - 1];
    recommendations.push(
      `Рубрика «${best.category}» собирает ${best.avgLikes} лайков в среднем — это лучший результат. Делайте таких постов больше.`,
    );
    if (worst.avgLikes < best.avgLikes * 0.6) {
      recommendations.push(
        `Рубрика «${worst.category}» отстаёт (${worst.avgLikes} лайков) — стоит сменить подачу или сократить частоту.`,
      );
    }
  }
  if (bestHour !== null) {
    recommendations.push(
      `Лучшее время публикации — около ${String(bestHour).padStart(2, "0")}:00. Поставьте этот слот в расписание.`,
    );
  }
  if (bestLength) recommendations.push(`Оптимальная длина поста: ${bestLength}.`);
  if (questionBoost !== null && questionBoost > 10) {
    recommendations.push(`Вопрос в конце поста даёт +${questionBoost}% лайков — используйте чаще.`);
  }
  if (imageBoost !== null && imageBoost > 10) {
    recommendations.push(`Посты с картинкой собирают на ${imageBoost}% больше — включите генерацию изображений.`);
  }
  if (followers && avgViews) {
    const reach = Math.round((avgViews / followers) * 100);
    recommendations.push(`Средний охват — ${reach}% от аудитории (${avgViews} просмотров при ${followers} подписчиках).`);
  }
  if (!recommendations.length) {
    recommendations.push("Копим статистику: после 5+ постов появятся точные рекомендации.");
  }

  return {
    hasData: true,
    avgLikes,
    avgComments,
    avgViews,
    engagementRate,
    categories,
    bestCategory: categories[0] ?? null,
    worstCategory: categories.length > 1 ? categories[categories.length - 1] : null,
    hours,
    bestHour,
    bestLength,
    questionBoost,
    emojiBoost,
    imageBoost,
    recommendations,
  };
}

/** Прогноз лайков для черновика на основе накопленной статистики. */
export function predictLikes(
  text: string,
  category: string,
  hasImage: boolean,
  insights: Insights,
): { likes: number; verdict: string; tips: string[] } {
  const base = insights.hasData ? insights.avgLikes : 0;
  let score = base || 10;

  const cat = insights.categories.find((c) => c.category === category);
  if (cat && base) score = score * (cat.avgLikes / Math.max(base, 1));

  // Подсказки согласованы с голосом паблика: без хештегов и без эмодзи-насыщения.
  const tips: string[] = [];
  if (text.includes("?")) score *= 1 + (insights.questionBoost ?? 15) / 100;

  const emojis = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  if (emojis >= 5) score *= 1 + (insights.emojiBoost ?? 8) / 100;
  if (emojis > 1) tips.push("Эмодзи больше одного: по стилю паблика достаточно 0-1 в конце.");

  if (hasImage) score *= 1 + (insights.imageBoost ?? 25) / 100;

  const words = text.split(/\s+/).length;
  if (words < 40) tips.push("Текст очень короткий: проверьте, что мысль доведена до вывода.");
  if (words > 700) tips.push("Текст длиннее 700 слов: сократите или разбейте на два поста.");
  if (/#[\p{L}\p{N}_]+/u.test(text)) tips.push("В тексте есть хештег: по стилю паблика их быть не должно.");

  const likes = Math.max(1, Math.round(score));
  const verdict =
    !insights.hasData
      ? "Прогноз ориентировочный — статистики пока мало"
      : likes > base * 1.15
        ? "Выше вашего среднего 🔥"
        : likes < base * 0.85
          ? "Ниже среднего — стоит доработать"
          : "На уровне вашего среднего";
  return { likes, verdict, tips };
}
