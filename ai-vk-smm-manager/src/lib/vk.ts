import { rand } from "./core";
import { resolveProvider } from "./gpt";

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

export type PublishResult = {
  ok: boolean;
  postId: string | null;
  error?: string;
  simulated: boolean;
  /** Текст ошибки, если фото не прикрепилось (пост при этом опубликован). */
  photoError?: string | null;
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

/** Универсальный вызов метода VK API. null при ошибке/недоступности. */
export async function vkApi<T = Record<string, unknown>>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<T | null> {
  const r = await vkApiDetailed<T>(token, method, params);
  return r.ok ? r.data : null;
}

/** То же, но с текстом ошибки VK — нужен для диагностики загрузки фото. */
export async function vkApiDetailed<T = Record<string, unknown>>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  if (!isRealVkToken(token)) {
    return { ok: false, data: null, error: "VK-токен не задан" };
  }
  try {
    // access_token передаём параметром — так работает и с ключами сообщества,
    // и с пользовательскими токенами (Bearer поддерживается не всеми методами).
    const body = new URLSearchParams({
      ...params,
      access_token: token.trim(),
      v: VK_VERSION,
    });
    const res = await fetch(`${VK_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as {
      response?: T;
      error?: { error_msg?: string; error_code?: number };
    };
    if (data.error) {
      return {
        ok: false,
        data: null,
        error: `${method}: ${data.error.error_msg ?? "ошибка"} (код ${data.error.error_code ?? "?"})`,
      };
    }
    return { ok: true, data: (data.response ?? null) as T | null, error: null };
  } catch (e) {
    return {
      ok: false,
      data: null,
      error: `${method}: сеть недоступна (${e instanceof Error ? e.message : "timeout"})`,
    };
  }
}

export type UploadResult = { attachment: string | null; error: string | null };

/**
 * Загрузка фото на стену группы: getWallUploadServer → upload → saveWallPhoto.
 * Принимает готовые байты (быстро) или URL (скачает сам).
 * Возвращает attachment вида photo-123_456 либо текст ошибки.
 */
export async function vkUploadWallPhoto(opts: {
  token: string;
  groupId: string;
  imageUrl?: string | null;
  bytes?: ArrayBuffer | null;
  mimeType?: string;
}): Promise<UploadResult> {
  const gid = cleanGroupId(opts.groupId);
  if (!isRealVkToken(opts.token) || !gid) {
    return { attachment: null, error: "нет боевого VK-токена или Group ID" };
  }

  // 1. Получаем байты картинки
  let buffer = opts.bytes ?? null;
  let mime = opts.mimeType ?? "image/jpeg";
  if (!buffer) {
    if (!opts.imageUrl) return { attachment: null, error: "картинка не задана" };
    const { fetchImageBuffer } = await import("./research");
    const img = await fetchImageBuffer(opts.imageUrl);
    if (!img) {
      return {
        attachment: null,
        error: "не удалось скачать картинку (генерация могла не успеть — попробуйте ещё раз)",
      };
    }
    buffer = img.buffer;
    mime = img.contentType;
  }
  if (buffer.byteLength < 100) {
    return { attachment: null, error: "файл картинки пустой" };
  }

  // 2. Адрес сервера загрузки
  const srv = await vkApiDetailed<{ upload_url?: string }>(
    opts.token,
    "photos.getWallUploadServer",
    { group_id: gid },
  );
  const uploadUrl = srv.data?.upload_url;
  if (!uploadUrl) {
    return {
      attachment: null,
      error: srv.error ?? "VK не выдал upload_url (нужны права photos у токена)",
    };
  }

  // 3. Отправка файла
  let up: { server?: number; photo?: string; hash?: string; error?: string };
  try {
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const form = new FormData();
    form.append("photo", new Blob([buffer], { type: mime }), `post.${ext}`);
    const upRes = await fetch(uploadUrl, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    up = (await upRes.json()) as typeof up;
  } catch (e) {
    return {
      attachment: null,
      error: `upload: ${e instanceof Error ? e.message : "ошибка отправки файла"}`,
    };
  }
  // VK возвращает photo:"[]" когда файл не принят
  if (!up.photo || up.photo === "[]" || !up.hash || up.server == null) {
    return { attachment: null, error: `upload отклонён VK${up.error ? `: ${up.error}` : ""}` };
  }

  // 4. Сохранение фото
  const saved = await vkApiDetailed<{ id?: number; owner_id?: number }[]>(
    opts.token,
    "photos.saveWallPhoto",
    {
      group_id: gid,
      server: String(up.server),
      photo: up.photo,
      hash: up.hash,
    },
  );
  const photo = saved.data?.[0];
  if (!photo?.id || photo.owner_id == null) {
    return { attachment: null, error: saved.error ?? "saveWallPhoto не вернул фото" };
  }
  return { attachment: `photo${photo.owner_id}_${photo.id}`, error: null };
}

/** wall.post — публикация на стену сообщества (или симуляция в demo-режиме). */
export async function vkPublishPost(opts: {
  token: string;
  groupId: string;
  text: string;
  imageUrl?: string | null;
  imageBytes?: ArrayBuffer | null;
  imageMime?: string;
}): Promise<PublishResult> {
  if (looksLikeDemoToken(opts.token) || !cleanGroupId(opts.groupId)) {
    return { ok: true, postId: String(rand(10_000_000, 99_999_999)), simulated: true };
  }
  try {
    let attachment: string | null = null;
    let photoError: string | null = null;
    if (opts.imageUrl || opts.imageBytes) {
      const up = await vkUploadWallPhoto({
        token: opts.token,
        groupId: opts.groupId,
        imageUrl: opts.imageUrl,
        bytes: opts.imageBytes,
        mimeType: opts.imageMime,
      });
      attachment = up.attachment;
      photoError = up.error;
    }

    const params = new URLSearchParams({
      owner_id: `-${cleanGroupId(opts.groupId)}`,
      message: opts.text,
      from_group: "1",
      v: VK_VERSION,
      ...(attachment ? { attachments: attachment } : {}),
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
      return {
        ok: true,
        postId: String(data.response.post_id),
        simulated: false,
        photoError,
      };
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

/**
 * Симуляция метрик удалена намеренно: показываем только реальные данные VK.
 * Без боевого токена метрики остаются нулевыми, а UI сообщает, что нужен токен.
 */
