import { ImageResponse } from "next/og";
import {
  contrastOn,
  DEFAULT_DESIGN,
  formatSize,
  isLight,
  normalizeDesign,
  presetDesign,
  PRESETS,
  rgba,
  type Design,
  type FontId,
} from "./design";
import { loadFontsFor, satoriFamily } from "./fonts";

/**
 * Рендер слайдов карусели без внешних сервисов и ключей:
 * HTML/CSS › PNG через satori (встроен в Next.js). Кириллица отрисовывается
 * идеально, в отличие от AI-генераторов картинок, которые коверкают текст.
 *
 * Весь внешний вид задаётся объектом Design (см. design.ts) — цвета, шрифты,
 * макет, формат, элементы. Шрифты грузятся через fonts.ts с запасными путями.
 */

export type SlideSpec = {
  kind:
    | "cover"
    | "point"
    | "outro"
    | "checklist"
    | "steps"
    | "compare"
    | "stats"
    | "quote"
    | "code"
    | "cta"
    | "timeline"
    | "faq"
    | "price"
    | "bars"
    | "ticker"
    | "logos";
  title: string;
  body?: string;
  /** Короткая метка сверху слева («ДАЙДЖЕСТ · 12 МАЯ»). */
  label?: string;
  /** data:image/jpeg;base64,… — опциональный фото-фон. */
  photo?: string | null;
  items?: string[]; // checklist, steps
  stats?: { value: string; label: string }[]; // stats (1–3)
  left?: { title: string; items: string[] }; // compare
  right?: { title: string; items: string[] }; // compare
  author?: string; // quote
  codeLines?: string[]; // code
  button?: string; // cta
  bars?: { label: string; value: number }[]; // bars
  question?: string; // faq
  answer?: string; // faq
  price?: string; // price
  period?: string; // price
  tags?: string[]; // logos
};

export type SlideExtras = {
  /** data:image/png|jpeg;base64,… — логотип в подвале. */
  logo?: string | null;
};

/* Обратная совместимость: старые «темы» = пресеты. */
export type Theme = { id: string; name: string };
export const THEMES: Theme[] = PRESETS.map((p) => ({ id: p.id, name: p.name }));
export function themeById(id?: string): Design {
  return (id ? presetDesign(id) : null) ?? DEFAULT_DESIGN;
}

/**
 * Защита от «тофу»: шрифты Google покрывают latin + latin-ext + cyrillic,
 * но НЕ содержат ₽, →, ✓, ★ и подобных знаков. Такие символы заменяем на
 * безопасные аналоги, всё остальное вне покрытия — убираем.
 */
const GLYPH_MAP: [RegExp, string][] = [
  [/₽/g, " руб."],
  [/₸/g, " тг"],
  [/₴/g, " грн"],
  [/[₿]/g, "BTC"],
  [/[→⇒➔➜]/g, "›"],
  [/[←⇐]/g, "‹"],
  [/[✓✔☑]/g, "+"],
  [/[✗✘✖×]/g, "x"],
  [/[★☆✦✧]/g, "*"],
  [/[≈～]/g, "~"],
  [/[≥]/g, ">="],
  [/[≤]/g, "<="],
  [/[≠]/g, "!="],
  [/[•·‣]/g, "•"],
  [/[—–‒]/g, "—"],
  [/[“”„]/g, "«"],
  [/[’‘]/g, "'"],
  [/\u00a0/g, " "],
];

/** Диапазоны, которые гарантированно есть в подключённых подмножествах шрифтов. */
const SUPPORTED = /[\u0020-\u024F\u0259\u02BB-\u02BC\u02C6\u02DA\u02DC\u0300-\u0304\u0308\u0329\u0400-\u052F\u2000-\u206F\u2074\u20AC\u2116\u2122\u2191\u2193\u2212\u2215\n]/;

