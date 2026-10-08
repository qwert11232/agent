import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts, type CommentRow } from "@/db/schema";
import { getSettings, logActivity, pick } from "./core";
import { notifyOwner } from "./telegram";
import { leads } from "@/db/schema";
import { aiComplete } from "./gpt";
import { cleanGroupId, isRealVkToken, vkApi } from "./vk";

export type Sentiment = "positive" | "question" | "negative" | "spam" | "neutral";

// Слова «инвестиции» и «ставки» - нормальная лексика владельцев бизнеса («инвестиции в разработку окупятся?»),
// поэтому спамом считаем только явный крипто/казино/заработок-спам и ссылки-приманки.
const SPAM_RE =
  /(заработок|зapaбoт|без вложений|крипт[оа]|казино|порн|xxx|пассивный доход|пиши в лс заработ|\+\d{7,}|http[s]?:\/\/\S+\.(ru|com|net)\/[a-z0-9]{6,})/i;
const NEGATIVE_RE =
  /(обман|кинул|мошенн|верните деньги|ужас|отврат|хамств|развод|жалоб|верните|плохо|разочарован|брак)/i;
const POSITIVE_RE =
  /(спасибо|класс|супер|отличн|круто|нрав|люблю|molodc|молодц|огонь|топ|полезн|благодар|лучш)/i;
const PROFANITY_RE = /(бляд|хуй|пизд|ебан|сука|мраз|гандон|уёб|уеб)/i;
// Лиды по ВАШИМ услугам: сайты, лендинги, карточки товаров, боты, автоматизация, цена, сроки.
const LEAD_RE =
  /(сколько стоит|какая цена|цена разработки|сколько будет стоить|прайс|расценк|стоимость|хочу заказать|хотим заказать|заказать (сайт|бот|чат-?бот|приложение|карточк|лендинг|автоматизац)|нужен (сайт|бот|чат-?бот|лендинг|интернет-?магазин)|нужно приложение|нужна (разработка|автоматизация|карточка|помощь с)|сделать (сайт|бот|чат-?бот|лендинг|приложение|карточк)|разработать|интернет-?магазин|под ключ|коммерческое предложение|есть бюджет|в какие сроки|какие сроки|сколько (делаете|делается)|автоматизир|чат-?бот для|бот для|карточк[а-яёa-z]* товар|лендинг)/i;
// «Не работает форма на сайте»: это не жалоба на вас, а запрос помощи, то есть потенциальный лид.
const BREAK_RE = /(не работает|не открывается|сломал[а-яёa-z]*|слетел[а-яёa-z]*|глючит|не отправляется|не грузится|ошибка|пропали заявки)/i;
const SITE_RE = /(сайт|форм[аеуы]|кнопк|заявк|страниц|лендинг|бот|приложени|карточк|корзин|оплат|магазин)/i;

/** Запрос помощи по сайту/боту/карточке: идёт в лиды, а не в негатив. */
export function isHelpRequest(text: string) {
  return BREAK_RE.test(text) && SITE_RE.test(text);
}
export function isLeadComment(text: string) {
  return LEAD_RE.test(text) || isHelpRequest(text);
}

/** Быстрая классификация без AI (fallback и предфильтр). */
export function classifyComment(text: string): Sentiment {
  const t = text.toLowerCase();
  if (SPAM_RE.test(t) || PROFANITY_RE.test(t)) return "spam";
  if (isHelpRequest(t)) return "question";
  if (NEGATIVE_RE.test(t) || BREAK_RE.test(t)) return "negative";
  if (t.includes("?") || /^(а |как|где|когда|сколько|есть ли|можно|почему|что)/i.test(t.trim()))
    return "question";
  if (POSITIVE_RE.test(t)) return "positive";
  return "neutral";
}

/**
 * Заготовки на случай, когда AI недоступен: без эмодзи, без обещаний, которые система не исполняет
 * («отправим в личку»). На благодарности и нейтральные реплики заготовок нет: реакция лучше дежурного «Спасибо!».
 */
const FALLBACK_REPLIES: Record<Sentiment, string[]> = {
  positive: [],
  question: ["Чтобы ответить точно, нужны детали вашей задачи. Напишите в сообщения группы, посмотрю и отвечу по делу."],
  negative: [],
  neutral: [],
  spam: [],
};
const FALLBACK_LEAD =
  "Чтобы не отвечать наугад, расскажите чуть подробнее о задаче. Напишите в сообщения группы, посмотрю и отвечу по делу.";

/** Системный промпт ответа: голос автора-практика, один вопрос лиду и переход в сообщения. */
export function replySystemPrompt(opts: { faq: string; instruction: string }) {
  return `Ты отвечаешь на комментарий под постом паблика от лица автора-практика: коротко, по делу, без пафоса, без «Здравствуйте, уважаемый клиент». Услуги и аудитория: ${opts.instruction || "сайты, карточки товаров, боты и автоматизация"}.
База знаний (единственный источник фактов о ценах, сроках и условиях): ${opts.faq || "пуста"}.
Правила:
- 1-3 предложения. Эмодзи 0-1, и только если комментатор сам пишет с эмодзи.
- Отвечай по существу того, что написал человек, используя его слова. Не начинай с «Спасибо за вопрос» и «Хороший вопрос».
- Цены, сроки, гарантии называй только из базы знаний. Если там этого нет, скажи, что нужны детали задачи, и предложи написать в сообщения группы.
- Если человек описывает задачу или спрашивает цену (лид): ответь одной полезной мыслью по его ситуации, задай ОДИН уточняющий вопрос и предложи продолжить в сообщениях группы. Не вываливай прайс и не дави.
- Если это благодарность одним-двумя словами, ответ не нужен: верни пустую строку.
- Если это жалоба или конфликт: не отвечай (верни пустую строку), владелец ответит сам.
Верни только текст ответа.`;
}

