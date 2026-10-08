import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { postImages, posts, slideSpecs, type Post } from "@/db/schema";
import { getSettings, logActivity, pick } from "./core";
import { planForDay } from "./insights";
import { aiComplete, factsBlock, generateVkPost } from "./gpt";
import { getMedia, mediaBuffer } from "./media";
import type { Design } from "./design";
import { resolveDesign, resolveLogo } from "./design-store";
import { renderSlidePng, type SlideSpec } from "./slides";
import { findUnsupportedNumbers, numberSet, sanitizePostText } from "./style";

/** VK позволяет до 10 вложений в одном посте. */
export const MAX_SLIDES = 10;

/* ---------- Хранилище слайдов ---------- */

export async function savePostImages(postId: number, pngs: ArrayBuffer[]) {
  await db.delete(postImages).where(eq(postImages.postId, postId));
  const ids: number[] = [];
  for (let i = 0; i < pngs.length; i++) {
    const row = (
      await db
        .insert(postImages)
        .values({
          postId,
          position: i,
          mimeType: "image/png",
          data: Buffer.from(pngs[i]).toString("base64"),
        })
        .returning({ id: postImages.id })
    )[0];
    ids.push(row.id);
  }
  return ids;
}

export async function listPostImageIds(postIds: number[]) {
  if (!postIds.length) return new Map<number, number[]>();
  const rows = await db
    .select({ id: postImages.id, postId: postImages.postId })
    .from(postImages)
    .where(inArray(postImages.postId, postIds))
    .orderBy(asc(postImages.postId), asc(postImages.position));
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.postId, [...(map.get(r.postId) ?? []), r.id]);
  return map;
}

export async function loadPostImages(postId: number) {
  const rows = await db
    .select()
    .from(postImages)
    .where(eq(postImages.postId, postId))
    .orderBy(asc(postImages.position));
  return rows.map((r) => {
    const buf = Buffer.from(r.data, "base64");
    return {
      bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      mime: r.mimeType,
    };
  });
}

/**
 * Единая точка: какие картинки прикреплять к посту при отправке в VK —
 * слайды карусели, фото из библиотеки или AI-картинка по URL.
 */
export async function resolvePostMedia(post: Post) {
  let imageBytes: ArrayBuffer | null = null;
  let imageMime: string | undefined;
  let images: { bytes: ArrayBuffer; mime: string }[] = [];

  if (post.kind === "carousel" || post.kind === "digest") {
    images = await loadPostImages(post.id);
  }
  if (!images.length && post.mediaId) {
    const row = await getMedia(post.mediaId);
    if (row) {
      imageBytes = mediaBuffer(row);
      imageMime = row.mimeType;
    }
  }
  return {
    imageUrl: imageBytes || images.length ? null : post.imageUrl,
    imageBytes,
    imageMime,
    images: images.length ? images : undefined,
  };
}

/* ---------- Фото-фон (опционально) ---------- */

/**
 * Бесплатные источники реальных фото для фона обложки:
 *  1) Pexels — если задан PEXELS_API_KEY (бесплатный ключ, лицензия без атрибуции);
 *  2) Openverse — без ключа, только public domain / CC0 (атрибуция не нужна).
 * Если ничего не нашлось — слайд остаётся градиентным (это нормальный вариант).
 */
export async function fetchPhotoDataUri(query: string): Promise<string | null> {
  const q = query.trim().slice(0, 80);
  if (!q) return null;
  let url: string | null = null;
  try {
    const key = process.env.PEXELS_API_KEY;
    if (key) {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=square&per_page=8`,
        { headers: { Authorization: key }, signal: AbortSignal.timeout(10000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { photos?: { src?: { large?: string } }[] };
        const list = (data.photos ?? []).map((p) => p.src?.large).filter(Boolean) as string[];
        url = list[Math.floor(Math.random() * list.length)] ?? null;
      }
    }
    if (!url) {
      const res = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&category=photograph&size=large&page_size=12`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: { url?: string; filetype?: string }[] };
        const list = (data.results ?? [])
          .filter((r) => r.url && /^(jpg|jpeg|png)$/i.test(r.filetype ?? ""))
          .map((r) => r.url as string);
        url = list[Math.floor(Math.random() * Math.min(list.length, 6))] ?? null;
      }
    }
    if (!url) return null;
    const img = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!img.ok) return null;
    const ct = (img.headers.get("content-type") ?? "").split(";")[0];
    if (!/^image\/(jpeg|png)$/.test(ct)) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.byteLength < 5_000 || buf.byteLength > 4_500_000) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ---------- JSON из ответа модели ---------- */

