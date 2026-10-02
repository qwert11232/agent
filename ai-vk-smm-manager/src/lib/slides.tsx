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
  kind: "cover" | "point" | "outro";
  title: string;
  body?: string;
  /** Короткая метка сверху слева («ДАЙДЖЕСТ · 12 МАЯ»). */
  label?: string;
  /** data:image/jpeg;base64,… — опциональный фото-фон. */
  photo?: string | null;
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

/** satori не умеет эмодзи — вычищаем, чтобы не было «тофу». */
export function cleanSlideText(s: string) {
  return s
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Поправка кегля на «ширину» гарнитуры, чтобы длинные заголовки не вылезали. */
const WIDTH_FACTOR: Partial<Record<FontId, number>> = {
  unbounded: 0.8,
  "jetbrains-mono": 0.86,
  montserrat: 0.94,
  "roboto-slab": 0.95,
  manrope: 0.98,
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
  const title = cleanSlideText(spec.title);
  const body = spec.body ? cleanSlideText(spec.body) : "";
  const num = String(index).padStart(2, "0");
  const isOutro = spec.kind === "outro";
  const hasPhoto = Boolean(spec.photo);
  const light = isLight(d.from) && !hasPhoto;

  const textColor = hasPhoto ? "#ffffff" : d.text;
  const mutedColor = hasPhoto ? "#e6e6ee" : d.muted;
  const center = d.align === "center";
  // «Полоса» в центрированном виде превращается в горизонтальную чёрточку.
  const layout = d.layout === "bar" && center ? "classic" : d.layout;
  const isCard = layout === "card";

  const headFamily = `${satoriFamily(d.headingFont, "lat")}, ${satoriFamily(d.headingFont, "cyr")}`;
  const bodyFamily = `${satoriFamily(d.bodyFont, "lat")}, ${satoriFamily(d.bodyFont, "cyr")}`;
  const brand = Boolean(d.footer.trim() || extras.logo);
  const widthK = WIDTH_FACTOR[d.headingFont] ?? 1;

  const tSize = Math.round(
    titleSize(title.length, spec.kind) * (d.titleScale / 100) * widthK * (isCard ? 0.92 : 1) * (layout === "bar" ? 0.94 : 1),
  );
  const bSize = Math.round(bodySize(body.length) * (d.bodyScale / 100) * (isCard ? 0.94 : 1));
  const alignItems = center ? "center" : "flex-start";
  const textAlign = center ? "center" : "left";

  /* ---- фон ---- */
  const bgStyle =
    d.bgMode === "solid"
      ? { backgroundColor: d.from }
      : { backgroundImage: `linear-gradient(${d.angle}deg, ${d.from} 0%, ${d.to} 100%)` };

  const patternImage =
    d.pattern === "dots"
      ? `radial-gradient(circle, ${rgba(d.text, light ? 0.16 : 0.14)} 2px, rgba(0,0,0,0) 3px)`
      : d.pattern === "grid"
        ? `linear-gradient(${rgba(d.text, 0.07)} 1px, rgba(0,0,0,0) 1px), linear-gradient(90deg, ${rgba(d.text, 0.07)} 1px, rgba(0,0,0,0) 1px)`
        : null;
  const patternSize = d.pattern === "dots" ? "44px 44px" : "60px 60px";

  const dimK = d.photoDim / 100;
  const overlay = `linear-gradient(180deg, rgba(5,6,15,${(0.2 + 0.45 * dimK).toFixed(2)}) 0%, rgba(5,6,15,${(0.45 + 0.45 * dimK).toFixed(2)}) 100%)`;

  /* ---- элементы контента ---- */
  const showNumber = spec.kind === "point" && d.numberStyle !== "none";
  const bigNumber = d.numberStyle === "big";
  const numSize = layout === "editorial" ? 150 : 190;

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
  ) : d.accentBar && layout !== "bar" && layout !== "editorial" ? (
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

  let content;
  if (layout === "editorial") {
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
            backgroundColor: rgba(hasPhoto ? "#000000" : d.text, hasPhoto ? 0.28 : light ? 0.06 : 0.09),
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
      {patternImage && !hasPhoto ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            backgroundImage: patternImage,
            backgroundSize: patternSize,
          }}
        />
      ) : null}

      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spec.photo as string}
          width={W}
          height={H}
          style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }}
          alt=""
        />
      ) : null}
      {hasPhoto ? (
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: overlay }} />
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
            {d.showLabel ? cleanSlideText(d.label || spec.label || "").toUpperCase() : ""}
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
          top: d.showLabel || d.showCounter ? 150 : 90,
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
