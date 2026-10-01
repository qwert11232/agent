import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Рендер слайдов карусели 1080×1080 без внешних сервисов и ключей:
 * HTML/CSS › PNG через satori (встроен в Next.js). Кириллица отрисовывается
 * идеально, в отличие от AI-генераторов картинок, которые коверкают текст.
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

export type Theme = {
  id: string;
  name: string;
  from: string;
  to: string;
  accent: string;
  text: string;
  muted: string;
  glow: string;
};

export const THEMES: Theme[] = [
  { id: "midnight", name: "Полночь", from: "#0b1020", to: "#1d1f4a", accent: "#7c8cff", text: "#ffffff", muted: "#aab2d9", glow: "#4f46e5" },
  { id: "sunset", name: "Закат", from: "#2a0f2e", to: "#7a1f4d", accent: "#ffb35c", text: "#fff7ef", muted: "#f0c6d8", glow: "#ff5c8a" },
  { id: "mint", name: "Мята", from: "#06231f", to: "#0d4a40", accent: "#5cf2c0", text: "#f2fffb", muted: "#a5dccf", glow: "#14b8a6" },
  { id: "paper", name: "Бумага", from: "#f7f3ea", to: "#e8e0cf", accent: "#e4572e", text: "#1b1b1f", muted: "#6b6558", glow: "#f6b26b" },
  { id: "electric", name: "Электрик", from: "#050505", to: "#14142b", accent: "#d4ff3a", text: "#ffffff", muted: "#a8a8c0", glow: "#7a5cff" },
];

export function themeById(id?: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const SIZE = 1080;

type FontDef = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };
let fontCache: FontDef[] | null = null;

function loadFonts(): FontDef[] {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const read = (f: string) => fs.readFileSync(path.join(dir, f));
  fontCache = [
    { name: "InterCyr", data: read("inter-cyr-700.woff"), weight: 700, style: "normal" },
    { name: "InterLat", data: read("inter-lat-700.woff"), weight: 700, style: "normal" },
    { name: "InterCyr", data: read("inter-cyr-400.woff"), weight: 400, style: "normal" },
    { name: "InterLat", data: read("inter-lat-400.woff"), weight: 400, style: "normal" },
  ];
  return fontCache;
}

/** satori не умеет эмодзи — вычищаем, чтобы не было «тофу». */
export function cleanSlideText(s: string) {
  return s
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSize(len: number, kind: SlideSpec["kind"]) {
  if (kind === "cover") return len <= 24 ? 112 : len <= 40 ? 92 : 76;
  return len <= 28 ? 74 : len <= 48 ? 62 : 52;
}

function bodySize(len: number) {
  return len <= 120 ? 42 : len <= 190 ? 36 : 31;
}

function SlideView({
  spec,
  index,
  total,
  theme,
}: {
  spec: SlideSpec;
  index: number;
  total: number;
  theme: Theme;
}) {
  const title = cleanSlideText(spec.title);
  const body = spec.body ? cleanSlideText(spec.body) : "";
  const num = String(index).padStart(2, "0");
  const isCover = spec.kind === "cover";
  const isOutro = spec.kind === "outro";
  const darkText = theme.id === "paper" && !spec.photo;
  const textColor = spec.photo ? "#ffffff" : theme.text;
  const mutedColor = spec.photo ? "#e6e6ee" : theme.muted;

  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        display: "flex",
        position: "relative",
        fontFamily: "InterLat, InterCyr",
        color: textColor,
        backgroundImage: `linear-gradient(145deg, ${theme.from} 0%, ${theme.to} 100%)`,
      }}
    >
      {spec.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spec.photo}
          width={SIZE}
          height={SIZE}
          style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, objectFit: "cover" }}
          alt=""
        />
      ) : null}
      {spec.photo ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SIZE,
            height: SIZE,
            display: "flex",
            backgroundImage: "linear-gradient(180deg, rgba(5,6,15,0.55) 0%, rgba(5,6,15,0.82) 100%)",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: isCover ? -260 : -340,
            right: isCover ? -220 : -300,
            width: 800,
            height: 800,
            display: "flex",
            borderRadius: 800,
            backgroundImage: `radial-gradient(circle, ${theme.glow} 0%, rgba(0,0,0,0) 68%)`,
            opacity: darkText ? 0.35 : 0.5,
          }}
        />
      )}

      {/* верхняя строка */}
      <div
        style={{
          position: "absolute",
          top: 64,
          left: 72,
          right: 72,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 3,
          color: mutedColor,
        }}
      >
        <div style={{ display: "flex" }}>{cleanSlideText(spec.label ?? "").toUpperCase()}</div>
        <div style={{ display: "flex", color: theme.accent }}>
          {index}/{total}
        </div>
      </div>

      {/* контент */}
      <div
        style={{
          position: "absolute",
          top: 150,
          bottom: 150,
          left: 72,
          right: 72,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {spec.kind === "point" ? (
          <div
            style={{
              display: "flex",
              fontSize: 190,
              fontWeight: 700,
              lineHeight: 1,
              color: theme.accent,
              marginBottom: 28,
            }}
          >
            {num}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              width: 120,
              height: 14,
              borderRadius: 7,
              backgroundColor: theme.accent,
              marginBottom: 44,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            fontSize: titleSize(title.length, spec.kind),
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        {body ? (
          <div
            style={{
              display: "flex",
              marginTop: 36,
              fontSize: bodySize(body.length),
              lineHeight: 1.38,
              fontWeight: 400,
              color: mutedColor,
            }}
          >
            {body}
          </div>
        ) : null}
      </div>

      {/* нижняя полоса прогресса */}
      <div
        style={{
          position: "absolute",
          bottom: 64,
          left: 72,
          right: 72,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: i < index ? theme.accent : "rgba(160,160,190,0.28)",
            }}
          />
        ))}
        {!isOutro && index < total ? (
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: theme.accent, marginLeft: 14 }}>
            ›
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function renderSlidePng(
  spec: SlideSpec,
  index: number,
  total: number,
  theme: Theme,
): Promise<ArrayBuffer> {
  const res = new ImageResponse(<SlideView spec={spec} index={index} total={total} theme={theme} />, {
    width: SIZE,
    height: SIZE,
    fonts: loadFonts(),
  });
  return res.arrayBuffer();
}
