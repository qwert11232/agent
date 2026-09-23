import { rand } from "./core";
import { resolveProvider } from "./gpt";

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

export type PublishResult = {
  ok: boolean;
  postId: string | null;
  error?: string;
  simulated: boolean;
};

function looksLikeDemoToken(token: string) {
  const t = token.trim().toLowerCase();
  return !t || t.startsWith("demo") || t.startsWith("test") || t.length < 10;
}

/** Есть ли боевой VK-токен (а не demo/пустой). */
export function isRealVkToken(token: string) {
  return !looksLikeDemoToken(token);
}

export function cleanGroupId(groupId: string) {
  return groupId.replace(/[^0-9]/g, "");
}

/** wall.post — публикация на стену сообщества (или симуляция в demo-режиме). */
export async function vkPublishPost(opts: {
  token: string;
  groupId: string;
  text: string;
}): Promise<PublishResult> {
  if (looksLikeDemoToken(opts.token) || !cleanGroupId(opts.groupId)) {
    return { ok: true, postId: String(rand(10_000_000, 99_999_999)), simulated: true };
  }
  try {
    const params = new URLSearchParams({
      owner_id: `-${cleanGroupId(opts.groupId)}`,
      message: opts.text,
      from_group: "1",
      v: VK_VERSION,
    });
    const res = await fetch(`${VK_API}/wall.post?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token.trim()}` },
      signal: AbortSignal.timeout(9000),
    });
    const data = (await res.json()) as {
      response?: { post_id?: number };
      error?: { error_msg?: string };
    };
    if (data.response?.post_id) {
      return { ok: true, postId: String(data.response.post_id), simulated: false };
    }
    return {
      ok: false,
      postId: null,
      error: data.error?.error_msg ?? "Неизвестная ошибка VK API",
      simulated: false,
    };
  } catch {
    // Сеть недоступна из песочницы → безопасная симуляция.
    return { ok: true, postId: String(rand(10_000_000, 99_999_999)), simulated: true };
  }
}

/** Проверка токена через groups.getById. */
export async function validateVkToken(
  token: string,
  groupId: string,
): Promise<{ ok: boolean; simulated: boolean; message: string }> {
  if (looksLikeDemoToken(token)) {
    return {
      ok: false,
      simulated: true,
      message: "Токен не задан — бот работает в режиме симуляции (demo).",
    };
  }
  try {
    const gid = cleanGroupId(groupId) || "1";
    const res = await fetch(
      `${VK_API}/groups.getById?group_id=${gid}&v=${VK_VERSION}`,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await res.json()) as {
      response?: { groups?: { name?: string }[] };
      error?: { error_msg?: string };
    };
    if (data.response?.groups?.length) {
      return {
        ok: true,
        simulated: false,
        message: `VK API OK: сообщество «${data.response.groups[0].name ?? gid}» доступно.`,
      };
    }
    return {
      ok: false,
      simulated: false,
      message: `VK API вернул ошибку: ${data.error?.error_msg ?? "нет доступа"}`,
    };
  } catch {
    return {
      ok: false,
      simulated: true,
      message: "VK API недоступен из сети — операции будут симулироваться.",
    };
  }
}

/** Проверка ключа AI (OpenAI sk-… или Groq gsk_…) через /models. */
export async function validateGptKey(
  key: string,
): Promise<{ ok: boolean; simulated: boolean; message: string }> {
  const k = key.trim();
  if (!k) {
    return {
      ok: false,
      simulated: true,
      message: "Ключ не задан — включён встроенный генератор (mock).",
    };
  }
  if (!k.startsWith("sk-") && !k.startsWith("gsk_")) {
    return {
      ok: false,
      simulated: false,
      message: "Ключ не распознан: ожидается OpenAI (sk-…) или Groq (gsk_…).",
    };
  }
  const provider = resolveProvider(k);
  try {
    const res = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${k}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return {
        ok: true,
        simulated: false,
        message: `${provider.name} API OK: ключ принят, модель ${provider.models[0]} доступна.`,
      };
    }
    return {
      ok: false,
      simulated: false,
      message: `${provider.name} API отклонил ключ (HTTP ${res.status}).`,
    };
  } catch {
    return {
      ok: false,
      simulated: true,
      message: `${provider.name} API недоступен из сети — генерация пойдёт через встроенный mock.`,
    };
  }
}

/** Реальные подписчики и название группы — groups.getById + members_count. */
export async function fetchVkGroupInfo(
  token: string,
  groupId: string,
): Promise<{ name: string | null; followers: number | null } | null> {
  if (!isRealVkToken(token)) return null;
  try {
    const gid = cleanGroupId(groupId);
    if (!gid) return null;
    const res = await fetch(
      `${VK_API}/groups.getById?group_id=${gid}&fields=members_count&v=${VK_VERSION}`,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(9000),
      },
    );
    const data = (await res.json()) as {
      response?: { groups?: { name?: string; members_count?: number }[] };
    };
    const group = data.response?.groups?.[0];
    if (!group) return null;
    return {
      name: group.name ?? null,
      followers: typeof group.members_count === "number" ? group.members_count : null,
    };
  } catch {
    return null;
  }
}

export type RealPostStats = {
  likes: number;
  comments: number;
  views: number;
  reposts: number;
};

/** Реальная статистика постов — wall.getById батчами по 100. */
export async function fetchVkPostStats(
  token: string,
  groupId: string,
  vkPostIds: string[],
): Promise<Map<string, RealPostStats> | null> {
  if (!isRealVkToken(token) || !vkPostIds.length) return null;
  const gid = cleanGroupId(groupId);
  if (!gid) return null;
  const map = new Map<string, RealPostStats>();
  try {
    for (let i = 0; i < vkPostIds.length; i += 100) {
      const chunk = vkPostIds
        .slice(i, i + 100)
        .map((id) => `-${gid}_${id}`)
        .join(",");
      const res = await fetch(
        `${VK_API}/wall.getById?posts=${encodeURIComponent(chunk)}&v=${VK_VERSION}`,
        {
          headers: { Authorization: `Bearer ${token.trim()}` },
          signal: AbortSignal.timeout(9000),
        },
      );
      const data = (await res.json()) as {
        response?: {
          items?: {
            id: number;
            likes?: { count: number };
            comments?: { count: number };
            views?: { count: number };
            reposts?: { count: number };
          }[];
        };
      };
      for (const item of data.response?.items ?? []) {
        map.set(String(item.id), {
          likes: item.likes?.count ?? 0,
          comments: item.comments?.count ?? 0,
          views: item.views?.count ?? 0,
          reposts: item.reposts?.count ?? 0,
        });
      }
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}

/** Прирост статистики в demo-режиме (когда боевого токена нет). */
export function simulateStatsTick(post: {
  views: number;
  likes: number;
  comments: number;
  reposts: number;
}) {
  const viewsInc = rand(35, 420);
  const views = post.views + viewsInc;
  const likes = Math.min(views, post.likes + rand(0, Math.max(1, Math.round(viewsInc * 0.09))));
  const comments = post.comments + rand(0, 4);
  const reposts = post.reposts + rand(0, 3);
  return { views, likes, comments, reposts };
}
