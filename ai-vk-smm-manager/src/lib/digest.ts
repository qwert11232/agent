import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, type Post, type Settings } from "@/db/schema";
import { clip, extractJson, fetchPhotoDataUri, renderAndSaveSlides } from "./carousel";
import { getSettings, logActivity } from "./core";
import { aiComplete } from "./gpt";
import { fetchNews, type NewsItem } from "./news";
import { slotEpoch, tzShiftMs } from "./queue";
import type { SlideSpec } from "./slides";
import { VOICE_STYLE } from "./style";

/** Персона автора дайджеста: SMM-менеджер агентства, голос — из style.ts. */
const DIGEST_PERSONA = `ПЕРСОНА: ты — SMM-менеджер digital-агентства (сайты, приложения, AI-интеграции). Каждый день ты читаешь мировые новости ниши и выбираешь только то, что реально пригодится владельцам бизнеса и стартаперам. Пишешь от первого лица, как живой автор, в голосе из блока выше.

ИСКЛЮЧЕНИЕ ДЛЯ ДАЙДЖЕСТА (перекрывает запреты на числа/имена): можно и нужно называть продукты, компании и числа, но ТОЛЬКО те, что есть в материалах ниже. Из головы ничего не добавлять: если в материале нет сути — не пиши про него. Фразы вроде «исследование показало» без опоры на материал по-прежнему запрещены. Хештеги, markdown и эмодзи-маркеры — по-прежнему запрещены.`;

function dateLabel(d = new Date()) {
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(process.env.SCHEDULE_TZ ? { timeZone: process.env.SCHEDULE_TZ } : {}),
  });
}

function cleanUrl(u: string) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^utm_/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return u;
  }
}