export function cleanSlideText(s: string) {
  let out = s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\*\*|__|`/g, "");
  for (const [re, to] of GLYPH_MAP) out = out.replace(re, to);
  out = [...out].filter((ch) => SUPPORTED.test(ch)).join("");
  return out.replace(/\s+/g, " ").trim();
}

/** Поправка кегля на «ширину» гарнитуры, чтобы длинные заголовки не вылезали. */
const WIDTH_FACTOR: Partial<Record<FontId, number>> = {
  unbounded: 0.8,
  "rubik-mono-one": 0.74,
  "stalinist-one": 0.74,
  "jetbrains-mono": 0.86,
  "ibm-plex-mono": 0.88,
  "fira-code": 0.88,
  "pixelify-sans": 0.9,
  tektur: 0.9,
  "russo-one": 0.9,
  montserrat: 0.94,
  "roboto-slab": 0.95,
  bitter: 0.95,
  geologica: 0.95,
  manrope: 0.98,
  oswald: 1.3,
  "alumni-sans": 1.45,
  cormorant: 1.12,
  "playfair-display": 1.0,
  caveat: 1.3,
  "yeseva-one": 1.0,
};

function titleSize(len: number, kind: SlideSpec["kind"]) {
  if (kind === "cover") return len <= 24 ? 112 : len <= 40 ? 92 : 76;
  return len <= 28 ? 74 : len <= 48 ? 62 : 52;
}

function bodySize(len: number) {
  return len <= 120 ? 42 : len <= 190 ? 36 : 31;
}

const W = 1080;
const PAD = 72;


/* ---------- Фоновые узоры, рамки и обработка фото ---------- */

function patternLayer(d: Design, W: number, H: number, light: boolean) {
  const ink = rgba(d.text, light ? 0.14 : 0.12);
  const base = { position: "absolute" as const, top: 0, left: 0, width: W, height: H, display: "flex" };
  switch (d.pattern) {
    case "dots":
      return <div style={{ ...base, backgroundImage: `radial-gradient(circle, ${ink} 2px, rgba(0,0,0,0) 3px)`, backgroundSize: "44px 44px" }} />;
    case "grid":
      return (
        <div
          style={{
            ...base,
            backgroundImage: `linear-gradient(${ink} 1px, rgba(0,0,0,0) 1px), linear-gradient(90deg, ${ink} 1px, rgba(0,0,0,0) 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      );
    case "stripes":
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${rgba(d.accent, 0.16)} 0px, ${rgba(d.accent, 0.16)} 18px, rgba(0,0,0,0) 18px, rgba(0,0,0,0) 40px)` }} />;
    case "scanlines":
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(180deg, ${rgba(d.text, 0.1)} 0px, ${rgba(d.text, 0.1)} 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px)` }} />;
    case "halftone":
      return (
        <div style={{ ...base, display: "flex", flexWrap: "wrap", alignContent: "flex-start", opacity: 0.5 }}>
          {Array.from({ length: 11 * 11 }).map((_, i) => {
            const row = Math.floor(i / 11);
            const size = 6 + row * 2.6;
            return (
              <div key={i} style={{ display: "flex", width: W / 11, height: H / 11, alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", width: size, height: size, borderRadius: size, backgroundColor: rgba(d.accent, 0.5) }} />
              </div>
            );
          })}
        </div>
      );
    case "zigzag":
      return (
        <div style={{ ...base, flexDirection: "column", justifyContent: "space-between", padding: "40px 0" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: "flex", height: 10, width: W, backgroundImage: `repeating-linear-gradient(135deg, ${rgba(d.accent, 0.3)} 0 12px, rgba(0,0,0,0) 12px 24px)` }} />
          ))}
        </div>
      );
    case "memphis":
      return (
        <div style={{ ...base }}>
          <div style={{ position: "absolute", top: 90, right: 90, width: 150, height: 150, borderRadius: 150, border: `14px solid ${rgba(d.accent, 0.5)}`, display: "flex" }} />
          <div style={{ position: "absolute", bottom: 150, left: 70, width: 120, height: 120, display: "flex", backgroundColor: rgba(d.glowColor, 0.45), transform: "rotate(18deg)" }} />
          <div style={{ position: "absolute", top: 320, left: 60, width: 190, height: 18, display: "flex", backgroundImage: `repeating-linear-gradient(90deg, ${rgba(d.accent, 0.55)} 0 16px, rgba(0,0,0,0) 16px 32px)` }} />
          <div style={{ position: "absolute", bottom: 90, right: 120, width: 0, height: 0, display: "flex", borderLeft: "56px solid transparent", borderRight: "56px solid transparent", borderBottom: `96px solid ${rgba(d.glowColor, 0.4)}` }} />
        </div>
      );
    case "noise":
      return (
        <div style={{ ...base, flexWrap: "wrap", alignContent: "flex-start", opacity: 0.25 }}>
          {Array.from({ length: 220 }).map((_, i) => {
            const x = (i * 97) % W;
            const y = (i * 181) % H;
            return <div key={i} style={{ position: "absolute", left: x, top: y, width: 3, height: 3, display: "flex", backgroundColor: rgba(d.text, 0.8) }} />;
          })}
        </div>
      );
    default:
      return null;
  }
}

function frameLayer(d: Design, W: number, H: number) {
  const c = d.accent;
  if (d.frame === "none") return null;
  if (d.frame === "line") return <div style={{ position: "absolute", top: 34, left: 34, width: W - 68, height: H - 68, display: "flex", border: `3px solid ${rgba(c, 0.75)}` }} />;
  if (d.frame === "thick") return <div style={{ position: "absolute", top: 20, left: 20, width: W - 40, height: H - 40, display: "flex", border: `14px solid ${c}` }} />;
  if (d.frame === "inset") return <div style={{ position: "absolute", top: 46, left: 46, width: W - 92, height: H - 92, display: "flex", border: `2px solid ${rgba(c, 0.5)}`, outline: `10px solid ${rgba(c, 0.12)}` }} />;
  if (d.frame === "tape")
    return (
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex" }}>
        <div style={{ position: "absolute", top: 36, left: 90, width: 220, height: 56, display: "flex", backgroundColor: rgba(c, 0.55), transform: "rotate(-6deg)" }} />
        <div style={{ position: "absolute", bottom: 40, right: 80, width: 190, height: 52, display: "flex", backgroundColor: rgba(c, 0.45), transform: "rotate(5deg)" }} />
      </div>
    );
  // corners
  const L = 110;
  const t = 8;
  const corner = (pos: Record<string, number>) => ({ position: "absolute" as const, display: "flex", backgroundColor: c, ...pos });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex" }}>
      <div style={corner({ top: 40, left: 40, width: L, height: t })} />
      <div style={corner({ top: 40, left: 40, width: t, height: L })} />
      <div style={corner({ top: 40, right: 40, width: L, height: t })} />
      <div style={corner({ top: 40, right: 40, width: t, height: L })} />
      <div style={corner({ bottom: 40, left: 40, width: L, height: t })} />
      <div style={corner({ bottom: 40, left: 40, width: t, height: L })} />
      <div style={corner({ bottom: 40, right: 40, width: L, height: t })} />
      <div style={corner({ bottom: 40, right: 40, width: t, height: L })} />
    </div>
  );
}

