import { pick, rand } from "./core";

export const TONE_LABELS: Record<string, string> = {
  friendly: "дружеский",
  business: "деловой",
  funny: "смешной",
};

/* ---------------- AI провайдеры (OpenAI / Groq) ---------------- */

type Provider = { baseUrl: string; models: string[]; name: string };

/** Автодетект провайдера по префиксу ключа. */
export function resolveProvider(apiKey: string): Provider {
  const k = apiKey.trim();
  if (k.startsWith("gsk_")) {
    return {
      baseUrl: "https://api.groq.com/openai/v1",
      models: [
        process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
      ],
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
  return (
    explicit?.trim() ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    ""
  );
}

async function callAI(
  apiKey: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 800,
): Promise<string | null> {
  const provider = resolveProvider(apiKey);
  // Groq gpt-oss тратит токены на reasoning → даём запас.
  const effectiveMax =
    provider.name === "Groq" ? Math.max(maxTokens * 3, 1500) : maxTokens;

  for (const model of provider.models) {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.9,
          max_tokens: effectiveMax,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue; // пробуем следующую модель
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch {
      continue; // сеть недоступна → следующая модель → mock
    }
  }
  return null;
}

/** Публичный доступ к AI-вызову для других модулей (комментарии, отчёты). */
export async function aiComplete(
  apiKey: string | undefined,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 600,
): Promise<string | null> {
  const key = resolveApiKey(apiKey);
  if (!key) return null;
  return callAI(key, messages, maxTokens);
}

/* ---------------- Mock генератор постов ---------------- */

const TOPICS = [
  "что происходит в нашей группе на этой неделе",
  "3 привычки, которые делают любой рабочий день продуктивнее",
  "наш главный инсайт месяца — просто и по делу",
  "почему лучшее время начать — именно сегодня",
  "разбор частой ошибки новичков и как её избежать",
  "маленький лайфхак, который экономит час времени",
  "за кулисами: как мы готовим контент для вас",
  "5 фактов, которые вас удивят",
];

const HOOKS: Record<string, string[]> = {
  friendly: [
    "Друзья, привет! ✨",
    "Хорошие новости! 🎉",
    "Добрый день, наша любимая аудитория! 🌟",
    "Ловим волну позитива и делимся с вами 💛",
  ],
  business: [
    "Уважаемые подписчики, добрый день.",
    "Коллеги, приветствуем вас.",
    "Информируем сообщество об обновлении.",
    "Добрый день. Делимся важной информацией.",
  ],
  funny: [
    "Так, всем срочно оторваться от дел 😅",
    "ВНИМАНИЕ: пост проверен юристами (шутка, у нас нет юристов) 😎",
    "Загадка дня: что общего у понедельника и этого поста? Правильно — ничего 😄",
    "НЕ ПАНИКОВАТЬ! Слишком поздно, вы уже читаете 🤪",
  ],
};

const BODIES: Record<string, string[]> = {
  friendly: [
    "Мы долго готовили этот материал и наконец делимся: {topic}. Простым языком, без занудства — только то, что реально работает.",
    "Сегодня на повестке дня — {topic}. Обещаем: будет интересно даже тем, кто зашёл «на минутку».",
    "Знаете, что нас вдохновляет? {topic}! Поэтому мы собрали всё самое важное в один пост.",
  ],
  business: [
    "Тема публикации: {topic}. Материал подготовлен на основе актуальных данных и практического опыта команды.",
    "В рамках регулярной рубрики рассматриваем: {topic}. Ниже — ключевые тезисы.",
    "Представляем краткий обзор по теме: {topic}.",
  ],
  funny: [
    "Суть новости: {topic}. Да, мы тоже не поверили сначала.",
    "Итак, тема дня — {topic}. Пристегните ремни, будет разбор по полочкам, по полочкам — по смеху.",
    "Представьте: {topic}. Уже интересно? Нам тоже. Погнали!",
  ],
};

const FILLERS: Record<string, string[][]> = {
  friendly: [
    [
      "Главная мысль проста:\n• Начните с малого — и не откладывайте на завтра.\n• Регулярность важнее идеальности.\n• Тестируйте, измеряйте, делайте выводы.",
      "Мы сами прошли этот путь, набили шишки и теперь честно рассказываем, что сработало, а что — нет.",
    ],
    [
      "Коротко о главном:\n• Первый шаг занимает 5 минут, а выгода — месяцы.\n• Не бойтесь пробовать новое — мы подстрахуем советом.\n• Делитесь результатами в комментариях, нам важно!",
      "Команда читает каждое сообщение и всегда на связи 💬",
    ],
  ],
  business: [
    [
      "Ключевые тезисы:\n— Эффект заметен уже в первую неделю применения.\n— Снижение издержек достигается за счёт системного подхода.\n— Все выводы подкреплены практикой и замерами.",
      "Подробности и материалы доступны в прикреплённых ссылках.",
    ],
    [
      "Отдельно отметим:\n— Внедрение не требует остановки текущих процессов.\n— Поддержка команды — на всех этапах.\n— Метрики эффективности фиксируются прозрачно.",
      "Документ с полным описанием направим по запросу в сообщениях сообщества.",
    ],
  ],
  funny: [
    [
      "Факты, проверенные нашим главным котом-аналитиком 🐱:\n• Работает в 9 случаях из 10 (десятый случай — когда забыли сохранить).\n• Официально одобрено кофе-машиной на 3 этаже.\n• Побочный эффект: хорошее настроение.",
      "Если серьёзно — это правда полезно, мы проверили. Дважды. То, что смеялись — не считается.",
    ],
    [
      "Краткая инструкция по применению:\n• Шаг 1: дочитать пост.\n• Шаг 2: поставить лайк (важно для кармы).\n• Шаг 3: внедрить и хвастаться результатом в комментах.",
      "Гарантия не распространяется на случаи «прочитал и забыл» 😉",
    ],
  ],
};

const CTAS: Record<string, string[]> = {
  friendly: [
    "Ставьте ❤️, если было полезно, и делитесь постом с друзьями!",
    "Расскажите в комментариях, что думаете — нам это важно 👇",
    "Сохраняйте пост, чтобы не потерять 🔖",
  ],
  business: [
    "Вопросы и предложения принимаем в сообщениях сообщества.",
    "Будем признательны за обратную связь в комментариях.",
    "Подписывайтесь, чтобы не пропустить следующий выпуск.",
  ],
  funny: [
    "Лайк, если дочитали. Два лайка — если не дочитали 🤝",
    "Пишите в комментарии самое главное слово поста. Победитель получит уважение 😏",
    "Репостните другу — пусть тоже улыбнётся 😁",
  ],
};

function buildTags(instruction: string): string {
  const words = instruction
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 5);
  const custom = [...new Set(words.slice(0, 3))].map((w) => `#${w}`);
  const generic = ["#новости", "#полезное", "#выборредакции", "#smm"];
  return [...custom, ...generic].slice(0, 6).join(" ");
}

function mockPost(tone: string, instruction: string, topic?: string): string {
  const t = tone in HOOKS ? tone : "friendly";
  const topicText = topic?.trim() || pick(TOPICS);
  const hook = pick(HOOKS[t]);
  const body = pick(BODIES[t]).replace("{topic}", topicText);
  const filler = pick(FILLERS[t]).join("\n");
  const cta = pick(CTAS[t]);
  const tags = buildTags(instruction || "новости группа контент");
  return `${hook}\n\n${body}\n\n${filler}\n\n${cta}\n\n${tags}`;
}

export async function generateVkPost(opts: {
  instruction: string;
  tone: string;
  topic?: string;
  apiKey?: string;
  searchContext?: string;
}): Promise<{ text: string; usedModel: "gpt" | "mock" }> {
  const key = resolveApiKey(opts.apiKey);
  if (key) {
    const system = `Ты — SMM-менеджер группы ВКонтакте. Тон общения: ${TONE_LABELS[opts.tone] ?? opts.tone}. Инструкция владельца: ${opts.instruction || "пиши полезные посты"}. Требования: напиши один пост 150–250 слов на русском языке, добавь уместные эмодзи и 4–8 хештегов в конце. Отвечай только текстом поста, без комментариев.`;
    const base = opts.topic?.trim()
      ? `Тема поста: ${opts.topic.trim()}`
      : "Придумай актуальную тему сам, исходя из инструкции.";
    const user = opts.searchContext?.trim()
      ? `${base}\n\nСВЕЖИЕ ДАННЫЕ ИЗ ИНТЕРНЕТА (используй факты отсюда, не выдумывай):\n${opts.searchContext}`
      : base;
    const out = await callAI(key, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    if (out) return { text: out, usedModel: "gpt" };
  }
  return { text: mockPost(opts.tone, opts.instruction, opts.topic), usedModel: "mock" };
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