/** Ответ на комментарий: AI (с учётом FAQ) или заготовка. Пустая строка = отвечать не нужно. */
export async function buildReply(
  text: string,
  sentiment: Sentiment,
  opts: { faq: string; instruction: string; apiKey: string; lead?: boolean },
): Promise<string> {
  if (sentiment === "spam" || sentiment === "negative") return "";
  const out = await aiComplete(
    opts.apiKey,
    [
      { role: "system", content: replySystemPrompt(opts) },
      { role: "user", content: `Комментарий подписчика${opts.lead ? " (потенциальный клиент)" : ""}: «${text}»` },
    ],
    300,
    { temperature: 0.6 },
  );
  if (out !== null) return out.replace(/^["«]|["»]$/g, "").trim();
  if (opts.lead) return FALLBACK_LEAD;
  const list = FALLBACK_REPLIES[sentiment] ?? [];
  return list.length ? pick(list) : "";
}

type VkComment = {
  id: number;
  from_id: number;
  text: string;
  date: number;
};

/** Забираем новые комментарии под опубликованными постами и обрабатываем. */
export async function processComments(): Promise<{
  fetched: number;
  replied: number;
  hidden: number;
  alerts: number;
  live: boolean;
}> {
  const s = await getSettings();
  const gid = cleanGroupId(s.groupId);
  const live = isRealVkToken(s.vkToken) && Boolean(gid);
  if (!live) return { fetched: 0, replied: 0, hidden: 0, alerts: 0, live: false };

  const published = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.id))
    .limit(10);

  const known = new Set(
    (await db.select({ v: comments.vkCommentId }).from(comments)).map((r) => r.v),
  );

  let fetched = 0;
  let replied = 0;
  let hidden = 0;
  let alerts = 0;

  for (const post of published) {
    if (!post.vkPostId) continue;
    const data = await vkApi<{ items?: VkComment[] }>(s.vkToken, "wall.getComments", {
      owner_id: `-${gid}`,
      post_id: post.vkPostId,
      count: "50",
      sort: "desc",
      thread_items_count: "0",
    });
    for (const c of data?.items ?? []) {
      const key = `${post.vkPostId}_${c.id}`;
      if (known.has(key) || !c.text?.trim()) continue;
      fetched++;

      const sentiment = classifyComment(c.text);
      let status = "new";
      let reply: string | null = null;

      if (sentiment === "spam" && s.autoModerate) {
        const ok = await vkApi(s.vkToken, "wall.deleteComment", {
          owner_id: `-${gid}`,
          comment_id: String(c.id),
        });
        status = "hidden";
        hidden++;
        await logActivity(
          "СПАМ УДАЛЁН",
          `Комментарий #${c.id}: «${c.text.slice(0, 60)}»${ok ? "" : " (VK отклонил удаление)"}`,
          "info",
        );
      } else if (isLeadComment(c.text)) {
        // Потенциальный клиент → лиды + уведомление владельцу с готовым черновиком первого ответа
        status = "alert";
        alerts++;
        await db.insert(leads).values({
          vkCommentId: key,
          authorName: `id${c.from_id}`,
          text: c.text,
        });
        await logActivity(
          "ПОТЕНЦИАЛЬНЫЙ КЛИЕНТ",
          `Комментарий с признаками лида: «${c.text.slice(0, 80)}»`,
          "info",
        );
        const replyOpts = { faq: s.faq, instruction: s.instruction, apiKey: s.gptKey, lead: true };
        const draft = await buildReply(c.text, "question", replyOpts).catch(() => "");
        void notifyOwner(
          `🎯 Потенциальный клиент в комментариях!\n\n«${c.text.slice(0, 200)}»\n\nАвтор: id${c.from_id}` +
            (draft ? `\n\nЧерновик первого ответа:\n${draft}` : ""),
        ).catch(() => null);
        if (s.autoReply) reply = draft || null;
      } else if (sentiment === "negative") {
        // Жалоба: публичный ответ бота рискованнее молчания. Только уведомление владельцу.
        status = "alert";
        alerts++;
        await logActivity(
          "НЕГАТИВНЫЙ КОММЕНТАРИЙ",
          `Требует внимания: «${c.text.slice(0, 80)}»`,
          "error",
        );
        void notifyOwner(
          `⚠️ Негативный комментарий, нужно ваше внимание.\n\n«${c.text.slice(0, 200)}»`,
        ).catch(() => null);
      } else if (s.autoReply && sentiment !== "neutral") {
        const text = await buildReply(c.text, sentiment, {
          faq: s.faq,
          instruction: s.instruction,
          apiKey: s.gptKey,
        });
        reply = text || null;
      }

      if (reply) {
        const sent = await vkApi(s.vkToken, "wall.createComment", {
          owner_id: `-${gid}`,
          post_id: post.vkPostId,
          message: reply,
          reply_to_comment: String(c.id),
          from_group: gid,
        });
        if (sent) {
          replied++;
          if (status === "new") status = "replied";
        }
      }

      await db.insert(comments).values({
        vkCommentId: key,
        vkPostId: post.vkPostId,
        authorName: `id${c.from_id}`,
        text: c.text,
        sentiment,
        reply,
        status,
      });
      known.add(key);
    }
  }

  if (fetched) {
    await logActivity(
      "КОММЕНТАРИИ ОБРАБОТАНЫ",
      `Новых: ${fetched}, ответов: ${replied}, скрыто спама: ${hidden}, алертов: ${alerts}.`,
    );
  }
  return { fetched, replied, hidden, alerts, live: true };
}

export async function listComments(): Promise<CommentRow[]> {
  return db.select().from(comments).orderBy(desc(comments.id)).limit(100);
}