/** CSS-фильтр фото: satori поддерживает filter на img. */
function photoFilter(d: Design) {
  if (d.photoEffect === "mono") return "grayscale(1) contrast(1.1)";
  if (d.photoEffect === "sepia") return "sepia(0.75) contrast(1.05)";
  if (d.photoEffect === "duotone") return "grayscale(1) contrast(1.25)";
  return undefined;
}


/** Фото как часть композиции: половина кадра, лента, круг или коллаж из двух частей. */
function photoInset(src: string, d: Design, W: number, H: number) {
  const f = photoFilter(d);
  const tint =
    d.photoEffect === "duotone"
      ? { position: "absolute" as const, display: "flex", backgroundImage: `linear-gradient(160deg, ${rgba(d.from, 0.8)}, ${rgba(d.accent, 0.72)})` }
      : null;

  if (d.photoMode === "half") {
    const h = Math.round(H * 0.46);
    return (
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: h, display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={W} height={h} style={{ width: W, height: h, objectFit: "cover", ...(f ? { filter: f } : {}) }} alt="" />
        {tint ? <div style={{ ...tint, top: 0, left: 0, width: W, height: h }} /> : null}
        <div style={{ position: "absolute", bottom: 0, left: 0, width: W, height: 8, display: "flex", backgroundColor: d.accent }} />
      </div>
    );
  }
  if (d.photoMode === "band") {
    const bh = Math.round(H * 0.3);
    const top = Math.round(H * 0.5 - bh / 2);
    return (
      <div style={{ position: "absolute", top, left: 0, width: W, height: bh, display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={W} height={bh} style={{ width: W, height: bh, objectFit: "cover", ...(f ? { filter: f } : {}) }} alt="" />
        {tint ? <div style={{ ...tint, top: 0, left: 0, width: W, height: bh }} /> : null}
      </div>
    );
  }
  if (d.photoMode === "circle") {
    const size = Math.round(W * 0.52);
    return (
      <div style={{ position: "absolute", top: Math.round(H * 0.06), right: -Math.round(size * 0.14), width: size, height: size, display: "flex", borderRadius: size, overflow: "hidden", border: `10px solid ${d.accent}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", ...(f ? { filter: f } : {}) }} alt="" />
        {tint ? <div style={{ ...tint, top: 0, left: 0, width: size, height: size }} /> : null}
      </div>
    );
  }
  // collage: две части одного фото со смещением — «разрезанный» кадр
  const halfW = Math.round(W * 0.44);
  const hh = Math.round(H * 0.34);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex" }}>
      <div style={{ position: "absolute", top: Math.round(H * 0.05), left: 0, width: halfW, height: hh, display: "flex", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={W} height={hh} style={{ width: W, height: hh, objectFit: "cover", ...(f ? { filter: f } : {}) }} alt="" />
      </div>
      <div style={{ position: "absolute", top: Math.round(H * 0.05 + 28), right: 0, width: halfW, height: hh, display: "flex", overflow: "hidden", border: `6px solid ${d.accent}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={W} height={hh} style={{ width: W, height: hh, objectFit: "cover", objectPosition: "right", ...(f ? { filter: f } : {}) }} alt="" />
      </div>
    </div>
  );
}

/* ---------- Шаблоны из библиотеки (по мотивам forevercomponents) ---------- */

type TCtx = {
  d: Design;
  headFamily: string;
  bodyFamily: string;
  textColor: string;
  mutedColor: string;
  tSize: number;
  bSize: number;
  center: boolean;
  textAlign: "left" | "center";
  alignItems: "flex-start" | "center";
};

function THeader({ title, ctx }: { title: string; ctx: TCtx }) {
  if (!title) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.alignItems, marginBottom: 44 }}>
      <div
        style={{
          display: "flex",
          fontFamily: ctx.headFamily,
          fontSize: Math.round(ctx.tSize * 0.86),
          fontWeight: 700,
          lineHeight: 1.12,
          letterSpacing: -1,
          textAlign: ctx.textAlign,
          color: ctx.textColor,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", width: 110, height: 10, borderRadius: 5, backgroundColor: ctx.d.accent, marginTop: 26 }} />
    </div>
  );
}

function TemplateBlock({ spec, ctx }: { spec: SlideSpec; ctx: TCtx }) {
  const { d, headFamily, bodyFamily, textColor, mutedColor } = ctx;
  const title = cleanSlideText(spec.title);
  const body = spec.body ? cleanSlideText(spec.body) : "";
  const bs = Math.round(36 * (d.bodyScale / 100));
  const wrap: Record<string, unknown> = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: ctx.alignItems,
    width: "100%",
    height: "100%",
  };

  if (spec.kind === "checklist") {
    const items = (spec.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 5);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "column", gap: 26, width: "100%" }}>
          {items.map((t, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 24 }}>
              <div
                style={{
                  display: "flex",
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  border: `5px solid ${d.accent}`,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", width: 24, height: 13, borderLeft: `7px solid ${d.accent}`, borderBottom: `7px solid ${d.accent}`, transform: "rotate(-45deg) translate(2px, -3px)" }} />
              </div>
              <div style={{ display: "flex", flex: 1, fontFamily: bodyFamily, fontSize: bs + 2, lineHeight: 1.32, color: textColor }}>
                {t}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === "steps") {
    const items = (spec.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 4);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "column", gap: 30, width: "100%" }}>
          {items.map((t, i) => {
            const sep = t.indexOf(" — ");
            const head = sep > 0 ? t.slice(0, sep) : t;
            const sub = sep > 0 ? t.slice(sep + 3) : "";
            return (
              <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 26 }}>
                <div
                  style={{
                    display: "flex",
                    width: 76,
                    height: 76,
                    borderRadius: 76,
                    flexShrink: 0,
                    backgroundColor: d.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: headFamily,
                    fontWeight: 700,
                    fontSize: 36,
                    color: contrastOn(d.accent),
                  }}
                >
                  {String(i + 1)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontFamily: headFamily, fontSize: bs + 8, fontWeight: 700, lineHeight: 1.2, color: textColor }}>
                    {head}
                  </div>
                  {sub ? (
                    <div style={{ display: "flex", marginTop: 6, fontFamily: bodyFamily, fontSize: bs - 6, lineHeight: 1.3, color: mutedColor }}>
                      {sub}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (spec.kind === "quote") {
    const big = Math.round(58 * (d.titleScale / 100));
    return (
      <div style={wrap}>
        <div style={{ display: "flex", fontFamily: headFamily, fontSize: 220, fontWeight: 700, lineHeight: 0.6, color: d.accent, marginBottom: 36 }}>
          «
        </div>
        <div style={{ display: "flex", fontFamily: headFamily, fontSize: big, fontWeight: 700, lineHeight: 1.18, letterSpacing: -0.5, textAlign: ctx.textAlign, color: textColor }}>
          {body || title}
        </div>
        {spec.author ? (
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 18, marginTop: 44, fontFamily: bodyFamily, fontSize: 30, letterSpacing: 2, color: mutedColor }}>
            <div style={{ display: "flex", width: 60, height: 4, backgroundColor: d.accent }} />
            {cleanSlideText(spec.author).toUpperCase()}
          </div>
        ) : null}
      </div>
    );
  }

  if (spec.kind === "stats") {
    const stats = (spec.stats ?? []).filter((x) => cleanSlideText(x?.value)).slice(0, 3);
    const sizeByN: Record<number, number> = { 1: 220, 2: 148, 3: 112 };
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", width: "100%", gap: 44 }}>
          {stats.map((st, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
              <div style={{ display: "flex", fontFamily: headFamily, fontWeight: 700, fontSize: sizeByN[stats.length] ?? 112, lineHeight: 1, letterSpacing: -2, color: d.accent }}>
                {cleanSlideText(st.value)}
              </div>
              <div style={{ display: "flex", marginTop: 18, fontFamily: bodyFamily, fontSize: 30, lineHeight: 1.3, textAlign: "center", color: mutedColor }}>
                {cleanSlideText(st.label)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === "compare") {
    const cols = [spec.left, spec.right].map((c) => ({
      title: cleanSlideText(c?.title ?? ""),
      items: (c?.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 4),
    }));
    return (
      <div style={{ ...wrap, flexDirection: "column" }}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "row", width: "100%", gap: 36 }}>
          {cols.map((c, ci) => (
            <div
              key={ci}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: 40,
                borderRadius: ctx.d.radius,
                backgroundColor: rgba(textColor, 0.07),
                border: `3px solid ${ci === 1 ? d.accent : rgba(mutedColor, 0.4)}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 26 }}>
                <div
                  style={{
                    display: "flex",
                    width: 44,
                    height: 44,
                    borderRadius: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: headFamily,
                    fontSize: 28,
                    fontWeight: 700,
                    backgroundColor: ci === 1 ? d.accent : rgba(mutedColor, 0.25),
                    color: ci === 1 ? contrastOn(d.accent) : textColor,
                  }}
                >
                  {ci === 1 ? "+" : "×"}
                </div>
                <div style={{ display: "flex", fontFamily: headFamily, fontSize: 34, fontWeight: 700, color: textColor }}>{c.title}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {c.items.map((t, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "row", gap: 12, fontFamily: bodyFamily, fontSize: bs - 4, lineHeight: 1.32, color: mutedColor }}>
                    <div style={{ display: "flex", width: 10, height: 10, borderRadius: 10, marginTop: 10, flexShrink: 0, backgroundColor: ci === 1 ? d.accent : mutedColor }} />
                    <div style={{ display: "flex", flex: 1 }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === "code") {
    const lines = (spec.codeLines ?? []).slice(0, 9);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            backgroundColor: "rgba(13,17,23,0.94)",
            borderRadius: ctx.d.radius,
            border: `3px solid ${rgba(d.accent, 0.45)}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, padding: "22px 28px", borderBottom: "2px solid rgba(255,255,255,0.1)" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ display: "flex", width: 18, height: 18, borderRadius: 18, backgroundColor: c }} />
            ))}
            <div style={{ display: "flex", marginLeft: 14, fontFamily: bodyFamily, fontSize: 26, color: "#8b949e" }}>terminal</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "30px 32px", gap: 16 }}>
            {lines.map((ln, i) => {
              const t = String(ln ?? "");
              const col = t.startsWith("$") || t.startsWith(">") ? d.accent : t.startsWith("#") ? "#8b949e" : t.startsWith("+") ? "#3fd97b" : "#dbe4f0";
              return (
                <div key={i} style={{ display: "flex", fontFamily: bodyFamily, fontSize: 32, lineHeight: 1.4, color: col }}>
                  {t}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (spec.kind === "cta") {
    const big = Math.round(84 * (d.titleScale / 100));
    return (
      <div style={wrap}>
        <div style={{ display: "flex", fontFamily: headFamily, fontSize: big, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1.5, textAlign: ctx.textAlign, color: textColor }}>
          {title}
        </div>
        {body ? (
          <div style={{ display: "flex", marginTop: 34, fontFamily: bodyFamily, fontSize: bs + 2, lineHeight: 1.38, textAlign: ctx.textAlign, color: mutedColor }}>
            {body}
          </div>
        ) : null}
        {spec.button ? (
          <div
            style={{
              display: "flex",
              marginTop: 48,
              padding: "26px 54px",
              borderRadius: ctx.d.radius,
              backgroundColor: d.accent,
              fontFamily: headFamily,
              fontSize: 44,
              fontWeight: 700,
              color: contrastOn(d.accent),
            }}
          >
            {cleanSlideText(spec.button)}
          </div>
        ) : null}
      </div>
    );
  }

  if (spec.kind === "timeline") {
    const items = (spec.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 5);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {items.map((t, i) => {
            const sep = t.indexOf(" — ");
            const head = sep > 0 ? t.slice(0, sep) : "";
            const rest = sep > 0 ? t.slice(sep + 3) : t;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "row", width: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 54, flexShrink: 0 }}>
                  <div style={{ display: "flex", width: 22, height: 22, borderRadius: 22, backgroundColor: d.accent, marginTop: 8 }} />
                  {i < items.length - 1 ? <div style={{ display: "flex", flex: 1, width: 4, backgroundColor: rgba(d.accent, 0.4) }} /> : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingBottom: i < items.length - 1 ? 30 : 0 }}>
                  {head ? (
                    <div style={{ display: "flex", fontFamily: headFamily, fontSize: 28, fontWeight: 700, letterSpacing: 2, color: d.accent }}>
                      {head.toUpperCase()}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", marginTop: 6, fontFamily: bodyFamily, fontSize: bs, lineHeight: 1.3, color: textColor }}>{rest}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (spec.kind === "faq") {
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "row", gap: 22, width: "100%", marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              width: 70,
              height: 70,
              flexShrink: 0,
              borderRadius: ctx.d.radius,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: d.accent,
              fontFamily: headFamily,
              fontSize: 40,
              fontWeight: 700,
              color: contrastOn(d.accent),
            }}
          >
            ?
          </div>
          <div style={{ display: "flex", flex: 1, fontFamily: headFamily, fontSize: Math.round(bs * 1.35), fontWeight: 700, lineHeight: 1.22, color: textColor }}>
            {cleanSlideText(spec.question ?? "")}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            padding: 36,
            borderRadius: ctx.d.radius,
            backgroundColor: rgba(textColor, 0.07),
            borderLeft: `8px solid ${d.accent}`,
            fontFamily: bodyFamily,
            fontSize: bs,
            lineHeight: 1.4,
            color: mutedColor,
          }}
        >
          {cleanSlideText(spec.answer ?? "")}
        </div>
      </div>
    );
  }

  if (spec.kind === "price") {
    const items = (spec.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 5);
    return (
      <div style={wrap}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.alignItems, width: "100%" }}>
          <div style={{ display: "flex", fontFamily: headFamily, fontSize: Math.round(bs * 1.2), fontWeight: 700, letterSpacing: 3, color: mutedColor, marginBottom: 14 }}>
            {title.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontFamily: headFamily, fontSize: Math.round(128 * (d.titleScale / 100)), fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: d.accent }}>
            {cleanSlideText(spec.price ?? "")}
          </div>
          {spec.period ? (
            <div style={{ display: "flex", marginTop: 10, fontFamily: bodyFamily, fontSize: bs - 4, color: mutedColor }}>{cleanSlideText(spec.period)}</div>
          ) : null}
          <div style={{ display: "flex", width: "100%", height: 3, backgroundColor: rgba(mutedColor, 0.4), margin: "30px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
            {items.map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                <div style={{ display: "flex", width: 26, height: 14, marginTop: 6, flexShrink: 0, borderLeft: `7px solid ${d.accent}`, borderBottom: `7px solid ${d.accent}`, transform: "rotate(-45deg)" }} />
                <div style={{ display: "flex", flex: 1, fontFamily: bodyFamily, fontSize: bs - 2, lineHeight: 1.3, color: textColor }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (spec.kind === "bars") {
    const bars = (spec.bars ?? []).filter((b) => cleanSlideText(b?.label)).slice(0, 5);
    const max = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", width: "100%", height: 330, gap: 30 }}>
          {bars.map((b, i) => {
            const v = Number(b.value) || 0;
            const h = Math.max(28, Math.round((v / max) * 260));
            const main = i === bars.length - 1;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: headFamily, fontSize: 44, fontWeight: 700, color: main ? d.accent : mutedColor, marginBottom: 10 }}>
                  {String(v)}
                </div>
                <div style={{ display: "flex", width: "100%", height: h, borderRadius: Math.min(16, ctx.d.radius), backgroundColor: main ? d.accent : rgba(mutedColor, 0.45) }} />
                <div style={{ display: "flex", marginTop: 14, fontFamily: bodyFamily, fontSize: 28, textAlign: "center", color: mutedColor }}>
                  {cleanSlideText(b.label)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (spec.kind === "ticker") {
    const rows = (spec.items ?? []).map(cleanSlideText).filter(Boolean).slice(0, 3);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 14 }}>
          {rows.map((t, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: "100%",
                padding: "16px 22px",
                backgroundColor: i % 2 === 0 ? d.accent : "rgba(0,0,0,0)",
                border: `4px solid ${d.accent}`,
                fontFamily: headFamily,
                fontSize: Math.round(bs * 1.12),
                fontWeight: 700,
                letterSpacing: 1,
                color: i % 2 === 0 ? contrastOn(d.accent) : textColor,
              }}
            >
              {t.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === "logos") {
    const tags = (spec.tags ?? []).map(cleanSlideText).filter(Boolean).slice(0, 8);
    return (
      <div style={wrap}>
        <THeader title={title} ctx={ctx} />
        <div style={{ display: "flex", flexWrap: "wrap", width: "100%", gap: 16, justifyContent: ctx.center ? "center" : "flex-start" }}>
          {tags.map((t, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "18px 28px",
                borderRadius: ctx.d.radius,
                border: `3px solid ${rgba(d.accent, 0.8)}`,
                backgroundColor: rgba(d.accent, 0.12),
                fontFamily: headFamily,
                fontSize: 34,
                fontWeight: 700,
                color: textColor,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}


function SlideView({
  spec,
  index,
  total,
  d,
  extras,
}: {
  spec: SlideSpec;
  index: number;
  total: number;
  d: Design;
  extras: SlideExtras;
}) {
  const { h: H } = formatSize(d.format);
  const rawTitle = cleanSlideText(spec.title);
  const title = d.upperTitle ? rawTitle.toUpperCase() : rawTitle;
  const body = spec.body ? cleanSlideText(spec.body) : "";
  const num = String(index).padStart(2, "0");
  const isOutro = spec.kind === "outro";
  const hasPhoto = Boolean(spec.photo);
  const fullPhoto = hasPhoto && d.photoMode === "fill";
  const light = isLight(d.from) && !fullPhoto;

  const textColor = fullPhoto ? "#ffffff" : d.text;
  const mutedColor = fullPhoto ? "#e6e6ee" : d.muted;
  const center = d.align === "center";
  // «Полоса» в центрированном виде превращается в горизонтальную чёрточку.
  const layout = d.layout === "bar" && center ? "classic" : d.layout;
  const isCard = layout === "card";
  const compact = ["magazine", "brutal", "sticker", "cover-split"].includes(layout);

  const headFamily = `${satoriFamily(d.headingFont, "lat")}, ${satoriFamily(d.headingFont, "cyr")}`;
  const bodyFamily = `${satoriFamily(d.bodyFont, "lat")}, ${satoriFamily(d.bodyFont, "cyr")}`;
  const brand = Boolean(d.footer.trim() || extras.logo);
  const widthK = WIDTH_FACTOR[d.headingFont] ?? 1;

  const tSize = Math.round(
    titleSize(title.length, spec.kind) *
      (d.titleScale / 100) *
      widthK *
      (isCard || compact ? 0.9 : 1) *
      (layout === "bar" ? 0.94 : 1) *
      (layout === "poster" ? 0.72 : 1) *
      (layout === "swiss" ? 0.86 : 1),
  );
  const bSize = Math.round(bodySize(body.length) * (d.bodyScale / 100) * (isCard || compact ? 0.9 : 1));
  const alignItems = center ? "center" : "flex-start";
  const textAlign = center ? "center" : "left";

  /* ---- фон ---- */
  const bgStyle =
    d.bgMode === "solid"
      ? { backgroundColor: d.from }
      : { backgroundImage: `linear-gradient(${d.angle}deg, ${d.from} 0%, ${d.to} 100%)` };

  const dimK = d.photoDim / 100;
  const overlay = `linear-gradient(180deg, rgba(5,6,15,${(0.2 + 0.45 * dimK).toFixed(2)}) 0%, rgba(5,6,15,${(0.45 + 0.45 * dimK).toFixed(2)}) 100%)`;

  /* ---- элементы контента ---- */
  const showNumber = spec.kind === "point" && d.numberStyle !== "none";
  const bigNumber = d.numberStyle === "big";
  const numSize = layout === "editorial" ? 150 : 190;

  const compactNumber = ["sticker", "brutal", "magazine", "cover-split"].includes(layout);
  const numberEl = showNumber ? (
    bigNumber ? (
      <div
        style={{
          display: "flex",
          fontFamily: headFamily,
          fontSize: numSize,
          fontWeight: 700,
          lineHeight: 1,
          color: d.accent,
          marginBottom: layout === "editorial" ? 0 : 28,
        }}
      >
        {num}
      </div>
    ) : (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 124,
          height: 124,
          borderRadius: 124,
          backgroundColor: d.accent,
          color: contrastOn(d.accent),
          fontFamily: headFamily,
          fontSize: 56,
          fontWeight: 700,
          marginBottom: 36,
        }}
      >
        {num}
      </div>
    )
  ) : d.accentBar && !["bar", "editorial", "magazine", "poster", "swiss", "bandsplit"].includes(layout) ? (
    <div
      style={{
        display: "flex",
        width: 120,
        height: 14,
        borderRadius: 7,
        backgroundColor: d.accent,
        marginBottom: 44,
      }}
    />
  ) : null;

  const titleEl = (
    <div
      style={{
        display: "flex",
        fontFamily: headFamily,
        fontSize: tSize,
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: d.headingFont === "jetbrains-mono" ? 0 : -1.2,
        textAlign,
        color: textColor,
      }}
    >
      {title}
    </div>
  );

  const bodyEl = body ? (
    <div
      style={{
        display: "flex",
        marginTop: 34,
        fontFamily: bodyFamily,
        fontSize: bSize,
        lineHeight: 1.38,
        fontWeight: 400,
        textAlign,
        color: mutedColor,
      }}
    >
      {body}
    </div>
  ) : null;

  const textBlock = (
    <div style={{ display: "flex", flexDirection: "column", alignItems, flexShrink: 1 }}>
      {titleEl}
      {bodyEl}
    </div>
  );

  const extended = !["cover", "point", "outro"].includes(spec.kind);
  const tctx: TCtx = {
    d,
    headFamily,
    bodyFamily,
    textColor,
    mutedColor,
    tSize,
    bSize,
    center,
    textAlign,
    alignItems: center ? "center" : "flex-start",
  };

  let content;
  if (extended) {
    content = <TemplateBlock spec={spec} ctx={tctx} />;
  } else if (layout === "editorial") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems }}>
          {numberEl}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 5,
              marginTop: showNumber && bigNumber ? 18 : 0,
              backgroundColor: d.accent,
              opacity: 0.9,
            }}
          />
        </div>
        {textBlock}
      </div>
    );
  } else if (layout === "bar") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}>
          <div style={{ display: "flex", width: 14, borderRadius: 7, backgroundColor: d.accent, marginRight: 44, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flexShrink: 1 }}>
            {numberEl}
            {textBlock}
          </div>
        </div>
      </div>
    );
  } else if (layout === "magazine") {
    // Журнальная вырезка: цветная плашка-врезка под крупным заголовком
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%" }}>
        {/* верхний «колонтитул» журнала: линия + крупный номер полосы */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ display: "flex", width: "100%", height: 4, backgroundColor: textColor, marginBottom: 18 }} />
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", fontFamily: headFamily, fontSize: 150, fontWeight: 700, lineHeight: 0.9, letterSpacing: -4, color: rgba(textColor, 0.14) }}>
              {num}
            </div>
            <div style={{ display: "flex", maxWidth: 300, fontFamily: bodyFamily, fontSize: 24, lineHeight: 1.35, textAlign: "right", color: rgba(mutedColor, 0.75) }}>
              {cleanSlideText(d.footer) || `полоса ${index} из ${total}`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems }}>
          <div style={{ display: "flex", backgroundColor: d.accent, padding: "10px 22px", marginBottom: 22 }}>
            <div style={{ display: "flex", fontFamily: headFamily, fontSize: 26, fontWeight: 700, letterSpacing: 4, color: contrastOn(d.accent) }}>
              {(d.label || spec.label || "материал").toUpperCase().slice(0, 22)}
            </div>
          </div>
          {titleEl}
          {body ? (
            <div style={{ display: "flex", marginTop: 30, paddingLeft: center ? 0 : 26, borderLeft: center ? undefined : `6px solid ${d.accent}`, fontFamily: bodyFamily, fontSize: bSize, lineHeight: 1.4, textAlign, color: mutedColor }}>
              {body}
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (layout === "cover-split") {
    // Половина / половина: цветной блок с текстом и свободная зона под фото
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems,
            width: "100%",
            padding: 46,
            backgroundColor: rgba(d.from, 0.92),
            borderTop: `10px solid ${d.accent}`,
          }}
        >
          {numberEl}
          {titleEl}
          {bodyEl}
        </div>
      </div>
    );
  } else if (layout === "diagonal") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems, width: "100%", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 26 }}>
          <div style={{ display: "flex", width: 0, height: 0, borderTop: `46px solid ${d.accent}`, borderRight: "46px solid transparent" }} />
          {showNumber ? (
            <div style={{ display: "flex", fontFamily: headFamily, fontSize: 64, fontWeight: 700, color: d.accent }}>{num}</div>
          ) : null}
        </div>
        {titleEl}
        {bodyEl}
      </div>
    );
  } else if (layout === "bandsplit") {
    // Ленты: заголовок на цветных полосах, как в Bauhaus-композиции
    const words = title.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > 16 && cur) {
        lines.push(cur.trim());
        cur = w;
      } else cur = `${cur} ${w}`;
    }
    if (cur.trim()) lines.push(cur.trim());
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", gap: 10 }}>
        {lines.slice(0, 4).map((ln, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignSelf: center ? "center" : "flex-start",
              backgroundColor: i % 2 === 0 ? d.accent : rgba(d.glowColor, 0.9),
              padding: "10px 24px",
              fontFamily: headFamily,
              fontSize: Math.round(tSize * 0.78),
              fontWeight: 700,
              lineHeight: 1.16,
              color: contrastOn(i % 2 === 0 ? d.accent : d.glowColor),
            }}
          >
            {ln}
          </div>
        ))}
        {body ? (
          <div style={{ display: "flex", marginTop: 28, fontFamily: bodyFamily, fontSize: bSize, lineHeight: 1.38, textAlign, color: mutedColor }}>{body}</div>
        ) : null}
      </div>
    );
  } else if (layout === "brutal") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems,
            padding: 44,
            backgroundColor: light ? "#ffffff" : rgba(d.text, 0.08),
            border: `7px solid ${d.text}`,
            ...(d.hardShadow ? { boxShadow: `18px 18px 0px ${d.accent}` } : {}),
          }}
        >
          {numberEl}
          {titleEl}
          {bodyEl}
        </div>
      </div>
    );
  } else if (layout === "poster") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            fontFamily: headFamily,
            fontSize: Math.round(tSize * 1.5),
            fontWeight: 700,
            lineHeight: 0.92,
            letterSpacing: -3,
            textAlign,
            color: textColor,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems }}>
          <div style={{ display: "flex", width: "100%", height: 8, backgroundColor: d.accent, marginBottom: 22 }} />
          {body ? (
            <div style={{ display: "flex", fontFamily: bodyFamily, fontSize: bSize, lineHeight: 1.36, textAlign, color: mutedColor }}>{body}</div>
          ) : null}
        </div>
      </div>
    );
  } else if (layout === "swiss") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", width: "100%", height: 4, backgroundColor: d.accent, marginBottom: 30 }} />
        <div style={{ display: "flex", flexDirection: "row", width: "100%", gap: 34 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 132, flexShrink: 0 }}>
            <div style={{ display: "flex", fontFamily: headFamily, fontSize: 60, fontWeight: 700, lineHeight: 1, color: d.accent }}>{num}</div>
            <div style={{ display: "flex", marginTop: 12, fontFamily: bodyFamily, fontSize: 22, letterSpacing: 2, color: mutedColor }}>
              {String(total).padStart(2, "0")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {titleEl}
            {bodyEl}
          </div>
        </div>
      </div>
    );
  } else if (layout === "sticker") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: center ? "center" : "flex-start",
            padding: 46,
            borderRadius: d.radius,
            backgroundColor: light ? "#ffffff" : rgba(d.text, 0.1),
            border: `5px solid ${d.accent}`,
            ...(d.hardShadow ? { boxShadow: `14px 14px 0px ${rgba(d.accent, 0.55)}` } : {}),
            transform: "rotate(-2deg)",
          }}
        >
          {numberEl}
          {titleEl}
          {bodyEl}
        </div>
      </div>
    );
  } else if (isCard) {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems,
            padding: 56,
            borderRadius: d.radius,
            backgroundColor: rgba(fullPhoto ? "#000000" : d.text, fullPhoto ? 0.28 : light ? 0.06 : 0.09),
            border: `2px solid ${rgba(d.accent, 0.4)}`,
          }}
        >
          {numberEl}
          {textBlock}
        </div>
      </div>
    );
  } else {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems, width: "100%", height: "100%" }}>
        {numberEl}
        {textBlock}
      </div>
    );
  }

  const showProgressRow = d.showProgress || (d.showArrow && !isOutro && index < total);
  const bottomPad = 64;
  const contentBottom = (brand ? 76 : 0) + (showProgressRow ? 64 : 0) + 100;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        fontFamily: bodyFamily,
        color: textColor,
        ...bgStyle,
      }}
    >
      {!hasPhoto || d.photoMode !== "fill" ? patternLayer(d, W, H, light) : null}

      {hasPhoto && d.photoMode === "fill" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={spec.photo as string}
            width={W}
            height={H}
            style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", ...(photoFilter(d) ? { filter: photoFilter(d) } : {}) }}
            alt=""
          />
          {d.photoEffect === "duotone" ? (
            <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(145deg, ${rgba(d.from, 0.85)} 0%, ${rgba(d.accent, 0.7)} 100%)` }} />
          ) : null}
          <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: overlay }} />
        </>
      ) : hasPhoto ? (
        photoInset(spec.photo as string, d, W, H)
      ) : d.glowStrength > 0 ? (
        <div
          style={{
            position: "absolute",
            top: spec.kind === "cover" ? -260 : -340,
            right: spec.kind === "cover" ? -220 : -300,
            width: 800,
            height: 800,
            display: "flex",
            borderRadius: 800,
            backgroundImage: `radial-gradient(circle, ${d.glowColor} 0%, rgba(0,0,0,0) 68%)`,
            opacity: (d.glowStrength / 100) * (light ? 0.7 : 1),
          }}
        />
      ) : null}

      {frameLayer(d, W, H)}

      {/* верхняя строка */}
      {d.showLabel || d.showCounter ? (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: PAD,
            right: PAD,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: headFamily,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
            color: mutedColor,
          }}
        >
          <div style={{ display: "flex" }}>
            {d.showLabel && layout !== "magazine" ? cleanSlideText(d.label || spec.label || "").toUpperCase() : ""}
          </div>
          {d.showCounter ? (
            <div style={{ display: "flex", color: d.accent }}>{`${index}/${total}`}</div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
      ) : null}

      {/* контент */}
      <div
        style={{
          position: "absolute",
          top: hasPhoto && d.photoMode === "half" ? Math.round(H * 0.5) : d.showLabel || d.showCounter ? 150 : 90,
          bottom: contentBottom,
          left: PAD,
          right: PAD,
          display: "flex",
        }}
      >
        {content}
      </div>

      {/* подвал: бренд + прогресс */}
      <div
        style={{
          position: "absolute",
          bottom: bottomPad - 8,
          left: PAD,
          right: PAD,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {brand ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: center ? "center" : "flex-start", gap: 18 }}>
            {extras.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={extras.logo} width={54} height={54} style={{ width: 54, height: 54, objectFit: "contain", borderRadius: 12 }} alt="" />
            ) : null}
            {d.footer.trim() ? (
              <div style={{ display: "flex", fontFamily: headFamily, fontSize: 28, fontWeight: 700, letterSpacing: 1, color: mutedColor }}>
                {cleanSlideText(d.footer)}
              </div>
            ) : null}
          </div>
        ) : null}
        {showProgressRow ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {d.showProgress ? (
              Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i < index ? d.accent : rgba(mutedColor, 0.35),
                  }}
                />
              ))
            ) : (
              <div style={{ display: "flex", flex: 1 }} />
            )}
            {d.showArrow && !isOutro && index < total ? (
              <div style={{ display: "flex", fontFamily: headFamily, fontSize: 34, fontWeight: 700, color: d.accent, marginLeft: 14 }}>
                ›
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Рендер одного слайда. design может быть неполным — будет нормализован. */
export async function renderSlidePng(
  spec: SlideSpec,
  index: number,
  total: number,
  design: Partial<Design> | Design,
  extras: SlideExtras = {},
): Promise<ArrayBuffer> {
  const d = normalizeDesign(design);
  const { w, h } = formatSize(d.format);
  const { fonts, resolved } = await loadFontsFor([d.headingFont, d.bodyFont]);
  // если шрифт пришлось заменить на Inter — подстраиваем имена в дизайне
  const eff: Design = {
    ...d,
    headingFont: resolved.get(d.headingFont) ?? d.headingFont,
    bodyFont: resolved.get(d.bodyFont) ?? d.bodyFont,
  };
  const res = new ImageResponse(<SlideView spec={spec} index={index} total={total} d={eff} extras={extras} />, {
    width: w,
    height: h,
    fonts,
  });
  return res.arrayBuffer();
}
