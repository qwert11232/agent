import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, type Post, type Settings } from "@/db/schema";
import { clip, extractJson, fetchPhotoDataUri, renderAndSaveSlides } from "./carousel";
import { getSettings, logActivity, parseDays, zonedParts } from "./core";
import { aiComplete } from "./gpt";
import { fetchNews, type NewsItem } from "./news";
import { slotEpoch } from "./queue";
import type { SlideSpec } from "./slides";
import { findUnsupportedNumbers, firstLineProblem, VOICE_STYLE } from "./style";
import { resolveDesign } from "./design-store";

/** Персона автора дайджеста: голос практика, позиция вместо пересказа. */
const DIGEST_PERSONA = `ПЕРСОНА ДАЙДЖЕСТА
Ты автор паблика практика: читаешь новости ниши и выбираешь то, что меняет решения владельцев малого и среднего бизнеса (сайты, карточки товаров, чат-боты, автоматизация, платформы и маркетплейсы). Пишешь от первого лица, в голосе из блока выше. Не пересказываешь день, а даёшь позицию: что важно, что нет, что делать.

ЧИСЛА И ИМЕНА (перекрывает общий запрет в части материалов): можно и нужно называть продукты, компании и числа, но ТОЛЬКО из материалов ниже. Из головы ничего не добавляй. Если в материале нет сути, не пиши про него. «Исследование показало» без опоры на материал запрещено. Хештеги, markdown и эмодзи-маркеры запрещены.`;

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
  final?: { title?: string; body?: string };
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

  const system = `${VOICE_STYLE}\n\n${DIGEST_PERSONA}\n\nНИША ВЛАДЕЛЬЦА: ${clip(s.digestNiche, 200)}.\n${clip(s.instruction, 1500)}`;
  const userBase = `Сделай выпуск дайджеста для паблика. Выбери из материалов только прикладное для владельцев бизнеса. Скучное, дубли одной истории и чисто «для программистов» без пользы бизнесу пропусти.

ФОРМАТ ВЫПУСКА (800-1400 знаков)
1) Первая строка (до 90 знаков) - вывод дня: что для владельца бизнеса главное или что можно проигнорировать. Дату и слово «Дайджест» в текст не ставь.
2) «Главное»: одна новость, 3-4 предложения: что случилось (по-русски, простым языком) → что это меняет для владельца (деньги, заявки, время) → что сделать на этой неделе.
3) Ещё две новости по 1-2 предложения каждая (только действительно прикладные; если таких нет, обойдись одной).
4) Одна фраза «Что бы я сделал на вашем месте».
5) Призыв только если новость пересекается с услугами (карточки товаров, сайты, боты, автоматизация): «если у вас карточки на маркетплейсе, напишите в сообщения группы, посмотрю». Иначе без призыва. Не в каждом выпуске.
6) Не вставляй ссылки в текст. Последней строкой, отдельно, строго в формате: ИСТОЧНИКИ: 3,1 (номера использованных материалов; главная новость первой).

МАТЕРИАЛЫ:
${materials}`;

  let raw: string | null = null;
  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await aiComplete(
      s.gptKey,
      [
        { role: "system", content: system },
        { role: "user", content: userBase + (note ? `\n\nЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ: ${note}` : "") },
      ],
      1500,
      { temperature: 0.45 }, // факты: меньше «додумывания»
    );
    if (!raw) break;
    const first = cleanDigestText(raw.replace(/ИСТОЧНИКИ:?\s*[\d,\s]+\s*$/i, ""));
    const problem = firstLineProblem(first);
    if (problem && attempt === 0) {
      note = `${problem}. Первая строка - вывод дня, без даты и слова «Дайджест».`;
      continue;
    }
    break;
  }
  if (!raw) throw new Error("AI недоступен: проверьте AI API Key в настройках");

  // Разбираем номера источников и вычищаем служебную строку.
  const m = /ИСТОЧНИКИ:?\s*([\d,\s]+)\s*$/i.exec(raw.trim());
  const nums = m ? [...new Set(m[1].split(/[,\s]+/).map(Number).filter((x) => x >= 1 && x <= news.length))] : [];
  const used = (nums.length ? nums : [1, 2]).map((i) => news[i - 1]).filter(Boolean);
  let body = cleanDigestText(raw.replace(/ИСТОЧНИКИ:?\s*[\d,\s]+\s*$/i, ""));
  body = body.replace(/https?:\/\/\S+/g, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  // Не более двух ссылок: главная новость и ещё одна.
  body += `\n\nИсточники:\n${used.slice(0, 2).map((u) => cleanUrl(u.url)).join("\n")}`;
  // Числа в дайджесте допустимы только из переданных материалов.
  const unsupported = findUnsupportedNumbers(body.replace(/Источники:[\s\S]*$/, ""), materials);
  const reviewNote = unsupported.length ? `числа не из материалов: ${unsupported.slice(0, 5).join(", ")}` : "";

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
          content: `Преврати дайджест в слайды. Первый слайд после обложки - главная новость, затем по слайду на каждую из остальных (всего ${Math.min(4, Math.max(2, used.length))}).
Формат JSON:
{"cover":{"title":"вывод дня до 45 знаков, одна мысль","subtitle":"до 40 знаков или пусто"},
"slides":[{"title":"суть новости до 45 знаков","body":"что это значит для владельца бизнеса, до 110 знаков"}],
"final":{"title":"Что бы я сделал, до 40 знаков","body":"одно действие на этой неделе, до 110 знаков"},
"photoQuery":"2-3 слова по-английски для фонового фото"}

ДАЙДЖЕСТ:
${body.replace(/Источники:[\s\S]*$/, "")}`,
        },
      ],
      1400,
      { temperature: 0.4 },
    );
    const d = extractJson<SlidesJson>(sj);
    const pts = (d?.slides ?? []).filter((x) => x?.title).slice(0, 4);
    if (d?.cover?.title && pts.length >= 2) {
      const photo = photos ? await fetchPhotoDataUri(clip(d.photoQuery, 60) || "business") : null;
      const tag = `Дайджест · ${label}`;
      specs = [
        { kind: "cover", title: clip(d.cover.title, 55), body: clip(d.cover.subtitle, 45) || undefined, label: tag, photo },
        ...pts.map((p): SlideSpec => ({ kind: "point", title: clip(p.title, 55), body: clip(p.body, 120), label: tag })),
        {
          kind: "cta",
          title: clip(d.final?.title, 45) || "Что бы я сделал",
          body: clip(d.final?.body, 110) || undefined,
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
        reviewNote,
        sources: JSON.stringify(used.map((u) => ({ title: u.title, url: u.url }))),
      })
      .returning()
  )[0];

  let slideIds: number[] = [];
  let result = post;
  if (specs.length) {
    // В дайджесте метка с датой несёт смысл - включаем её поверх дизайна по умолчанию.
    const design = { ...(await resolveDesign(opts?.theme)), showLabel: true };
    slideIds = await renderAndSaveSlides(post.id, specs, design);
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
  const z = zonedParts();
  return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
}

/** Если наступило время дайджеста и сегодня его ещё не было — собираем и публикуем. */
export async function runDigestIfDue(s: Settings) {
  if (!s.digestEnabled) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.digestTime.trim());
  if (!m) return null;
  // Дайджест не каждый день: по умолчанию пн, ср, пт (иначе «баннерная слепота»).
  if (!parseDays(s.digestDays, [1, 3, 5]).includes(zonedParts().weekday)) return null;
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
    if (post.reviewNote) {
      // Число не из материалов: выпуск остаётся черновиком до ручной проверки.
      await db.update(settings).set({ lastDigestDate: today }).where(eq(settings.id, s.id));
      await logActivity("ДАЙДЖЕСТ: НУЖНА ПРОВЕРКА", `Черновик #${post.id} не опубликован: ${post.reviewNote}`, "info");
      return null;
    }
    const { publishPostById } = await import("./actions");
    await publishPostById(post.id, { auto: true, reason: "дайджест по расписанию" });
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