function cleanDigestText(text: string) {
  return text
    .replace(/[\u2011\u2010]/g, "-")
    .replace(/ – /g, " - ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/^\s*[🔹🔸▶️👉➡✔️✅⚡️•◾◽]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function usedUrls(): Promise<Set<string>> {
  const rows = await db
    .select({ sources: posts.sources })
    .from(posts)
    .where(eq(posts.kind, "digest"))
    .orderBy(desc(posts.id))
    .limit(20);
  const set = new Set<string>();
  for (const r of rows) {
    try {
      for (const x of JSON.parse(r.sources ?? "[]") as { url?: string }[]) if (x.url) set.add(x.url);
    } catch {
      /* no-op */
    }
  }
  return set;
}

export type DigestPreview = { items: NewsItem[] };

/** Только сбор новостей — для превью в панели (без AI и публикации). */
export async function previewNews(): Promise<DigestPreview> {
  const s = await getSettings();
  return { items: await fetchNews({ niche: s.digestNiche, exclude: await usedUrls(), limit: 10 }) };
}

type SlidesJson = {
  cover?: { title?: string; subtitle?: string };
  slides?: { title?: string; body?: string }[];
  outro?: { title?: string; body?: string };
  photoQuery?: string;
};

export async function generateDigest(opts?: {
  carousel?: boolean;
  photos?: boolean;
  theme?: string;
}): Promise<{ post: Post; slideIds: number[]; usedModel: "gpt" }> {
  const s = await getSettings();
  const carousel = opts?.carousel ?? s.digestCarousel;
  const photos = opts?.photos ?? s.digestPhotos;

  const news = await fetchNews({ niche: s.digestNiche, exclude: await usedUrls(), limit: 10 });
  if (news.length < 3) throw new Error("Не удалось собрать новости из источников — попробуйте позже");

  const materials = news
    .map(
      (n, i) =>
        `[${i + 1}] ${n.title}\nИсточник: ${n.source}${n.snippet ? `\nСуть: ${n.snippet}` : ""}`,
    )
    .join("\n\n");
  const label = dateLabel();

  const system = `${VOICE_STYLE}\n\n${DIGEST_PERSONA}\n\nНИША ВЛАДЕЛЬЦА: ${clip(s.digestNiche, 200)}. ${clip(s.instruction, 400)}`;
  const user = `Сделай ЕЖЕДНЕВНЫЙ ДАЙДЖЕСТ за ${label}: выбери из материалов 3–5 самых прикладных или по-настоящему интересных новостей для нашей аудитории (владельцы бизнеса, стартаперы, маркетологи). Скучное, дубли и чисто «для программистов» без пользы бизнесу — пропусти.

Формат поста:
- Первая строка: «Дайджест дня, ${label}: » + интригующий заход 2–5 слов.
- Короткий зачин от тебя, 1–2 предложения, с живой интонацией.
- 3–5 пунктов с нумерацией «1.» «2.» ...: сначала что случилось (переведи на русский, простым языком), затем что это значит на практике и как применить — 1–2 предложения. Каждый пункт 2–4 предложения.
- Финальная фраза-ремарка или афоризм (не вопрос к читателю).
- Длина 1200–2300 знаков.
Последней строкой, отдельно, строго в формате: ИСТОЧНИКИ: 3,1,5 (номера использованных материалов).

МАТЕРИАЛЫ:
${materials}`;

  const raw = await aiComplete(
    s.gptKey,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    1500,
  );
  if (!raw) throw new Error("AI недоступен: проверьте AI API Key в настройках");

  // Разбираем номера источников и вычищаем служебную строку.
  const m = /ИСТОЧНИКИ:?\s*([\d,\s]+)\s*$/i.exec(raw.trim());
  const nums = m ? [...new Set(m[1].split(/[,\s]+/).map(Number).filter((x) => x >= 1 && x <= news.length))] : [];
  const used = (nums.length ? nums : [1, 2, 3, 4]).map((i) => news[i - 1]).filter(Boolean);
  let body = cleanDigestText(raw.replace(/ИСТОЧНИКИ:?\s*[\d,\s]+\s*$/i, ""));
  body += `\n\nИсточники:\n${used.map((u) => cleanUrl(u.url)).join("\n")}`;

  // Слайды карусели
  let specs: SlideSpec[] = [];
  if (carousel) {
    const sj = await aiComplete(
      s.gptKey,
      [
        {
          role: "system",
          content:
            "Ты дизайнер-копирайтер каруселей для ВКонтакте. Пиши по-русски, коротко, без эмодзи, хештегов и markdown. Используй ТОЛЬКО факты из переданного дайджеста. Отвечай только валидным JSON.",
        },
        {
          role: "user",
          content: `Преврати дайджест в слайды. На каждую новость из дайджеста — один слайд (всего ${Math.min(5, Math.max(3, used.length))}).
Формат JSON:
{"cover":{"title":"заголовок до 45 знаков про главное в дне","subtitle":"до 80 знаков"},
"slides":[{"title":"суть новости до 55 знаков","body":"что это значит на практике, до 170 знаков"}],
"outro":{"title":"финал до 40 знаков","body":"мягкий призыв сохранить и написать в сообщения группы, до 100 знаков"},
"photoQuery":"2-3 слова по-английски для фонового фото"}

ДАЙДЖЕСТ:
${body.replace(/Источники:[\s\S]*$/, "")}`,
        },
      ],
      1400,
    );
    const d = extractJson<SlidesJson>(sj);
    const pts = (d?.slides ?? []).filter((x) => x?.title).slice(0, 5);
    if (d?.cover?.title && pts.length >= 2) {
      const photo = photos ? await fetchPhotoDataUri(clip(d.photoQuery, 60) || "technology") : null;
      const tag = `Дайджест · ${label}`;
      specs = [
        { kind: "cover", title: clip(d.cover.title, 70), body: clip(d.cover.subtitle, 120) || "Главное в мире digital за день", label: tag, photo },
        ...pts.map((p): SlideSpec => ({ kind: "point", title: clip(p.title, 70), body: clip(p.body, 220), label: tag })),
        {
          kind: "outro",
          title: clip(d.outro?.title, 60) || "Сохраните на потом",
          body: clip(d.outro?.body, 130) || "Завтра будет новая порция. Вопросы по проекту — в сообщения группы.",
          label: tag,
          photo,
        },
      ];
    }
  }

  const post = (
    await db
      .insert(posts)
      .values({
        text: body,
        status: "draft",
        kind: "digest",
        category: "дайджест",
        sources: JSON.stringify(used.map((u) => ({ title: u.title, url: u.url }))),
      })
      .returning()
  )[0];

  let slideIds: number[] = [];
  let result = post;
  if (specs.length) {
    slideIds = await renderAndSaveSlides(post.id, specs, opts?.theme);
    result = (
      await db
        .update(posts)
        .set({ imageUrl: `/api/post-images/${slideIds[0]}` })
        .where(eq(posts.id, post.id))
        .returning()
    )[0];
  }
  await logActivity(
    "ДАЙДЖЕСТ СОБРАН",
    `Черновик #${post.id}: ${used.length} новостей${slideIds.length ? `, карусель из ${slideIds.length} слайдов` : ""}.`,
  );
  return { post: result, slideIds, usedModel: "gpt" };
}

/* ---------- Ежедневный запуск из тика ---------- */

let lastAttemptMs = 0;

function dayKeyInTz() {
  const z = new Date(Date.now() + tzShiftMs());
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** Если наступило время дайджеста и сегодня его ещё не было — собираем и публикуем. */
export async function runDigestIfDue(s: Settings) {
  if (!s.digestEnabled) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.digestTime.trim());
  if (!m) return null;
  const today = dayKeyInTz();
  if (s.lastDigestDate === today) return null;
  if (Date.now() < slotEpoch(new Date(), Math.min(23, Number(m[1])), Math.min(59, Number(m[2])))) return null;
  // Не чаще раза в 15 минут при ошибках.
  if (Date.now() - lastAttemptMs < 15 * 60_000) return null;
  lastAttemptMs = Date.now();

  // Защита от дублей: если дайджест уже вышел сегодня, просто отмечаем день.
  const todayStart = new Date(slotEpoch(new Date(), 0, 0));
  const existing = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.kind, "digest"), eq(posts.status, "published")))
    .orderBy(desc(posts.id))
    .limit(1);
  if (existing.length) {
    const row = (await db.select().from(posts).where(eq(posts.id, existing[0].id)))[0];
    if (row.publishedAt && new Date(row.publishedAt) >= todayStart) {
      await db.update(settings).set({ lastDigestDate: today }).where(eq(settings.id, s.id));
      return null;
    }
  }

  try {
    const { post } = await generateDigest();
    const { publishPostById } = await import("./actions");
    await publishPostById(post.id, { auto: true, reason: "ежедневный дайджест" });
    await db.update(settings).set({ lastDigestDate: today }).where(eq(settings.id, s.id));
    return { postId: post.id };
  } catch (e) {
    await logActivity(
      "ДАЙДЖЕСТ: ОШИБКА",
      e instanceof Error ? e.message.slice(0, 300) : "не удалось собрать дайджест",
      "error",
    );
    return null;
  }
}
