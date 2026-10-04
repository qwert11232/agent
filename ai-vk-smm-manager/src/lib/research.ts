/**
 * Веб-поиск и генерация изображений для постов.
 *  - Поиск: Tavily (если задан TAVILY_API_KEY) → DuckDuckGo (бесплатно, без ключа).
 *  - Картинки: Pollinations.ai (бесплатно, без ключа).
 */

export type SearchHit = { title: string; url: string; snippet: string };

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

async function searchTavily(query: string): Promise<SearchHit[] | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: 5,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const hits = (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 400),
    }));
    return hits.length ? hits : null;
  } catch {
    return null;
  }
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Bing прячет ссылки за редиректом с base64 в параметре u=a1<base64>. */
function unwrapBingUrl(raw: string) {
  const u = decodeEntities(raw);
  const m = /[?&]u=a1([A-Za-z0-9_\-]+)/.exec(u);
  if (m) {
    try {
      return Buffer.from(
        m[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
    } catch {
      /* fallthrough */
    }
  }
  return u;
}

/** Bing html: бесплатно и без ключа. */
async function searchBing(query: string): Promise<SearchHit[] | null> {
  try {
    const res = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ru&cc=RU`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const hits: SearchHit[] = [];
    for (const block of html.split('<li class="b_algo"').slice(1)) {
      if (hits.length >= 5) break;
      const a = /<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (!a) continue;
      const url = unwrapBingUrl(a[1]);
      if (!/^https?:\/\//.test(url)) continue;
      const p = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block);
      const title = stripTags(a[2]);
      if (!title) continue;
      hits.push({ title, url, snippet: p ? stripTags(p[1]).slice(0, 400) : "" });
    }
    return hits.length ? hits : null;
  } catch {
    return null;
  }
}

/** Википедия — надёжный запасной источник фактов. */
async function searchWikipedia(query: string): Promise<SearchHit[] | null> {
  try {
    const res = await fetch(
      `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query,
      )}&format=json&srlimit=4&origin=*`,
      { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { search?: { title?: string; snippet?: string }[] };
    };
    const hits = (data.query?.search ?? [])
      .filter((r) => r.title)
      .map((r) => ({
        title: r.title as string,
        url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(
          (r.title as string).replace(/ /g, "_"),
        )}`,
        snippet: stripTags(r.snippet ?? "").slice(0, 400),
      }));
    return hits.length ? hits : null;
  } catch {
    return null;
  }
}

export async function webSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  return (
    (await searchTavily(q)) ??
    (await searchBing(q)) ??
    (await searchWikipedia(q)) ??
    []
  );
}

export function formatSearchContext(hits: SearchHit[]): string {
  if (!hits.length) return "";
  return hits
    .map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}\nИсточник: ${h.url}`)
    .join("\n\n");
}

/**
 * Генерация картинки без ключей (Pollinations). Возвращает URL —
 * он же используется как превью в панели и как источник для загрузки в VK.
 */
export function buildImageUrl(prompt: string, seed?: number) {
  const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 380);
  const s = seed ?? Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    clean,
  )}?width=1024&height=768&nologo=true&seed=${s}`;
}

/** Короткий визуальный промпт для иллюстрации по тексту поста. */
export function imagePromptFromPost(text: string, topic?: string) {
  const base =
    topic?.trim() ||
    text
      .replace(/#[^\s#]+/g, "")
      .replace(/[^\p{L}\p{N}\s,.:-]/gu, " ")
      .split(/\n+/)
      .filter(Boolean)[0]
      ?.slice(0, 160) ||
    "социальные сети, контент";
  return `${base}. Vibrant modern social media illustration, clean composition, high detail, professional photography style, bright lighting`;
}

/** Скачивание сгенерированной картинки в буфер (для загрузки в VK). */
export async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    return { buffer: await res.arrayBuffer(), contentType };
  } catch {
    return null;
  }
}
