/**
 * Модель дизайна слайдов карусели. Файл «чистый» (без node-модулей),
 * поэтому его можно импортировать и на сервере, и в клиентском редакторе.
 */

export type FontId =
  | "inter"
  | "montserrat"
  | "manrope"
  | "playfair-display"
  | "roboto-slab"
  | "unbounded"
  | "jetbrains-mono"
  | "pt-serif";

export const FONTS: { id: FontId; name: string; hint: string }[] = [
  { id: "inter", name: "Inter", hint: "нейтральный, как в интерфейсах" },
  { id: "montserrat", name: "Montserrat", hint: "геометричный, дружелюбный" },
  { id: "manrope", name: "Manrope", hint: "современный, чуть техничный" },
  { id: "playfair-display", name: "Playfair Display", hint: "журнальная антиква" },
  { id: "roboto-slab", name: "Roboto Slab", hint: "брусковый, основательный" },
  { id: "pt-serif", name: "PT Serif", hint: "классическая книжная" },
  { id: "unbounded", name: "Unbounded", hint: "широкий, акцидентный" },
  { id: "jetbrains-mono", name: "JetBrains Mono", hint: "моноширинный, для IT" },
];

export const LAYOUTS = [
  { id: "classic", name: "Классика", hint: "номер, заголовок и текст слева" },
  { id: "card", name: "Карточка", hint: "текст на полупрозрачной плашке" },
  { id: "editorial", name: "Журнал", hint: "крупный номер, линия, заголовок снизу" },
  { id: "bar", name: "Полоса", hint: "вертикальная акцентная полоса" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const FORMATS = [
  { id: "square", name: "Квадрат 1080×1080", w: 1080, h: 1080 },
  { id: "portrait", name: "Портрет 1080×1350 (4:5)", w: 1080, h: 1350 },
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];

export type Design = {
  // цвета
  from: string;
  to: string;
  accent: string;
  text: string;
  muted: string;
  glowColor: string;
  // фон
  bgMode: "gradient" | "solid";
  angle: number; // 0..360
  glowStrength: number; // 0..100
  pattern: "none" | "dots" | "grid";
  // типографика
  headingFont: FontId;
  bodyFont: FontId;
  titleScale: number; // 60..140, %
  bodyScale: number; // 70..140, %
  // композиция
  layout: LayoutId;
  align: "left" | "center";
  format: FormatId;
  radius: number; // 0..80, скругление плашки
  numberStyle: "big" | "badge" | "none";
  accentBar: boolean; // короткая акцентная чёрточка на обложке и финале
  // элементы
  showLabel: boolean;
  showCounter: boolean;
  showProgress: boolean;
  showArrow: boolean;
  label: string; // свой текст сверху слева; пусто = авто («Карусель», «Дайджест · 12 мая»)
  footer: string; // подпись бренда внизу («@my_agency»)
  logoMediaId: number | null; // фото из библиотеки как логотип
  // фото-фон
  photoDim: number; // 0..100, затемнение фото
};

export const DEFAULT_DESIGN: Design = {
  from: "#0b1020",
  to: "#1d1f4a",
  accent: "#7c8cff",
  text: "#ffffff",
  muted: "#aab2d9",
  glowColor: "#4f46e5",
  bgMode: "gradient",
  angle: 145,
  glowStrength: 50,
  pattern: "none",
  headingFont: "inter",
  bodyFont: "inter",
  titleScale: 100,
  bodyScale: 100,
  layout: "classic",
  align: "left",
  format: "square",
  radius: 40,
  numberStyle: "big",
  accentBar: true,
  showLabel: true,
  showCounter: true,
  showProgress: true,
  showArrow: true,
  label: "",
  footer: "",
  logoMediaId: null,
  photoDim: 70,
};

export type DesignPreset = { id: string; name: string; design: Partial<Design> };

export const PRESETS: DesignPreset[] = [
  { id: "midnight", name: "Полночь", design: {} },
  {
    id: "sunset",
    name: "Закат",
    design: { from: "#2a0f2e", to: "#7a1f4d", accent: "#ffb35c", text: "#fff7ef", muted: "#f0c6d8", glowColor: "#ff5c8a", headingFont: "montserrat", bodyFont: "montserrat" },
  },
  {
    id: "mint",
    name: "Мята",
    design: { from: "#06231f", to: "#0d4a40", accent: "#5cf2c0", text: "#f2fffb", muted: "#a5dccf", glowColor: "#14b8a6", headingFont: "manrope", bodyFont: "manrope", layout: "bar" },
  },
  {
    id: "paper",
    name: "Бумага",
    design: { from: "#f7f3ea", to: "#e8e0cf", accent: "#e4572e", text: "#1b1b1f", muted: "#6b6558", glowColor: "#f6b26b", headingFont: "playfair-display", bodyFont: "pt-serif", layout: "editorial", glowStrength: 35 },
  },
  {
    id: "electric",
    name: "Электрик",
    design: { from: "#050505", to: "#14142b", accent: "#d4ff3a", text: "#ffffff", muted: "#a8a8c0", glowColor: "#7a5cff", headingFont: "unbounded", bodyFont: "inter", titleScale: 88, pattern: "grid" },
  },
  {
    id: "ocean",
    name: "Океан",
    design: { from: "#031c34", to: "#0a4a7a", accent: "#4cc9f0", text: "#f0faff", muted: "#a9d3ea", glowColor: "#2b8cff", headingFont: "montserrat", bodyFont: "inter", layout: "card", pattern: "dots" },
  },
  {
    id: "mono",
    name: "Моно",
    design: { from: "#111111", to: "#111111", bgMode: "solid", accent: "#ffffff", text: "#f5f5f5", muted: "#9a9a9a", glowColor: "#444444", glowStrength: 0, headingFont: "jetbrains-mono", bodyFont: "jetbrains-mono", titleScale: 86, bodyScale: 90, layout: "editorial", numberStyle: "big" },
  },
  {
    id: "candy",
    name: "Конфета",
    design: { from: "#ffe3f1", to: "#ffd0e6", accent: "#ff3d8b", text: "#3a0d24", muted: "#8a4a68", glowColor: "#ffffff", headingFont: "unbounded", bodyFont: "manrope", titleScale: 84, layout: "card", numberStyle: "badge", glowStrength: 60 },
  },
];

/* ---------- Нормализация (сервер и клиент) ---------- */

const HEX = /^#[0-9a-f]{6}$/i;

function color(v: unknown, fallback: string) {
  if (typeof v !== "string") return fallback;
  let s = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  return HEX.test(s) ? s.toLowerCase() : fallback;
}
function num(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}
function bool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}
function str(v: unknown, max: number, fallback: string) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fallback;
}

