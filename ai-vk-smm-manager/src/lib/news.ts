/**
 * Сбор новостей ниши из открытых бесплатных источников БЕЗ ключей:
 *  - Hacker News (Algolia API) — что обсуждает мировое tech-сообщество
 *  - dev.to — лучшие статьи дня
 *  - Habr — лучшее за сутки (RU)
 */

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: "Hacker News" | "dev.to" | "Habr";
  /** 0..1 — относительная популярность внутри своего источника. */
  score: number;
  snippet: string;
  relevance: number;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function strip(s: string) {
  return decode(decode(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fromHackerNews(): Promise<NewsItem[]> {
  const data = await getJson<{
    hits?: { objectID: string; title?: string; url?: string; points?: number }[];
  }>("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40");
  const hits = (data?.hits ?? []).filter((h) => h.title);
  const max = Math.max(1, ...hits.map((h) => h.points ?? 0));
  return hits.map((h) => ({
    id: `hn-${h.objectID}`,
    title: h.title as string,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: "Hacker News" as const,
    score: (h.points ?? 0) / max,
    snippet: "",
    relevance: 0,
  }));
}

async function fromDevTo(): Promise<NewsItem[]> {
  const data = await getJson<
    { id: number; title: string; description?: string; url: string; positive_reactions_count?: number }[]
  >("https://dev.to/api/articles?top=1&per_page=30");
  const list = data ?? [];
  const max = Math.max(1, ...list.map((a) => a.positive_reactions_count ?? 0));
  return list.map((a) => ({
    id: `dev-${a.id}`,
    title: a.title,
    url: a.url,
    source: "dev.to" as const,
    score: (a.positive_reactions_count ?? 0) / max,
    snippet: strip(a.description ?? "").slice(0, 300),
    relevance: 0,
  }));
}

async function fromHabr(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://habr.com/ru/rss/articles/top/daily/?fl=ru", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1, 26);
    return items
      .map((block, i): NewsItem | null => {
        const title = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1];
        const link = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1];
        const desc = /<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? "";
        if (!title || !link) return null;
        return {
          id: `habr-${link.trim()}`,
          title: strip(title),
          url: strip(link),
          source: "Habr",
          score: 1 - i / 30,
          snippet: strip(desc).slice(0, 300),
          relevance: 0,
        };
      })
      .filter((x): x is NewsItem => Boolean(x));
  } catch {
    return [];
  }
}

/** Страница статьи → og:description, чтобы модель не додумывала суть по заголовку. */
async function fetchDescription(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return "";
    const html = (await res.text()).slice(0, 80_000);
    const m =
      /<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i.exec(html);
    return m ? strip(m[1]).slice(0, 300) : "";
  } catch {
    return "";
  }
}

const NICHE_KEYWORDS =
  /\b(ai|llm|gpt|openai|anthropic|claude|gemini|copilot|agent|agents|chatbot|neural|model|models|prompt|automation|no-?code|saas|startup|app|apps|mobile|ios|android|swift|flutter|react|next\.?js|frontend|web|website|ux|ui|design|figma|api|seo|conversion|landing|e-?commerce|checkout|performance|browser|chrome|apple|google|vercel|cloudflare|stripe|github|open[- ]source)\b|нейро|искусственн|\bии\b|сайт|прилож|разработ|дизайн|стартап|автоматиз|бот|чат-?бот|маркетинг|конверси|лендинг|интерфейс|мобильн|сервис|продукт|фронтенд|бэкенд/i;

/** Ключевые слова из пользовательской ниши («AI, сайты, дизайн») → доп. фильтр. */
function nicheRegex(niche: string): RegExp | null {
  const words = niche
    .toLowerCase()
    .split(/[,;\n]/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
    .flatMap((w) => w.split(/\s+/).filter((x) => x.length >= 4))
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, Math.max(4, w.length - 2)));
  if (!words.length) return null;
  return new RegExp(words.join("|"), "i");
}

export async function fetchNews(opts: {
  niche: string;
  /** URL, которые уже использовались в прошлых дайджестах. */
  exclude?: Set<string>;
  limit?: number;
}): Promise<NewsItem[]> {
  const [hn, dev, habr] = await Promise.all([fromHackerNews(), fromDevTo(), fromHabr()]);
  const nr = nicheRegex(opts.niche);
  const all = [...hn, ...dev, ...habr].filter((n) => !opts.exclude?.has(n.url));

  for (const n of all) {
    const text = `${n.title} ${n.snippet}`;
    n.relevance = (NICHE_KEYWORDS.test(text) ? 1 : 0) + (nr && nr.test(text) ? 0.6 : 0);
  }

  // Берём только релевантные, но если их мало — разбавляем самыми популярными.
  let pool = all.filter((n) => n.relevance > 0);
  if (pool.length < 6) pool = all;

  const ranked = pool
    .map((n) => ({ n, rank: n.score * 1.0 + n.relevance * 0.7 }))
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.n);

  // Разнообразие источников: не более 5 из одного.
  const perSource: Record<string, number> = {};
  const top: NewsItem[] = [];
  for (const n of ranked) {
    perSource[n.source] = (perSource[n.source] ?? 0) + 1;
    if (perSource[n.source] > 5) continue;
    top.push(n);
    if (top.length >= (opts.limit ?? 10)) break;
  }

  // Дообогащаем описаниями там, где их нет.
  await Promise.all(
    top.map(async (n) => {
      if (n.snippet) return;
      n.snippet = await fetchDescription(n.url);
    }),
  );
  return top;
}
