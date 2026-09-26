import type { Post } from "@/db/schema";

/* ============ КОНТЕНТ-СТРАТЕГИЯ ============ */

export const CONTENT_PLAN: Record<number, { category: string; brief: string }> = {
  1: { category: "мотивация", brief: "мотивирующий пост на начало недели, заряд энергии" },
  2: { category: "продажи", brief: "обзор товара/услуги или кейс с результатом" },
  3: { category: "польза", brief: "полезный совет или лайфхак по теме группы" },
  4: { category: "доверие", brief: "история клиента, отзыв или разбор реального случая" },
  5: { category: "развлечение", brief: "лёгкий развлекательный пост, юмор по теме" },
  6: { category: "вовлечение", brief: "пост-вопрос или опрос, который провоцирует комментарии" },
  0: { category: "итоги", brief: "подводим итоги недели и анонсируем следующую" },
};

/** Календарные события — бот реагирует на праздники автоматически. */
const EVENTS: { md: string; name: string }[] = [
  { md: "01-01", name: "Новый год" },
  { md: "02-14", name: "День святого Валентина" },
  { md: "02-23", name: "День защитника Отечества" },
  { md: "03-08", name: "Международный женский день" },
  { md: "05-01", name: "Праздник Весны и Труда" },
  { md: "05-09", name: "День Победы" },
  { md: "06-01", name: "День защиты детей" },
  { md: "09-01", name: "День знаний" },
  { md: "12-31", name: "канун Нового года" },
];

export function eventForDate(d = new Date()) {
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return EVENTS.find((e) => e.md === md) ?? null;
}

export function seasonHint(d = new Date()) {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return "зима: Новый год, подарки, уют";
  if (m <= 4) return "весна: обновление, планы, активность";
  if (m <= 7) return "лето: отпуска, поездки, лёгкость";
  return "осень: возвращение к делам, учёба, планирование";
}

/** Рубрика и бриф на сегодня (или на конкретный день недели). */
export function planForDay(d = new Date()) {
  const plan = CONTENT_PLAN[d.getDay()];
  const event = eventForDate(d);
  return {
    category: event ? "событие" : plan.category,
    brief: event
      ? `праздничный пост: ${event.name}. Поздравь аудиторию тепло и по-человечески`
      : plan.brief,
    event: event?.name ?? null,
  };
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
  if (emojiBoost !== null && emojiBoost > 10) {
    recommendations.push(`Эмодзи работают: +${emojiBoost}% к отклику.`);
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

  const tips: string[] = [];
  if (text.includes("?")) score *= 1 + (insights.questionBoost ?? 15) / 100;
  else tips.push("Добавьте вопрос в конце — это повышает комментарии и охват.");

  const emojis = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  if (emojis >= 5) score *= 1 + (insights.emojiBoost ?? 8) / 100;
  else tips.push("Маловато эмодзи — 5–8 штук делают пост живее.");

  if (hasImage) score *= 1 + (insights.imageBoost ?? 25) / 100;
  else tips.push("Пост без картинки: с иллюстрацией отклик обычно выше.");

  const words = text.split(/\s+/).length;
  if (words < 100) tips.push("Текст короткий — добавьте деталей до 150–250 слов.");
  if (words > 320) tips.push("Текст длинноват — сократите до 250 слов.");
  if (!/#/.test(text)) tips.push("Нет хештегов — добавьте 4–6 для охвата.");

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
