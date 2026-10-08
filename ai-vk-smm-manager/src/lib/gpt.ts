import { pick } from "./core";
import {
  CTA_LADDER,
  CTA_STEP_HINT,
  FORMAT_ROLES,
  LENGTH_VARIANTS,
  firstLines,
  VOICE_STYLE,
  type FormatRole,
} from "./style";

export const TONE_LABELS: Record<string, string> = {
  friendly: "дружеский",
  business: "деловой",
  funny: "с юмором",
};

/** AI недоступен (нет ключа или провайдер не ответил): публиковать нечего, текст-заглушек нет. */
export class AiUnavailableError extends Error {
  constructor(message = "AI недоступен: проверьте AI API Key в настройках") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/* ---------------- AI провайдеры (OpenAI / Groq) ---------------- */

type Provider = { baseUrl: string; models: string[]; name: string };

/** Автодетект провайдера по префиксу ключа. AI_BASE_URL - свой OpenAI-совместимый прокси. */
export function resolveProvider(apiKey: string): Provider {
  const k = apiKey.trim();
  const override = process.env.AI_BASE_URL?.trim();
  if (override) {
    return { baseUrl: override.replace(/\/$/, ""), models: [process.env.AI_MODEL || "gpt-4o-mini"], name: "Custom" };
  }
  if (k.startsWith("gsk_")) {
    return {
      baseUrl: "https://api.groq.com/openai/v1",
      models: [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
      name: "Groq",
    };
  }
  return {
    baseUrl: "https://api.openai.com/v1",
    models: [process.env.OPENAI_MODEL || "gpt-4o-mini"],
    name: "OpenAI",
  };
}

function resolveApiKey(explicit?: string): string {
  return explicit?.trim() || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || "";
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function callAI(apiKey: string, messages: Msg[], maxTokens = 800, temperature = 0.85): Promise<string | null> {
  const provider = resolveProvider(apiKey);
  // Groq gpt-oss тратит токены на reasoning → даём запас.
  const effectiveMax = provider.name === "Groq" ? Math.max(maxTokens * 3, 1500) : maxTokens;

  for (const model of provider.models) {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: effectiveMax }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) continue; // пробуем следующую модель
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch {
      continue; // сеть недоступна → следующая модель
    }
  }
  return null;
}

/**
 * Публичный доступ к AI-вызову для других модулей (комментарии, отчёты, дайджест).
 * temperature: посты 0.85, факты и дайджест 0.45, ответы на комментарии 0.6.
 */
export async function aiComplete(
  apiKey: string | undefined,
  messages: Msg[],
  maxTokens = 600,
  opts?: { temperature?: number },
): Promise<string | null> {
  const key = resolveApiKey(apiKey);
  if (!key) return null;
  return callAI(key, messages, maxTokens, opts?.temperature ?? 0.85);
}

/** Формы подачи. Личные истории и цифры берутся только из банка фактов. */
const ANGLES = [
  "разбор частой ошибки и как её избежать",
  "пошаговая мини-инструкция",
  "список из 3-5 неочевидных наблюдений",
  "сравнение двух подходов: что лучше и когда",
  "ответ на частый вопрос клиентов",
  "мифы и реальность по теме",
  "чек-лист для самопроверки",
  "закулисье: как это устроено изнутри (без выдуманных клиентов)",
  "прогноз: что будет дальше и что делать уже сейчас",
  "быстрый приём, который экономит время",
  "расчёт цены ошибки на условных числах",
];

/** Механизмы хука: модель выбирает один и держит его весь пост. */
const MECHANISMS = [
  "цена ошибки (расчёт на условных числах)",
  "контр-интуитивная позиция",
  "вопрос без очевидного ответа",
  "разбор мифа",
  "наблюдение из практики",
  "обещание конкретной пользы с границей",
  "сцена из реального случая (только если есть запись в БАНКЕ ФАКТОВ, иначе другой механизм)",
];

/** Блок БАНК ФАКТОВ для промпта. Пустой банк - тоже явная инструкция. */
export function factsBlock(facts?: string): string {
  const f = (facts ?? "").trim();
  if (!f) {
    return "БАНК ФАКТОВ: пуст. Не изображай конкретные случаи клиентов и личный опыт. Строй пост на позиции автора, разборе типовой ситуации или расчёте на условных числах («допустим…»).";
  }
  return `БАНК ФАКТОВ (реальные случаи владельца: единственный источник личных историй, ошибок и результатов; цифры бери точно, не округляй в свою пользу; записи с пометкой «только обобщённо» не раскрывай подробностями):\n${f.slice(0, 4000)}`;
}

export type GenerateOpts = {
  instruction: string;
  tone: string;
  topic?: string;
  apiKey?: string;
  searchContext?: string;
  /** Тексты недавних постов - чтобы не повторяться. */
  recent?: string[];
  /** Счётчик для ротации форм и механизмов подачи. */
  variant?: number;
  /** short - короткий, long - лонгрид, caption - подпись к карусели. Без значения - ротация. */
  length?: "short" | "long" | "caption";
  /** Банк фактов владельца. */
  facts?: string;
  /** Ступень лестницы призывов 0-4. */
  cta?: number;
  /** Доп. замечание модели (например, после неудачной проверки первой строки). */
  note?: string;
};

export async function generateVkPost(opts: GenerateOpts): Promise<{ text: string; usedModel: "gpt" }> {
  const key = resolveApiKey(opts.apiKey);
  if (!key) throw new AiUnavailableError();

  const role: FormatRole | null = opts.length === "short" ? "short" : opts.length === "long" ? "long" : opts.length === "caption" ? "caption" : null;
  const v = opts.variant ?? Math.floor(Math.random() * 1000);
  const variant = role
    ? { type: FORMAT_ROLES[role].type, hint: FORMAT_ROLES[role].hint, maxTokens: FORMAT_ROLES[role].maxTokens }
    : LENGTH_VARIANTS[v % LENGTH_VARIANTS.length];

  const toneNote =
    opts.tone === "funny"
      ? " Чуть больше иронии, но без клоунады."
      : opts.tone === "business"
        ? " Деловые термины уместнее, но голос живой, не корпоративный."
        : "";
  const system = `${VOICE_STYLE}

${CTA_LADDER}

НИШЕВОЙ КОНТЕКСТ ВЛАДЕЛЬЦА (соблюдай тематику, голос и правила задаются выше): ${opts.instruction || "сайты, карточки товаров, боты и автоматизация - как практик-основатель."}${toneNote}

ЗАДАЧА: один готовый пост ВКонтакте, формат - ${variant.type}. ${variant.hint}
Отвечай только текстом поста, без вступлений, пояснений и пометок о механизме.`;

  const base = opts.topic?.trim() ? `Тема поста: ${opts.topic.trim()}` : "Придумай актуальную тему сам, исходя из ниши и целевой аудитории.";
  const lines = firstLines(opts.recent ?? []);
  const recentBlock = opts.recent?.length
    ? `\n\nУЖЕ ОПУБЛИКОВАНО РАНЕЕ (не повторяй темы и формулировки):\n${opts.recent
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").slice(0, 160)}`)
        .join("\n")}\n\nПЕРВЫЕ СТРОКИ ПОСЛЕДНИХ ПОСТОВ (не повторяй их форму, механизм и начальные слова):\n${lines.map((l) => `- ${l}`).join("\n")}`
    : "";
  const angle = ANGLES[v % ANGLES.length];
  const mechanism = MECHANISMS[(v * 3 + 1) % MECHANISMS.length];
  const ctaStep = opts.cta !== undefined ? CTA_STEP_HINT[Math.min(4, Math.max(0, opts.cta))] : null;
  const user =
    `${base}` +
    `\n\nФОРМА ПОДАЧИ, если тема не диктует свою: ${angle}. Предпочтительный механизм хука: ${mechanism} (если материал не подходит, выбери другой из списка в блоке ХУК).` +
    `\n\n${factsBlock(opts.facts)}` +
    (ctaStep ? `\n\n${ctaStep}` : "") +
    (opts.searchContext?.trim() ? `\n\nСВЕЖИЕ ДАННЫЕ ИЗ ИНТЕРНЕТА (используй факты отсюда, не выдумывай):\n${opts.searchContext}` : "") +
    recentBlock +
    (opts.note ? `\n\nЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ: ${opts.note}` : "");

  const out = await callAI(key, [{ role: "system", content: system }, { role: "user", content: user }], variant.maxTokens, 0.85);
  if (!out) throw new AiUnavailableError("AI не вернул текст: проверьте ключ и доступ к провайдеру");
  return { text: out, usedModel: "gpt" };
}

/* ---------------- Чат-бот отчётов ---------------- */

type ChatCtx = {
  sender: "user" | "bot";
  message: string;
};

export async function chatBotReply(opts: {
  history: ChatCtx[];
  context: string;
  apiKey?: string;
}): Promise<{ text: string; usedModel: "gpt" | "mock" }> {
  const key = resolveApiKey(opts.apiKey);
  if (key) {
    const system = `Ты — AI-SMM менеджер BOT-9000 группы ВКонтакте. Отчитываешься владельцу о своей работе: посты, публикации, статистика, ошибки. Отвечай по-русски, кратко (2–5 предложений), уверенно, с опорой на цифры из контекста. КОНТЕКСТ ПАНЕЛИ: ${opts.context}`;
    const messages: { role: "system" | "user" | "assistant"; content: string }[] =
      [
        { role: "system", content: system },
        ...opts.history.slice(-10).map((m) => ({
          role: (m.sender === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.message,
        })),
      ];
    const out = await callAI(key, messages, 400);
    if (out) return { text: out, usedModel: "gpt" };
  }
  return {
    text: mockChatReply(opts.history.at(-1)?.message ?? "", opts.context),
    usedModel: "mock",
  };
}

function mockChatReply(message: string, context: string): string {
  const m = message.toLowerCase();
  let ctx: Record<string, number | string | boolean> = {};
  try {
    ctx = JSON.parse(context) as Record<string, number | string | boolean>;
  } catch {
    /* no-op */
  }
  const num = (k: string) => Number(ctx[k] ?? 0);

  if (/(статистик|метрик|отч[её]т|цифр|результат)/.test(m)) {
    return `Докладываю сводку: постов всего — ${num("posts")} из них опубликовано — ${num("published")}. Суммарно собрано ${num("likes")} лайков, ${num("comments")} комментариев и ${num("views")} просмотров. Подписчиков: ${num("followers")}. Динамика стабильно положительная, продолжаю работу.`;
  }
  if (/(пост|публикац|расписан|контент)/.test(m)) {
    return `По контент-плану: в расписании ${num("scheduleTimes") || "2 слота"} публикаций в день, статус автопилота — ${ctx["active"] ? "АКТИВЕН" : "на паузе"}. Черновиков готово: ${num("drafts")}. Могу сгенерировать новый пост на странице «Посты» — просто нажмите «Сгенерировать».`;
  }
  if (/(привет|здравствуй|добрый|салют)/.test(m)) {
    return pick([
      "Приветствую! Все системы в норме. Хотите свежую сводку — спросите «отчёт».",
      "Добрый день! BOT-9000 на связи. Могу доложить статистику или рассказать о расписании.",
    ]);
  }
  if (/(ошибк|проблем|сбо|не работает)/.test(m)) {
    return "Провёл диагностику: критических ошибок не обнаружено. Журнал активности доступен на главной панели — последние 100 действий фиксируются там. Если появится сбой VK API, сообщу статусом ERROR сразу.";
  }
  if (/(спасибо|молодец|круто|отлично)/.test(m)) {
    return pick([
      "Работаю на благо охватов. Продолжаю мониторинг!",
      "Принято! Мотивация ядерного реактора повышена на 12%.",
    ]);
  }
  if (/(лайк|охват|просмотр|подписчик)/.test(m)) {
    return `Текущая статистика вовлечённости: ${num("likes")} лайков, ${num("comments")} комментариев, ${num("views")} просмотров суммарно. Подписчиков: ${num("followers")}. Рекомендую держать расписание без пропусков — алгоритм ВК это любит.`;
  }
  return pick([
    `Принял. Текущий статус: бот ${ctx["active"] ? "активен" : "на паузе"}, опубликовано ${num("published")} постов. Уточните запрос — могу дать сводку по статистике, расписанию или ошибкам.`,
    "Зафиксировал сообщение в журнале. Для деталей спросите: «отчёт», «расписание» или «как дела с охватами».",
  ]);
}
