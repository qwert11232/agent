import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts, type CommentRow } from "@/db/schema";
import { getSettings, logActivity, pick } from "./core";
import { aiComplete } from "./gpt";
import { cleanGroupId, isRealVkToken, vkApi } from "./vk";

export type Sentiment = "positive" | "question" | "negative" | "spam" | "neutral";

const SPAM_RE =
  /(заработок|зapaбoт|без вложений|крипт[оа]|казино|ставки|порн|xxx|инвестиц|пассивный доход|пиши в лс заработ|\+\d{7,}|http[s]?:\/\/\S+\.(ru|com|net)\/[a-z0-9]{6,})/i;
const NEGATIVE_RE =
  /(обман|кинул|мошенн|верните деньги|ужас|отврат|хамств|развод|не работает|жалоб|верните|плохо|разочарован|брак)/i;
const POSITIVE_RE =
  /(спасибо|класс|супер|отличн|круто|нрав|люблю|molodc|молодц|огонь|топ|полезн|благодар|лучш)/i;
const PROFANITY_RE = /(бляд|хуй|пизд|ебан|сука|мраз|гандон|уёб|уеб)/i;

/** Быстрая классификация без AI (fallback и предфильтр). */
export function classifyComment(text: string): Sentiment {
  const t = text.toLowerCase();
  if (SPAM_RE.test(t) || PROFANITY_RE.test(t)) return "spam";
  if (NEGATIVE_RE.test(t)) return "negative";
  if (t.includes("?") || /^(а |как|где|когда|сколько|есть ли|можно|почему|что)/i.test(t.trim()))
    return "question";
  if (POSITIVE_RE.test(t)) return "positive";
  return "neutral";
}

const FALLBACK_REPLIES: Record<Sentiment, string[]> = {
  positive: [
    "Спасибо большое! 😊 Очень приятно, что понравилось!",
    "Благодарим за тёплые слова! 💛 Стараемся для вас.",
    "Спасибо! Рады, что материал оказался полезным 🙌",
  ],
  question: [
    "Спасибо за вопрос! Уточним детали и ответим подробно — можете также написать нам в сообщения сообщества 📩",
    "Хороший вопрос! Подробности отправим в личных сообщениях — напишите нам 💬",
  ],
  negative: [
    "Очень жаль, что так получилось 😔 Напишите, пожалуйста, в сообщения сообщества — обязательно разберёмся и поможем.",
    "Извините за неудобства! Давайте разберёмся: напишите нам в ЛС детали, решим вопрос 🙏",
  ],
  neutral: [
    "Спасибо за комментарий! 🙂",
    "Благодарим за участие в обсуждении!",
  ],
  spam: [],
};

/** Ответ на комментарий: AI (с учётом FAQ) или заготовка. */
export async function buildReply(
  text: string,
  sentiment: Sentiment,
  opts: { faq: string; instruction: string; apiKey: string },
): Promise<string> {
  if (sentiment === "spam") return "";
  const system = `Ты — SMM-менеджер группы ВКонтакте, отвечаешь на комментарии подписчиков. Тематика группы: ${opts.instruction || "общая"}. ${opts.faq ? `База знаний (используй для ответов на вопросы):\n${opts.faq}` : ""}
Правила: отвечай по-русски, дружелюбно, кратко (1–3 предложения), с уместным эмодзи. На негатив — извинись и предложи написать в сообщения сообщества. Не придумывай фактов, которых нет в базе знаний. Верни только текст ответа.`;
  const out = await aiComplete(
    opts.apiKey,
    [
      { role: "system", content: system },
      { role: "user", content: `Комментарий подписчика: «${text}»` },
    ],
    300,
  );
  if (out) return out;
  return pick(FALLBACK_REPLIES[sentiment] ?? FALLBACK_REPLIES.neutral);
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
      } else if (sentiment === "negative") {
        status = "alert";
        alerts++;
        await logActivity(
          "НЕГАТИВНЫЙ КОММЕНТАРИЙ",
          `Требует внимания: «${c.text.slice(0, 80)}»`,
          "error",
        );
        if (s.autoReply) {
          reply = await buildReply(c.text, sentiment, {
            faq: s.faq,
            instruction: s.instruction,
            apiKey: s.gptKey,
          });
        }
      } else if (s.autoReply && sentiment !== "neutral") {
        reply = await buildReply(c.text, sentiment, {
          faq: s.faq,
          instruction: s.instruction,
          apiKey: s.gptKey,
        });
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
