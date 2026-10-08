import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { designPresets, settings } from "@/db/schema";
import { DEFAULT_DESIGN, normalizeDesign, presetDesign, type Design } from "./design";
import { getSettings } from "./core";
import { getMedia } from "./media";

/** Дизайн по умолчанию (используется автоплановыми каруселями и дайджестами). */
export async function getDefaultDesign(): Promise<Design> {
  const s = await getSettings();
  let d: Design = DEFAULT_DESIGN;
  if (s.carouselDesign) {
    try {
      d = normalizeDesign(JSON.parse(s.carouselDesign));
    } catch {
      d = DEFAULT_DESIGN;
    }
  }
  // Бренд на слайдах: без подписи сохранённый или перепощенный слайд не несёт имени паблика.
  return withBrand(d, s.brandFooter);
}

/** Подставляет подпись бренда, если в дизайне своей нет. */
export function withBrand(d: Design, brandFooter: string): Design {
  const brand = (brandFooter ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return !d.footer.trim() && brand ? { ...d, footer: brand } : d;
}

export async function saveDefaultDesign(design: unknown) {
  const s = await getSettings();
  const d = normalizeDesign(design);
  await db.update(settings).set({ carouselDesign: JSON.stringify(d), updatedAt: new Date() }).where(eq(settings.id, s.id));
  return d;
}

export async function listSavedPresets() {
  const rows = await db.select().from(designPresets).orderBy(desc(designPresets.id)).limit(50);
  return rows.map((r) => {
    let design = DEFAULT_DESIGN;
    try {
      design = normalizeDesign(JSON.parse(r.config));
    } catch {
      /* битый пресет — показываем дефолт */
    }
    return { id: r.id, name: r.name, design };
  });
}

export async function savePreset(name: string, design: unknown) {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!n) throw new Error("Укажите название пресета");
  const d = normalizeDesign(design);
  const row = (await db.insert(designPresets).values({ name: n, config: JSON.stringify(d) }).returning())[0];
  return { id: row.id, name: row.name, design: d };
}

export async function deletePreset(id: number) {
  await db.delete(designPresets).where(eq(designPresets.id, id));
}

/**
 * Ссылка на дизайн → Design:
 *   «default» / пусто · id встроенного пресета («mint») · «saved:12» — сохранённый пресет.
 * Неизвестная ссылка → дизайн по умолчанию.
 */
export async function resolveDesign(ref?: string | null, inline?: unknown): Promise<Design> {
  if (inline && typeof inline === "object") return normalizeDesign(inline);
  const r = (ref ?? "").trim();
  if (!r || r === "default") return getDefaultDesign();
  const brand = (await getSettings()).brandFooter;
  if (r.startsWith("saved:")) {
    const id = Number(r.slice(6));
    if (Number.isInteger(id)) {
      const row = (await db.select().from(designPresets).where(eq(designPresets.id, id)))[0];
      if (row) {
        try {
          return withBrand(normalizeDesign(JSON.parse(row.config)), brand);
        } catch {
          /* ниже — откат */
        }
      }
    }
    return getDefaultDesign();
  }
  const preset = presetDesign(r);
  return preset ? withBrand(preset, brand) : getDefaultDesign();
}

/** Логотип из библиотеки фото → data URI (только PNG/JPEG, их понимает satori). */
export async function resolveLogo(design: Design): Promise<string | null> {
  if (!design.logoMediaId) return null;
  try {
    const row = await getMedia(design.logoMediaId);
    if (!row || !/^image\/(png|jpeg)$/.test(row.mimeType)) return null;
    return `data:${row.mimeType};base64,${row.data}`;
  } catch {
    return null;
  }
}
