import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { competitors, posts, type Competitor } from "@/db/schema";
import { getSettings, logActivity } from "./core";
import { aiComplete } from "./gpt";
import { webSearch } from "./research";
import { cleanGroupId, isRealVkToken, resolveServiceToken, vkApiDetailed } from "./vk";

/* ================= АНАЛИЗ КОНКУРЕНТОВ ================= */

export type CompetitorPost = {
  text: string;
  likes: number;
  comments: number;
  reposts: number;
  views: number;
  date: number;
  isPinned?: boolean;
};

export type CompetitorIntel = {
  groupId: string;
  name: string;
  followers: number;
  avgLikes: number;
  postsWeek: number;
  /** Вовлечённость: лайки+комменты на 1000 просмотров. */
  err: number;
  bestHours: number[];
  topFormats: { format: string; count: number; avgLikes: number }[];
  topPosts: CompetitorPost[];
  avgLength: number;
  usesEmoji: boolean;
  usesQuestions: number; // % постов с вопросом
};

/** Определяем формат поста по тексту — для выводов «что у них заходит». */
function detectFormat(text: string): string {
  const t = text.toLowerCase();
  if (/^\s*\d+[\.\)]\s/m.test(text) || /\n\s*[-–—]\s/.test(text)) return "список/чек-лист";
  if (/\?/.test(text.slice(0, 160))) return "вопрос-вовлечение";
  if (/(кейс|клиент|результат|было.*стало|до и после)/.test(t)) return "кейс";
  if (/(скидк|акци|успей|только сегодня|цена|бесплатн)/.test(t)) return "оффер/акция";
  if (/(история|однажды|вчера|помню)/.test(t)) return "история";
  if (/(как |почему |что делать|инструкц|гайд|разбор)/.test(t)) return "польза/гайд";
  if (text.length < 300) return "короткий пост";
  return "лонгрид";
}

/** Глубокий сбор данных по сообществу конкурента. */
export async function fetchCompetitorIntel(
  token: string,
  groupId: string,
): Promise<CompetitorIntel | null> {
  const isNumeric = /^\d+$/.test(groupId);
  const info = await vkApiDetailed<{
    groups?: { id?: number; name?: string; members_count?: number }[];
  }>(token, "groups.getById", { group_id: groupId, fields: "members_count" });
  const group = info.data?.groups?.[0];
  if (!group) return null;

  const wall = await vkApiDetailed<{ items?: (CompetitorPost & { is_pinned?: number })[] }>(
    token,
    "wall.get",
    isNumeric
      ? { owner_id: `-${cleanGroupId(groupId)}`, count: "60" }
      : { domain: groupId, count: "60" },
  );

  type RawItem = {
    text?: string;
    date?: number;
    likes?: { count: number };
    comments?: { count: number };
    reposts?: { count: number };
    views?: { count: number };
    is_pinned?: number;
  };
  const raw = ((wall.data?.items ?? []) as unknown as RawItem[]).filter((i) => i.text);
  const items: CompetitorPost[] = raw.map((i) => ({
    text: i.text ?? "",
    likes: i.likes?.count ?? 0,
    comments: i.comments?.count ?? 0,
    reposts: i.reposts?.count ?? 0,
    views: i.views?.count ?? 0,
    date: i.date ?? 0,
    isPinned: Boolean(i.is_pinned),
  }));

  const weekAgo = Date.now() / 1000 - 7 * 86400;
  const recent = items.filter((i) => i.date >= weekAgo);
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

  // Лучшие часы публикаций по вовлечённости
  const hourMap = new Map<number, number[]>();
  for (const i of items) {
    const h = new Date(i.date * 1000).getHours();
    hourMap.set(h, [...(hourMap.get(h) ?? []), i.likes]);
  }
  const bestHours = [...hourMap.entries()]
    .map(([h, likes]) => ({ h, a: avg(likes) }))
    .sort((x, y) => y.a - x.a)
    .slice(0, 3)
    .map((x) => x.h);

  // Форматы
  const fmtMap = new Map<string, number[]>();
  for (const i of items) {
    const f = detectFormat(i.text);
    fmtMap.set(f, [...(fmtMap.get(f) ?? []), i.likes]);
  }
  const topFormats = [...fmtMap.entries()]
    .map(([format, likes]) => ({ format, count: likes.length, avgLikes: avg(likes) }))
    .sort((a, b) => b.avgLikes - a.avgLikes)
    .slice(0, 4);

  const totalViews = items.reduce((a, i) => a + i.views, 0);
  const totalEng = items.reduce((a, i) => a + i.likes + i.comments, 0);

  return {
    groupId,
    name: group.name ?? groupId,
    followers: group.members_count ?? 0,
    avgLikes: avg(items.map((i) => i.likes)),
    postsWeek: recent.length,
    err: totalViews ? Math.round((totalEng / totalViews) * 1000) / 10 : 0,
    bestHours,
    topFormats,
    topPosts: items.slice().sort((a, b) => b.likes - a.likes).slice(0, 5),
    avgLength: avg(items.map((i) => i.text.length)),
    usesEmoji:
      items.filter((i) => /[\u{1F300}-\u{1FAFF}]/u.test(i.text)).length > items.length / 2,
    usesQuestions: items.length
      ? Math.round((items.filter((i) => i.text.includes("?")).length / items.length) * 100)
      : 0,
  };
}