export function extractJson<T>(text: string | null): T | null {
  if (!text) return null;
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}

export const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

type StoredSpecs = {
  specs: (Omit<SlideSpec, "photo"> & { hasPhoto?: boolean })[];
  photo: string | null;
};

async function storeSpecs(postId: number, specs: SlideSpec[]) {
  const photo = specs.find((x) => x.photo)?.photo ?? null;
  const data: StoredSpecs = {
    specs: specs.map(({ photo: p, ...rest }) => ({ ...rest, hasPhoto: Boolean(p) })),
    photo,
  };
  const json = JSON.stringify(data);
  await db
    .insert(slideSpecs)
    .values({ postId, data: json })
    .onConflictDoUpdate({ target: slideSpecs.postId, set: { data: json, updatedAt: new Date() } });
}

async function loadSpecs(postId: number): Promise<SlideSpec[] | null> {
  const row = (await db.select().from(slideSpecs).where(eq(slideSpecs.postId, postId)))[0];
  if (!row) return null;
  try {
    const d = JSON.parse(row.data) as StoredSpecs;
    return d.specs.map(({ hasPhoto, ...rest }) => ({ ...rest, photo: hasPhoto ? d.photo : null }));
  } catch {
    return null;
  }
}

/**
 * Рендерит набор слайдов в выбранном дизайне и сохраняет их к посту.
 * design — готовый Design или ссылка («default», id пресета, «saved:12»).
 * Тексты слайдов запоминаются: потом можно сменить дизайн без нового вызова AI.
 */
export async function renderAndSaveSlides(postId: number, specs: SlideSpec[], design?: Design | string | null) {
  const d = typeof design === "object" && design ? design : await resolveDesign(design);
  const logo = await resolveLogo(d);
  const pngs: ArrayBuffer[] = [];
  for (let i = 0; i < specs.length; i++) {
    pngs.push(await renderSlidePng(specs[i], i + 1, specs.length, d, { logo }));
  }
  await storeSpecs(postId, specs);
  return savePostImages(postId, pngs);
}

/** Перерисовать готовую карусель/дайджест в другом дизайне (без AI). */
export async function restylePost(postId: number, design?: Design | string | null) {
  const post = (await db.select().from(posts).where(eq(posts.id, postId)))[0];
  if (!post) throw new Error("Пост не найден");
  if (post.status === "published") throw new Error("Опубликованный пост менять нельзя");
  const specs = await loadSpecs(postId);
  if (!specs?.length) throw new Error("У этого поста нет сохранённых слайдов — создайте карусель заново");
  const d = typeof design === "object" && design ? design : await resolveDesign(design);
  const logo = await resolveLogo(d);
  const pngs: ArrayBuffer[] = [];
  for (let i = 0; i < specs.length; i++) {
    pngs.push(await renderSlidePng(specs[i], i + 1, specs.length, d, { logo }));
  }
  const ids = await savePostImages(postId, pngs);
  await db.update(posts).set({ imageUrl: `/api/post-images/${ids[0]}` }).where(eq(posts.id, postId));
  await logActivity("ДИЗАЙН ИЗМЕНЁН", `Слайды поста #${postId} перерисованы в новом дизайне.`);
  return ids;
}

/* ---------- Карусель для автоматической очереди ---------- */