/** Любой мусор → валидный Design (значения вне диапазона зажимаются). */
export function normalizeDesign(input: unknown, base: Design = DEFAULT_DESIGN): Design {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const fontIds = FONTS.map((f) => f.id);
  return {
    from: color(i.from, base.from),
    to: color(i.to, base.to),
    accent: color(i.accent, base.accent),
    text: color(i.text, base.text),
    muted: color(i.muted, base.muted),
    glowColor: color(i.glowColor, base.glowColor),
    bgMode: oneOf(i.bgMode, ["gradient", "solid"] as const, base.bgMode),
    angle: num(i.angle, 0, 360, base.angle),
    glowStrength: num(i.glowStrength, 0, 100, base.glowStrength),
    pattern: oneOf(i.pattern, ["none", "dots", "grid"] as const, base.pattern),
    headingFont: oneOf(i.headingFont, fontIds, base.headingFont),
    bodyFont: oneOf(i.bodyFont, fontIds, base.bodyFont),
    titleScale: num(i.titleScale, 60, 140, base.titleScale),
    bodyScale: num(i.bodyScale, 70, 140, base.bodyScale),
    layout: oneOf(i.layout, LAYOUTS.map((l) => l.id), base.layout),
    align: oneOf(i.align, ["left", "center"] as const, base.align),
    format: oneOf(i.format, FORMATS.map((f) => f.id), base.format),
    radius: num(i.radius, 0, 80, base.radius),
    numberStyle: oneOf(i.numberStyle, ["big", "badge", "none"] as const, base.numberStyle),
    accentBar: bool(i.accentBar, base.accentBar),
    showLabel: bool(i.showLabel, base.showLabel),
    showCounter: bool(i.showCounter, base.showCounter),
    showProgress: bool(i.showProgress, base.showProgress),
    showArrow: bool(i.showArrow, base.showArrow),
    label: str(i.label, 40, base.label),
    footer: str(i.footer, 40, base.footer),
    logoMediaId:
      typeof i.logoMediaId === "number" && Number.isInteger(i.logoMediaId) && i.logoMediaId > 0
        ? i.logoMediaId
        : i.logoMediaId === null
          ? null
          : base.logoMediaId,
    photoDim: num(i.photoDim, 0, 100, base.photoDim),
  };
}

export function presetDesign(id: string): Design | null {
  const p = PRESETS.find((x) => x.id === id);
  return p ? normalizeDesign(p.design, DEFAULT_DESIGN) : null;
}

export function formatSize(id: FormatId) {
  const f = FORMATS.find((x) => x.id === id) ?? FORMATS[0];
  return { w: f.w, h: f.h };
}

/* ---------- Цветовые хелперы ---------- */

export function hexToRgb(hex: string) {
  const h = color(hex, "#000000").slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
export function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, a))})`;
}
/** Относительная яркость 0..1. */
export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function isLight(hex: string) {
  return luminance(hex) > 0.45;
}
export function contrastOn(hex: string) {
  return isLight(hex) ? "#101014" : "#ffffff";
}
