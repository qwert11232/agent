import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { postImages, posts, slideSpecs, type Post } from "@/db/schema";
import { getSettings, logActivity } from "./core";
import { aiComplete, generateVkPost } from "./gpt";
import { getMedia, mediaBuffer } from "./media";
import type { Design } from "./design";
import { resolveDesign, resolveLogo } from "./design-store";
import { renderSlidePng, type SlideSpec } from "./slides";
import { sanitizePostText } from "./style";

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

/* ---------- Образовательная карусель по теме ---------- */

type CarouselJson = {
  cover?: { title?: string; subtitle?: string };
  slides?: { title?: string; body?: string }[];
  outro?: { title?: string; body?: string };
  photoQuery?: string;
};

export async function generateCarousel(opts: {
  topic: string;
  slides?: number;
  theme?: string;
  design?: unknown;
  photos?: boolean;
}) {
  const s = await getSettings();
  const topic = opts.topic.trim();
  if (!topic) throw new Error("Укажите тему карусели");
  const n = Math.min(MAX_SLIDES - 2, Math.max(3, Math.round(opts.slides ?? 6)));

  const system = `Ты — SMM-практик агентства (сайты, приложения, AI), делаешь слайды образовательной карусели для ВКонтакте.
Пиши по-русски, коротко, живым разговорным языком практика от первого лица или на «вы». Без пафоса, без эмодзи, без хештегов, без markdown.
Не выдумывай исследования, проценты и имена клиентов. Каждый слайд — одна мысль, которую можно понять за 5 секунд.
Контекст ниши: ${clip(s.instruction, 500) || "разработка сайтов, приложений и AI"}.
Отвечай ТОЛЬКО валидным JSON без пояснений.`;
  const user = `Тема карусели: ${topic}
Нужно ровно ${n} содержательных слайдов.
Формат JSON:
{"cover":{"title":"цепляющий заголовок до 50 знаков","subtitle":"до 90 знаков"},
"slides":[{"title":"суть до 50 знаков","body":"пояснение с практическим советом до 170 знаков"}],
"outro":{"title":"финальная мысль до 45 знаков","body":"мягкий призыв (сохранить/написать в сообщения группы) до 100 знаков"},
"photoQuery":"2-3 слова по-английски для поиска фонового фото"}`;

  const raw = await aiComplete(s.gptKey, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], 1400);
  const data = extractJson<CarouselJson>(raw);
  const pts = (data?.slides ?? []).filter((x) => x?.title).slice(0, n);
  if (!data?.cover?.title || pts.length < 2) {
    throw new Error(
      raw === null
        ? "AI недоступен: проверьте AI API Key в настройках"
        : "Модель вернула неразборчивый ответ — попробуйте ещё раз",
    );
  }

  const photo = opts.photos ? await fetchPhotoDataUri(clip(data.photoQuery, 60) || topic) : null;
  const label = "Карусель";
  const specs: SlideSpec[] = [
    { kind: "cover", title: clip(data.cover.title, 70), body: clip(data.cover.subtitle, 120), label, photo },
    ...pts.map((p): SlideSpec => ({ kind: "point", title: clip(p.title, 70), body: clip(p.body, 220), label })),
    {
      kind: "outro",
      title: clip(data.outro?.title, 60) || "Сохраните, чтобы не потерять",
      body: clip(data.outro?.body, 130) || "Есть вопросы по вашему проекту — пишите в сообщения группы.",
      label,
      photo,
    },
  ];

  const cap = await generateVkPost({
    instruction: s.instruction,
    tone: s.tone,
    topic: `Короткая подпись к карусели из слайдов на тему «${topic}». Заинтригуй одной мыслью из темы, не пересказывай слайды и не пиши «листайте».`,
    apiKey: s.gptKey,
    variant: 0,
  });
  const text = sanitizePostText(cap.text);

  const post = (
    await db
      .insert(posts)
      .values({ text, status: "draft", kind: "carousel", category: "карусель" })
      .returning()
  )[0];
  const design = await resolveDesign(opts.theme, opts.design);
  const ids = await renderAndSaveSlides(post.id, specs, design);
  const updated = (
    await db
      .update(posts)
      .set({ imageUrl: `/api/post-images/${ids[0]}` })
      .where(eq(posts.id, post.id))
      .returning()
  )[0];
  await logActivity("КАРУСЕЛЬ СОЗДАНА", `Черновик #${post.id}: «${topic}», слайдов: ${specs.length}.`);
  return { post: updated, slideIds: ids };
}