/** Запасные темы: сформулированы как боль владельца, а не как название раздела. */
const QUEUE_CAROUSEL_TOPICS = [
  "Сайт не продаёт? Начните не с редизайна",
  "Реклама идёт, а заявок нет: пять проверок",
  "Карточка товара не продаёт: что смотреть в первую очередь",
  "Покупатели уходят с формы заказа: где они теряются",
  "Бот отвечает клиентам, а заявок не прибавилось: почему",
  "Лендинг грузится медленно: что чинить сначала",
  "Заявки приходят и пропадают: как не терять обращения",
  "Что автоматизировать в малом бизнесе в первую очередь",
];

export async function generateQueueCarousel(opts?: { plan?: ReturnType<typeof planForDay>; forDate?: Date }) {
  const s = await getSettings();
  const plan = opts?.plan ?? planForDay(opts?.forDate ?? new Date());
  // Рубрика дня задаёт тему, если она про карусель; иначе - универсальная боль аудитории.
  const rubric = plan.format === "carousel" ? plan.brief : "образовательная карусель по боли целевой аудитории";
  const recent = await db
    .select({ text: posts.text })
    .from(posts)
    .where(eq(posts.kind, "carousel"))
    .orderBy(desc(posts.id))
    .limit(8);
  const raw = await aiComplete(
    s.gptKey,
    [
      {
        role: "system",
        content:
          "Ты редактор паблика практика (сайты, карточки товаров, боты, автоматизация). Придумай ОДНУ тему карусели для владельца бизнеса. Тема - это боль или ставка читателя («Сайт не продаёт? Начните не с редизайна»), а не название раздела («Как понять, что пора на редизайн»). Не начинай с «Как», «Про», «Разбор». Ответь одной строкой до 60 знаков, без кавычек, номеров и пояснений.",
      },
      {
        role: "user",
        content: `Ниша и аудитория: ${clip(s.instruction, 1500) || "сайты, карточки товаров, боты и автоматизация"}\nРубрика: ${rubric}\n${factsBlock(s.factsBank)}${recent.length ? `\nУже были темы (не повторять): ${recent.map((r) => clip(r.text, 80)).join(" | ")}` : ""}`,
      },
    ],
    120,
    { temperature: 0.9 },
  );
  let topic = (raw ?? "").replace(/["«»\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!topic) topic = pick(QUEUE_CAROUSEL_TOPICS);
  // Типографическая обложка по умолчанию: сток-фото не связано с хуком и делает ленту безликой.
  return generateCarousel({ topic, theme: "default", photos: false, plan });
}

/* ---------- Образовательная карусель по теме ---------- */

type AiSlide = {
  kind?: string;
  title?: string;
  body?: string;
  items?: unknown[];
  left?: unknown;
  right?: unknown;
  stats?: unknown[];
  question?: string;
  answer?: string;
};
type CarouselJson = {
  cover?: { title?: string; subtitle?: string };
  slides?: AiSlide[];
  cta?: { title?: string; body?: string; button?: string };
  outro?: { title?: string; body?: string };
  photoQuery?: string;
};

/* ---------- Конструктор карусели из шаблонов (без AI) ---------- */

const SPEC_KINDS = ["cover", "point", "outro", "checklist", "steps", "compare", "stats", "quote", "code", "cta", "timeline", "faq", "price", "bars", "ticker", "logos"];

export function normalizeSpec(input: unknown): SlideSpec | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = (SPEC_KINDS.includes(String(i.kind)) ? String(i.kind) : "point") as SlideSpec["kind"];
  const items = Array.isArray(i.items)
    ? (i.items as unknown[]).map((x) => clip(x, 90)).filter(Boolean).slice(0, 6)
    : undefined;
  const stats = Array.isArray(i.stats)
    ? (i.stats as Record<string, unknown>[])
        .map((x) => ({ value: clip(x?.value, 16), label: clip(x?.label, 60) }))
        .filter((x) => x.value)
        .slice(0, 3)
    : undefined;
  const cmp = (v: unknown) => {
    const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const list = Array.isArray(c.items) ? (c.items as unknown[]).map((x) => clip(x, 90)).filter(Boolean).slice(0, 4) : [];
    return { title: clip(c.title, 40), items: list };
  };
  const codeLines = Array.isArray(i.codeLines)
    ? (i.codeLines as unknown[]).map((x) => String(x ?? "").slice(0, 96)).filter(Boolean).slice(0, 9)
    : undefined;

  const spec: SlideSpec = {
    kind,
    title: clip(i.title, 90),
    body: clip(i.body, 260) || undefined,
    label: clip(i.label, 40) || undefined,
    items: items?.length ? items : undefined,
    stats: stats?.length ? stats : undefined,
    left: kind === "compare" ? cmp(i.left) : undefined,
    right: kind === "compare" ? cmp(i.right) : undefined,
    author: clip(i.author, 60) || undefined,
    codeLines: codeLines?.length ? codeLines : undefined,
    button: clip(i.button, 40) || undefined,
    bars: Array.isArray(i.bars)
      ? (i.bars as Record<string, unknown>[])
          .map((x) => ({ label: clip(x?.label, 24), value: Math.max(0, Math.min(100000, Number(x?.value) || 0)) }))
          .filter((x) => x.label)
          .slice(0, 5)
      : undefined,
    question: clip(i.question, 120) || undefined,
    answer: clip(i.answer, 300) || undefined,
    price: clip(i.price, 20) || undefined,
    period: clip(i.period, 40) || undefined,
    tags: Array.isArray(i.tags) ? (i.tags as unknown[]).map((x) => clip(x, 24)).filter(Boolean).slice(0, 8) : undefined,
  };
  const hasContent =
    spec.title ||
    spec.body ||
    spec.items?.length ||
    spec.stats?.length ||
    spec.codeLines?.length ||
    spec.left?.items.length ||
    spec.right?.items.length ||
    spec.bars?.length ||
    spec.tags?.length ||
    spec.question ||
    spec.price;
  return hasContent ? spec : null;
}

/** Собирает карусель из отредактированных слайдов конструктора (без вызова AI). */
export async function buildCarousel(opts: {
  caption?: string;
  slides?: unknown[];
  theme?: string;
  design?: unknown;
}) {
  const specs = (opts.slides ?? []).map(normalizeSpec).filter((x): x is SlideSpec => Boolean(x)).slice(0, MAX_SLIDES);
  if (specs.length < 2) throw new Error("Нужно минимум 2 слайда с содержимым");
  const caption = sanitizePostText(String(opts.caption ?? "").slice(0, 4000));
  const text =
    caption || `${specs[0].title || "Разбор в карусели."}\n\nСмотрите подробности в слайдах — пишите вопросы в сообщения группы.`;
  const post = (
    await db
      .insert(posts)
      .values({ text, status: "draft", kind: "carousel", category: "карусель" })
      .returning()
  )[0];
  const design = await resolveDesign(opts.theme, opts.design);
  const ids = await renderAndSaveSlides(post.id, specs, design);
  const updated = (
    await db.update(posts).set({ imageUrl: `/api/post-images/${ids[0]}` }).where(eq(posts.id, post.id)).returning()
  )[0];
  await logActivity("КАРУСЕЛЬ СОБРАНА", `Конструктор шаблонов: черновик #${post.id}, слайдов: ${specs.length}.`);
  return { post: updated, slideIds: ids };
}

/** Виды слайдов, которые ИИ может ставить в середину карусели. */
const AI_MID_KINDS = ["point", "checklist", "steps", "compare", "stats", "faq"];

/** Обложка - одна мысль: не «Как…», не «Про…», не «Разбор…». */
export function coverProblem(title: string): string {
  const t = title.trim();
  if (!t) return "пустой заголовок обложки";
  if (/^(как|про|разбор|почему|что такое|топ|гид)(?![а-яё])/i.test(t)) return "обложка начинается с названия раздела («Как…», «Про…», «Разбор…»)";
  if (t.length > 55) return "заголовок обложки длиннее 45 знаков";
  return "";
}

/** Ужимает слайд под читаемость с телефона (текст до ~110 знаков). */
function tightenSpec(spec: SlideSpec, statsAllowed: Set<string>): SlideSpec {
  const out: SlideSpec = { ...spec, title: clip(spec.title, 55), body: spec.body ? clip(spec.body, 120) : undefined };
  if (out.items) out.items = out.items.map((x) => clip(x, 75)).slice(0, out.kind === "steps" ? 4 : 5);
  if (out.left) out.left = { title: clip(out.left.title, 30), items: out.left.items.map((x) => clip(x, 60)).slice(0, 3) };
  if (out.right) out.right = { title: clip(out.right.title, 30), items: out.right.items.map((x) => clip(x, 60)).slice(0, 3) };
  if (out.kind === "stats") {
    // Статистика только из фактов владельца: иначе слайд превращается в обычный.
    const ok = (out.stats ?? []).length > 0 && (out.stats ?? []).every((x) => statsAllowed.has(x.value.replace(/[^\d.,]/g, "").replace(",", ".")));
    if (!ok) {
      const first = out.stats?.[0];
      out.kind = "point";
      out.body = out.body || (first ? clip(first.label, 110) : undefined);
      out.stats = undefined;
    }
  }
  return out;
}

export async function generateCarousel(opts: {
  topic: string;
  slides?: number;
  theme?: string;
  design?: unknown;
  photos?: boolean;
  plan?: ReturnType<typeof planForDay>;
}) {
  const s = await getSettings();
  const topic = opts.topic.trim();
  if (!topic) throw new Error("Укажите тему карусели");
  // Между обложкой и финалом: «ставка», разбор, «что сделать завтра».
  const n = Math.min(MAX_SLIDES - 2, Math.max(4, Math.round(opts.slides ?? 6)));
  const facts = s.factsBank ?? "";

  const system = `Ты делаешь слайды карусели для паблика ВКонтакте от лица практика. Услуги и аудитория: ${clip(s.instruction, 1500) || "сайты, карточки товаров, боты и автоматизация; читатель - владелец бизнеса"}. Читатель листает на телефоне и тратит 1-2 секунды на слайд.
Пиши по-русски, коротко, без эмодзи, хештегов и markdown. Числа только из БАНКА ФАКТОВ или расчёта с пометкой «допустим». Не выдумывай исследования, проценты, имена и истории клиентов.
На слайде одна мысль. Заголовок слайда до 45 знаков, текст до 110 знаков. Не нумеруй слайды в тексте.
${factsBlock(facts)}
Отвечай ТОЛЬКО валидным JSON без пояснений.`;

  const baseUser = `Тема: ${topic}
Построй дугу из ${n} слайдов между обложкой и финалом:
1) обложка (cover): ОДНА мысль до 45 знаков - боль, противоречие или цена ошибки. Не название темы, не «Как…», не «Про…», не «Разбор…». Подзаголовок до 40 знаков или пустая строка.
2) первый слайд - «ставка» (point): почему это стоит денег или заявок. Он подтверждает обложку; без него обложка превращается в кликбейт.
3) слайды разбора: один шаг, одна ошибка или один критерий на слайд. Выбирай вид слайда под содержание: point, checklist (items до 5, каждый до 70 знаков), steps (items до 4), compare (left и right по 3 пункта), stats (только если число из банка фактов), faq (question и answer).
4) последний слайд перед финалом - «что сделать завтра» (point): одно действие на 5-10 минут.
Финал cta: title - конкретное действие («Пришлите ссылку»), body - что человек получит и что нужно прислать (до 100 знаков), button до 25 знаков.
Один и тот же вид слайда не больше трёх раз подряд.
Формат JSON:
{"cover":{"title":"","subtitle":""},
"slides":[{"kind":"point|checklist|steps|compare|stats|faq","title":"","body":"","items":[],"left":{"title":"","items":[]},"right":{"title":"","items":[]},"stats":[{"value":"","label":""}],"question":"","answer":""}],
"cta":{"title":"","body":"","button":""},
"photoQuery":"2-3 слова по-английски (только если нужен фон)"}`;

  let data: CarouselJson | null = null;
  let raw: string | null = null;
  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await aiComplete(
      s.gptKey,
      [
        { role: "system", content: system },
        { role: "user", content: baseUser + (note ? `\n\nЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ: ${note}` : "") },
      ],
      1800,
      { temperature: 0.7 },
    );
    data = extractJson<CarouselJson>(raw);
    const usable = Boolean(data?.cover?.title) && (data?.slides ?? []).filter((x) => x?.title).length >= 2;
    if (!usable) {
      note = "верни валидный JSON строго в заданном формате";
      continue;
    }
    const problem = coverProblem(String(data?.cover?.title ?? ""));
    if (problem && attempt === 0) {
      note = `${problem}. Перепиши обложку: одна мысль-боль до 45 знаков.`;
      continue;
    }
    break;
  }
  const pts = (data?.slides ?? []).filter((x) => x?.title).slice(0, n);
  if (!data?.cover?.title || pts.length < 2) {
    throw new Error(
      raw === null ? "AI недоступен: проверьте AI API Key в настройках" : "Модель вернула неразборчивый ответ - попробуйте ещё раз",
    );
  }

  const photo = opts.photos ? await fetchPhotoDataUri(clip(data.photoQuery, 60) || topic) : null;
  const statsAllowed = numberSet(facts);
  const mid: SlideSpec[] = pts.map((p) => {
    const kind = AI_MID_KINDS.includes(String(p.kind)) ? String(p.kind) : "point";
    const spec = normalizeSpec({ ...p, kind }) ?? ({ kind: "point", title: clip(p.title, 55), body: clip(p.body, 120) } as SlideSpec);
    return tightenSpec(spec, statsAllowed);
  });
  const ctaIn = data.cta ?? data.outro ?? {};
  const specs: SlideSpec[] = [
    { kind: "cover", title: clip(data.cover.title, 55), body: clip(data.cover.subtitle, 45) || undefined, photo },
    ...mid,
    {
      kind: "cta",
      title: clip(ctaIn.title, 45) || "Пришлите ссылку",
      body: clip(ctaIn.body, 110) || "Посмотрю первый экран и форму и напишу две правки.",
      button: clip((ctaIn as { button?: string }).button, 25) || "Написать в сообщения",
      photo,
    },
  ];

  // Подпись: роль «охват и сохранения», с учётом прошлых подписей и банка фактов.
  const recentCaps = (
    await db.select({ text: posts.text }).from(posts).where(eq(posts.kind, "carousel")).orderBy(desc(posts.id)).limit(10)
  ).map((r) => r.text);
  const cap = await generateVkPost({
    instruction: s.instruction,
    tone: s.tone,
    topic: `Подпись к карусели на тему «${topic}». Назови боль и пообещай конкретный результат слайдов, не пересказывая их.`,
    apiKey: s.gptKey,
    length: "caption",
    recent: recentCaps,
    facts,
    cta: 2,
  });
  const text = sanitizePostText(cap.text);

  // Проверка чисел по всему тексту карусели: подпись + слайды.
  const slideText = specs
    .map((x) => [x.title, x.body, ...(x.items ?? []), x.question, x.answer, ...(x.left?.items ?? []), ...(x.right?.items ?? [])].filter(Boolean).join(". "))
    .join("\n\n");
  const bad = findUnsupportedNumbers(`${text}\n\n${slideText}`, facts);
  const reviewNote = bad.length ? `числа без опоры на банк фактов или расчёт: ${bad.slice(0, 5).join(", ")}` : "";

  const post = (
    await db
      .insert(posts)
      .values({ text, status: "draft", kind: "carousel", category: opts.plan?.category ?? "карусель", size: "carousel", reviewNote })
      .returning()
  )[0];
  const design = await resolveDesign(opts.theme, opts.design);
  const ids = await renderAndSaveSlides(post.id, specs, design);
  const updated = (
    await db.update(posts).set({ imageUrl: `/api/post-images/${ids[0]}` }).where(eq(posts.id, post.id)).returning()
  )[0];
  await logActivity(
    "КАРУСЕЛЬ СОЗДАНА",
    `Черновик #${post.id}: «${topic}», слайдов: ${specs.length}${reviewNote ? ` · НУЖНА ПРОВЕРКА: ${reviewNote}` : ""}.`,
    reviewNote ? "info" : "success",
  );
  return { post: updated, slideIds: ids };
}