/* ================= ТРЕНДЫ ================= */

export type TrendTopic = {
  title: string;
  why: string;
  angle: string;
  source: "competitors" | "web" | "own";
  heat: number; // 1..5
};

/** AFK-мониторинг: что обсуждают и что стоит писать. */
export async function detectTrends(): Promise<{
  topics: TrendTopic[];
  summary: string;
  live: boolean;
}> {
  const s = await getSettings();
  const live = isRealVkToken(resolveServiceToken(s.vkServiceToken));

  // 1. Успешные посты конкурентов
  const comps = await db.select().from(competitors);
  const compSignals: string[] = [];
  for (const c of comps) {
    if (c.topPostText) {
      compSignals.push(
        `«${c.name || c.groupId}» (${c.followers} подписчиков, ${c.topPostLikes} лайков на лучшем посте): ${c.topPostText.slice(0, 300)}`,
      );
    }
  }

  // 2. Свои удачные темы
  const mine = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.likes))
    .limit(5);
  const mySignals = mine
    .filter((p) => p.likes > 0)
    .map((p) => `Мой пост (${p.likes} лайков, рубрика ${p.category}): ${p.text.slice(0, 200)}`);

  // 3. Свежее из интернета по нише
  // Ниша берётся из ключевых слов инструкции, а не из первых 100 символов промпта.
  const nicheWords = (s.instruction.match(/(сайт[а-яёa-z]*|приложени[а-яёa-z]*|лендинг[а-яёa-z]*|дизайн[а-яёa-z]*|брендинг[а-яёa-z]*|интеграци[а-яёa-z]*|чат-бот[а-яёa-z]*|автоматизаци[а-яёa-z]*|разработк[а-яёa-z]*|магазин[а-яёa-z]*|MVP)/gi) ?? [])
    .map((w) => w.toLowerCase());
  const niche = [...new Set(nicheWords)].slice(0, 4).join(", ") || "разработка сайтов и приложений для бизнеса";
  const hits = await webSearch(
    `${niche} для бизнеса 2026 ошибки конверсия советы предпринимателям`,
  );
  const webSignals = hits
    .slice(0, 5)
    .map((h) => `${h.title}: ${h.snippet.slice(0, 200)}`);

  const context = [
    compSignals.length ? `ЧТО ЗАШЛО У КОНКУРЕНТОВ:\n${compSignals.join("\n")}` : "",
    mySignals.length ? `МОИ УДАЧНЫЕ ПОСТЫ:\n${mySignals.join("\n")}` : "",
    webSignals.length ? `СВЕЖЕЕ ИЗ ИНТЕРНЕТА:\n${webSignals.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ai = await aiComplete(
    s.gptKey,
    [
      {
        role: "system",
        content: `Ты — контент-стратег группы ВКонтакте в нише: ${niche}.
Задача: на основе сигналов предложи 5 тем для постов, которые с высокой вероятностью зайдут.
Формат ответа — строго JSON-массив без пояснений:
[{"title":"тема 4-8 слов","why":"почему сейчас зайдёт, 1 предложение","angle":"под каким углом подать, 1 предложение","heat":1-5}]
Темы должны быть конкретными и применимыми в этой нише, без общих слов.`,
      },
      { role: "user", content: context || `Сигналов мало. Предложи 5 вечнозелёных тем для ниши: ${niche}` },
    ],
    900,
  );

  let topics: TrendTopic[] = [];
  if (ai) {
    try {
      const jsonStr = ai.slice(ai.indexOf("["), ai.lastIndexOf("]") + 1);
      const parsed = JSON.parse(jsonStr) as {
        title?: string;
        why?: string;
        angle?: string;
        heat?: number;
      }[];
      topics = parsed.slice(0, 6).map((t) => ({
        title: String(t.title ?? "").slice(0, 120),
        why: String(t.why ?? "").slice(0, 240),
        angle: String(t.angle ?? "").slice(0, 240),
        source: compSignals.length ? "competitors" : webSignals.length ? "web" : "own",
        heat: Math.min(5, Math.max(1, Number(t.heat) || 3)),
      }));
    } catch {
      topics = [];
    }
  }

  if (!topics.length) {
    topics = [
      {
        title: "Почему дешёвый сайт обходится дороже",
        why: "Вечная боль клиентов — сравнение цен без понимания сути",
        angle: "Контр-аксиома: сравнить два подхода и показать скрытые издержки",
        source: "own",
        heat: 4,
      },
      {
        title: "Три ошибки в форме заявки",
        why: "Практическая польза, легко сохранить",
        angle: "Короткий список с выводом в конце",
        source: "own",
        heat: 4,
      },
      {
        title: "AI в поддержке: где реально работает",
        why: "Тема на слуху, но мало конкретики",
        angle: "Разделить на «работает» и «не работает» из своего опыта",
        source: "own",
        heat: 5,
      },
    ];
  }

  const summary =
    (compSignals.length ? `Проанализировано конкурентов: ${comps.length}. ` : "") +
    (mySignals.length ? `Учтены ваши ${mySignals.length} лучших постов. ` : "") +
    (webSignals.length ? `Просканировано источников: ${webSignals.length}.` : "");

  return { topics, summary: summary || "Сигналов мало — предложены базовые темы ниши.", live };
}

/** AFK-цикл: обновить конкурентов и записать вывод в журнал. */
export async function runCompetitorScan(): Promise<{
  scanned: number;
  insights: string[];
  live: boolean;
}> {
  const s = await getSettings();
  const serviceToken = resolveServiceToken(s.vkServiceToken);
  if (!isRealVkToken(serviceToken)) return { scanned: 0, insights: [], live: false };

  const rows = await db.select().from(competitors);
  const insights: string[] = [];
  let scanned = 0;

  for (const row of rows) {
    const intel = await fetchCompetitorIntel(serviceToken, row.groupId).catch(() => null);
    if (!intel) {
      insights.push(
        `«${row.name || row.groupId}»: сообщество не найдено — проверьте короткое имя или ID.`,
      );
      continue;
    }
    scanned++;
    // Стена закрыта/пуста (или ключ без доступа) — сообщаем, но не падаем.
    if (!intel.topPosts.length) {
      insights.push(
        `«${intel.name}»: ${intel.followers} подписчиков, но стена недоступна (закрытое сообщество или нет публичных постов) — пропущено.`,
      );
    }
    await db
      .update(competitors)
      .set({
        name: intel.name,
        followers: intel.followers,
        avgLikes: intel.avgLikes,
        postsWeek: intel.postsWeek,
        topPostText: intel.topPosts[0]?.text.slice(0, 400) ?? row.topPostText,
        topPostLikes: intel.topPosts[0]?.likes ?? row.topPostLikes,
        lastCheckedAt: new Date(),
      })
      .where(eq(competitors.id, row.id));

    if (intel.topFormats[0]) {
      insights.push(
        `«${intel.name}»: лучше всего заходит формат «${intel.topFormats[0].format}» (${intel.topFormats[0].avgLikes} лайков в среднем)`,
      );
    }
    if (intel.bestHours.length) {
      insights.push(
        `«${intel.name}» публикует удачнее всего в ${intel.bestHours.map((h) => `${h}:00`).join(", ")}`,
      );
    }
    await new Promise((r) => setTimeout(r, 400)); // rate limit
  }

  if (scanned) {
    await logActivity(
      "КОНКУРЕНТЫ ПРОАНАЛИЗИРОВАНЫ",
      `Сообществ: ${scanned}. ${insights.slice(0, 2).join("; ")}`,
      "info",
    );
  }
  return { scanned, insights, live: true };
}

export async function listCompetitorRows(): Promise<Competitor[]> {
  return db.select().from(competitors).orderBy(desc(competitors.avgLikes));
}
