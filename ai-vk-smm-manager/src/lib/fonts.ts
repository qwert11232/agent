import fs from "node:fs";
import path from "node:path";
import { FONTS, type FontId } from "./design";

/**
 * Надёжная загрузка шрифтов для рендера слайдов.
 *
 * Раньше шрифты читались из «assets/fonts» ЕДИНСТВЕННЫМ путём, и если файлов нет
 * в бандле serverless-функции — рендер падал с ENOENT (/var/task/…/inter-cyr-700.woff).
 * Теперь порядок такой:
 *   1) <проект>/assets/fonts          — файлы лежат в репозитории и включены в трассировку Next;
 *   2) node_modules/@fontsource/<id>  — если пакет установлен;
 *   3) CDN (jsDelivr)                 — с кешем в памяти и в /tmp;
 *   4) если шрифт совсем недоступен — безопасный откат на Inter, а затем понятная ошибка.
 */

export type SatoriFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

const SUBSETS = ["cyrillic", "latin"] as const;
const WEIGHTS = [400, 700] as const;

export type FontSource = "local" | "node_modules" | "cdn" | "missing";

const bufferCache = new Map<string, Buffer>();
const sourceCache = new Map<string, FontSource>();

function fileName(id: FontId, subset: string, weight: number) {
  return `${id}-${subset}-${weight}-normal.woff`;
}

/** Satori-имя семейства: символы вне [A-Za-z0-9] убираем. */
export function satoriFamily(id: FontId, subset: "cyr" | "lat") {
  return `${id.replace(/[^a-z0-9]/gi, "")}${subset === "cyr" ? "Cyr" : "Lat"}`;
}

function localDirs() {
  const cwd = process.cwd();
  const dirs = [
    path.join(cwd, "assets", "fonts"),
    path.join(cwd, "ai-vk-smm-manager", "assets", "fonts"),
    path.join(cwd, "..", "assets", "fonts"),
    path.join("/var/task", "assets", "fonts"),
  ];
  return [...new Set(dirs)];
}

function fontsourceDirs(id: FontId) {
  const cwd = process.cwd();
  return [
    path.join(cwd, "node_modules", "@fontsource", id, "files"),
    path.join(cwd, "ai-vk-smm-manager", "node_modules", "@fontsource", id, "files"),
  ];
}

function tryRead(file: string): Buffer | null {
  try {
    const b = fs.readFileSync(file);
    return b.byteLength > 1000 ? b : null;
  } catch {
    return null;
  }
}

async function fromCdn(id: FontId, subset: string, weight: number): Promise<Buffer | null> {
  const name = fileName(id, subset, weight);
  const tmp = path.join("/tmp", `smm-font-${name}`);
  const cached = tryRead(tmp);
  if (cached) return cached;
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fontsource/${id}/files/${name}`,
    `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${weight}-normal.woff`,
    `https://unpkg.com/@fontsource/${id}/files/${name}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 1000) continue;
      try {
        fs.writeFileSync(tmp, buf);
      } catch {
        /* /tmp может быть недоступен — не страшно */
      }
      return buf;
    } catch {
      /* пробуем следующий URL */
    }
  }
  return null;
}

async function loadOne(id: FontId, subset: string, weight: number): Promise<Buffer | null> {
  const key = fileName(id, subset, weight);
  const hit = bufferCache.get(key);
  if (hit) return hit;

  const name = key;
  let buf: Buffer | null = null;
  let src: FontSource = "missing";
  for (const dir of localDirs()) {
    buf = tryRead(path.join(dir, name));
    if (buf) {
      src = "local";
      break;
    }
  }
  if (!buf) {
    for (const dir of fontsourceDirs(id)) {
      buf = tryRead(path.join(dir, name));
      if (buf) {
        src = "node_modules";
        break;
      }
    }
  }
  if (!buf) {
    buf = await fromCdn(id, subset, weight);
    if (buf) src = "cdn";
  }
  if (buf) {
    bufferCache.set(key, buf);
    sourceCache.set(key, src);
  }
  return buf;
}

/** Все 4 файла семейства (кириллица/латиница × 400/700) либо null. */
async function loadFamily(id: FontId): Promise<SatoriFont[] | null> {
  const out: SatoriFont[] = [];
  for (const subset of SUBSETS) {
    for (const weight of WEIGHTS) {
      const data = await loadOne(id, subset, weight);
      if (!data) return null;
      out.push({
        name: satoriFamily(id, subset === "cyrillic" ? "cyr" : "lat"),
        data,
        weight,
        style: "normal",
      });
    }
  }
  return out;
}

/**
 * Шрифты для набора семейств. Недоступное семейство заменяется на Inter.
 * Возвращает также карту «запрошенный → фактически использованный».
 */
export async function loadFontsFor(ids: FontId[]) {
  const wanted = [...new Set(ids)];
  const fonts: SatoriFont[] = [];
  const resolved = new Map<FontId, FontId>();
  for (const id of wanted) {
    let fam = await loadFamily(id);
    let used: FontId = id;
    if (!fam && id !== "inter") {
      fam = await loadFamily("inter");
      used = "inter";
    }
    if (!fam) {
      throw new Error(
        "Не найдены файлы шрифтов (папка assets/fonts) и CDN недоступен. Убедитесь, что папка assets/fonts задеплоена вместе с приложением.",
      );
    }
    resolved.set(id, used);
    if (!fonts.some((f) => f.name === fam![0].name)) fonts.push(...fam);
  }
  return { fonts, resolved };
}

/** Диагностика для страницы «Дизайн»: где найден каждый шрифт (без сетевых запросов). */
export function fontStatus(): Record<string, FontSource> {
  const res: Record<string, FontSource> = {};
  for (const f of FONTS) {
    let ok: FontSource = "missing";
    const name = fileName(f.id, "cyrillic", 700);
    if (localDirs().some((d) => fs.existsSync(path.join(d, name)))) ok = "local";
    else if (fontsourceDirs(f.id).some((d) => fs.existsSync(path.join(d, name)))) ok = "node_modules";
    else if (fs.existsSync(path.join("/tmp", `smm-font-${name}`))) ok = "cdn";
    res[f.id] = ok;
  }
  return res;
}
