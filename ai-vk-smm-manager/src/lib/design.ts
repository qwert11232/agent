/**
 * Модель дизайна слайдов карусели. Файл «чистый» (без node-модулей),
 * поэтому его можно импортировать и на сервере, и в клиентском редакторе.
 */

export type FontId =
  | "inter"
  | "montserrat"
  | "manrope"
  | "golos-text"
  | "onest"
  | "rubik"
  | "geologica"
  | "oswald"
  | "alumni-sans"
  | "exo-2"
  | "play"
  | "tektur"
  | "russo-one"
  | "unbounded"
  | "marmelad"
  | "caveat"
  | "pixelify-sans"
  | "rubik-mono-one"
  | "stalinist-one"
  | "yeseva-one"
  | "playfair-display"
  | "cormorant"
  | "spectral"
  | "lora"
  | "pt-serif"
  | "bitter"
  | "roboto-slab"
  | "jetbrains-mono"
  | "ibm-plex-mono"
  | "fira-code";

export const FONTS: { id: FontId; name: string; hint: string; group: string }[] = [
  { id: "inter", name: "Inter", hint: "нейтральный гротеск, как в интерфейсах", group: "Гротески" },
  { id: "montserrat", name: "Montserrat", hint: "геометричный, дружелюбный", group: "Гротески" },
  { id: "manrope", name: "Manrope", hint: "современный, чуть техничный", group: "Гротески" },
  { id: "golos-text", name: "Golos Text", hint: "российский гротеск, отличная кириллица", group: "Гротески" },
  { id: "onest", name: "Onest", hint: "мягкий современный, хорош для соцсетей", group: "Гротески" },
  { id: "rubik", name: "Rubik", hint: "скруглённый, заметный в ленте", group: "Гротески" },
  { id: "geologica", name: "Geologica", hint: "техно-гротеск с характером", group: "Гротески" },
  { id: "oswald", name: "Oswald", hint: "узкий плакатный, кричащие заголовки", group: "Плакатные" },
  { id: "alumni-sans", name: "Alumni Sans", hint: "очень узкий, спортивный постер", group: "Плакатные" },
  { id: "russo-one", name: "Russo One", hint: "жирный квадратный, техно и гейминг", group: "Плакатные" },
  { id: "unbounded", name: "Unbounded", hint: "широкий акцидентный, модный", group: "Плакатные" },
  { id: "rubik-mono-one", name: "Rubik Mono One", hint: "сверхжирный моно, брутализм", group: "Плакатные" },
  { id: "stalinist-one", name: "Stalinist One", hint: "конструктивизм, агитплакат", group: "Плакатные" },
  { id: "exo-2", name: "Exo 2", hint: "футуризм и sci-fi", group: "Техно" },
  { id: "play", name: "Play", hint: "лаконичный техно", group: "Техно" },
  { id: "tektur", name: "Tektur", hint: "киберпанк, угловатый", group: "Техно" },
  { id: "pixelify-sans", name: "Pixelify Sans", hint: "пиксель-арт, ретро-игры", group: "Техно" },
  { id: "playfair-display", name: "Playfair Display", hint: "журнальная антиква", group: "Антиквы" },
  { id: "cormorant", name: "Cormorant", hint: "тонкая люксовая антиква", group: "Антиквы" },
  { id: "yeseva-one", name: "Yeseva One", hint: "декоративная витринная антиква", group: "Антиквы" },
  { id: "spectral", name: "Spectral", hint: "редакционная, для лонгридов", group: "Антиквы" },
  { id: "lora", name: "Lora", hint: "книжная с лёгким контрастом", group: "Антиквы" },
  { id: "pt-serif", name: "PT Serif", hint: "классическая кириллическая", group: "Антиквы" },
  { id: "bitter", name: "Bitter", hint: "брусковая, основательная", group: "Брусковые" },
  { id: "roboto-slab", name: "Roboto Slab", hint: "брусковая нейтральная", group: "Брусковые" },
  { id: "marmelad", name: "Marmelad", hint: "мягкий дружелюбный характер", group: "Рукописные" },
  { id: "caveat", name: "Caveat", hint: "рукописный маркер, скетч", group: "Рукописные" },
  { id: "jetbrains-mono", name: "JetBrains Mono", hint: "моноширинный для кода", group: "Моноширинные" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", hint: "инженерный моно", group: "Моноширинные" },
  { id: "fira-code", name: "Fira Code", hint: "терминальный моно", group: "Моноширинные" },
];

/**
 * Шрифты в пикере: 11 читаемых гарнитур. Полный список FONTS остаётся для проверки
 * сохранённых дизайнов: пользовательский дизайн с удалённым из пикера шрифтом не меняет вид.
 */
export const PICKER_FONT_IDS: FontId[] = [
  "inter", "montserrat", "manrope", "golos-text", "onest", "geologica", "unbounded",
  "jetbrains-mono", "playfair-display", "spectral", "pt-serif",
];
export const PICKER_FONTS = FONTS.filter((f) => PICKER_FONT_IDS.includes(f.id));

export const FONT_GROUPS = ["Гротески", "Плакатные", "Техно", "Антиквы", "Брусковые", "Рукописные", "Моноширинные"] as const;

export const LAYOUTS = [
  { id: "classic", name: "Классика", hint: "номер, заголовок и текст слева", group: "База" },
  { id: "card", name: "Карточка", hint: "текст на полупрозрачной плашке", group: "База" },
  { id: "editorial", name: "Журнал", hint: "крупный номер, линия, заголовок снизу", group: "База" },
  { id: "bar", name: "Полоса", hint: "вертикальная акцентная полоса", group: "База" },
  { id: "magazine", name: "Журнальная вырезка", hint: "цветной блок-плашка под текстом, как врезка в журнале", group: "Журнал" },
  { id: "cover-split", name: "Половина / половина", hint: "экран делится на две части: цвет и фото", group: "Сплит" },
  { id: "diagonal", name: "Диагональ", hint: "диагональный разрез фона на два цвета", group: "Сплит" },
  { id: "bandsplit", name: "Полосы-ленты", hint: "текст разрезан горизонтальными лентами", group: "Сплит" },
  { id: "brutal", name: "Брутализм", hint: "жёсткая рамка и смещённая тень, без скруглений", group: "Арт" },
  { id: "poster", name: "Плакат", hint: "гигантский заголовок во всю площадь", group: "Арт" },
  { id: "swiss", name: "Швейцарский", hint: "модульная сетка, тонкие линии, строгий ритм", group: "Арт" },
  { id: "sticker", name: "Стикер", hint: "наклонённая плашка-наклейка с текстом", group: "Арт" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];
export const LAYOUT_GROUPS = ["База", "Журнал", "Сплит", "Арт"] as const;

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
  pattern: "none" | "dots" | "grid" | "stripes" | "noise" | "halftone" | "zigzag" | "memphis" | "scanlines";
  /** Рамка вокруг слайда. */
  frame: "none" | "line" | "thick" | "inset" | "corners" | "tape";
  /** Жёсткая смещённая тень у плашек (нео-брутализм). */
  hardShadow: boolean;
  /** Обработка фото: цвет, дуотон, ч/б, сепия. */
  photoEffect: "normal" | "duotone" | "mono" | "sepia";
  /** Фото-вставка: как фото встроено в композицию. */
  photoMode: "fill" | "half" | "band" | "circle" | "collage";
  /** Текст КАПСОМ в заголовках. */
  upperTitle: boolean;
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
  glowStrength: 40,
  pattern: "none",
  frame: "none",
  hardShadow: false,
  photoEffect: "normal",
  photoMode: "fill",
  upperTitle: false,
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
  // Метка «Карусель» ничего не сообщает читателю: включается только там, где она несёт смысл (дайджест с датой).
  showLabel: false,
  showCounter: true,
  showProgress: true,
  showArrow: true,
  label: "",
  footer: "",
  logoMediaId: null,
  photoDim: 70,
};

export type DesignPreset = { id: string; name: string; group: string; design: Partial<Design> };

/**
 * Галерея стилей. Палитры, шрифтовые пары и приёмы взяты из базы знаний по
 * дизайну (84 стиля, 75 шрифтовых пар) и из каталога визуальных тем
 * forevercomponents.com — брутализм, швейцарская типографика, Bauhaus, Memphis,
 * vaporwave, Art Deco, конструктивизм, ukiyo-e, терминал, журнальная вёрстка.
 */
/**
 * Галерея стилей для паблика эксперта, продающего услуги владельцам бизнеса.
 * Критерии отбора: контраст основного и приглушённого текста ≥ 4,5:1,
 * шрифт без экстремальной ширины и декоративности, нет КАПС-заголовков и тяжёлых
 * узоров по умолчанию, образ «практик для владельцев бизнеса».
 */
export const PRESETS: DesignPreset[] = [
  { id: "midnight", name: "Полночь", group: "Тёмные", design: {} },
  {
    id: "corporate",
    name: "Деловой",
    group: "Чистые",
    design: { from: "#f8fafc", to: "#e6edf5", accent: "#1d4ed8", text: "#0f172a", muted: "#475569", glowStrength: 20, headingFont: "golos-text", bodyFont: "inter", layout: "swiss", radius: 10, numberStyle: "badge" },
  },
  {
    id: "minimal",
    name: "Минимализм",
    group: "Чистые",
    design: { from: "#ffffff", to: "#ffffff", bgMode: "solid", accent: "#2563eb", text: "#0f172a", muted: "#64748b", glowStrength: 0, headingFont: "inter", bodyFont: "inter", layout: "classic", radius: 8, titleScale: 94, showProgress: true },
  },
  {
    id: "saas",
    name: "SaaS",
    group: "Чистые",
    design: { from: "#0b1220", to: "#1e293b", accent: "#38bdf8", text: "#f8fafc", muted: "#94a3b8", glowColor: "#2563eb", headingFont: "onest", bodyFont: "inter", layout: "card", radius: 28 },
  },
  {
    id: "fintech",
    name: "Финтех",
    group: "Чистые",
    design: { from: "#04130d", to: "#0a2a1c", accent: "#22c55e", text: "#f0fff7", muted: "#9ccbb2", glowColor: "#10b981", headingFont: "golos-text", bodyFont: "golos-text", layout: "swiss", titleScale: 92 },
  },
  {
    id: "ocean",
    name: "Океан",
    group: "Тёмные",
    design: { from: "#031c34", to: "#0a4a7a", accent: "#4cc9f0", text: "#f0faff", muted: "#a9d3ea", glowColor: "#2b8cff", headingFont: "montserrat", bodyFont: "inter", layout: "card" },
  },
  {
    id: "swiss",
    name: "Швейцарский",
    group: "Арт",
    design: { from: "#f5f5f5", to: "#f5f5f5", bgMode: "solid", accent: "#e30613", text: "#000000", muted: "#555555", glowStrength: 0, headingFont: "inter", bodyFont: "inter", layout: "swiss", radius: 0, titleScale: 92, numberStyle: "none", showProgress: true },
  },
  {
    id: "ai-native",
    name: "AI-Native",
    group: "Чистые",
    design: { from: "#0e0b1f", to: "#1d1535", accent: "#8b5cf6", text: "#f5f3ff", muted: "#b4a7d6", glowColor: "#6366f1", glowStrength: 40, headingFont: "geologica", bodyFont: "onest", layout: "card", radius: 36 },
  },
  {
    id: "electric",
    name: "Электрик",
    group: "Тёмные",
    design: { from: "#050505", to: "#14142b", accent: "#d4ff3a", text: "#ffffff", muted: "#a8a8c0", glowColor: "#7a5cff", headingFont: "unbounded", bodyFont: "inter", titleScale: 88, pattern: "grid" },
  },
  {
    id: "mono",
    name: "Моно",
    group: "Чистые",
    design: { from: "#111111", to: "#111111", bgMode: "solid", accent: "#ffffff", text: "#f5f5f5", muted: "#9a9a9a", glowColor: "#444444", glowStrength: 0, headingFont: "jetbrains-mono", bodyFont: "jetbrains-mono", titleScale: 86, bodyScale: 90, layout: "editorial", numberStyle: "big" },
  },
  {
    id: "mint",
    name: "Мята",
    group: "Тёплые",
    design: { from: "#06231f", to: "#0d4a40", accent: "#5cf2c0", text: "#f2fffb", muted: "#a5dccf", glowColor: "#14b8a6", headingFont: "manrope", bodyFont: "manrope", layout: "bar" },
  },
  {
    id: "editorial-dark",
    name: "Чёрный глянец",
    group: "Журнал",
    design: { from: "#0a0a0a", to: "#171717", accent: "#ff3d00", text: "#fafafa", muted: "#9a9a9a", glowStrength: 15, headingFont: "playfair-display", bodyFont: "inter", layout: "magazine", titleScale: 98, radius: 0 },
  },
  {
    id: "magazine",
    name: "Журнальная вырезка",
    group: "Журнал",
    design: { from: "#ffffff", to: "#f2f2f2", accent: "#111111", text: "#0a0a0a", muted: "#5c5c5c", glowStrength: 0, headingFont: "playfair-display", bodyFont: "spectral", layout: "magazine", radius: 0, titleScale: 96, numberStyle: "none" },
  },
  {
    id: "paper",
    name: "Бумага",
    group: "Журнал",
    design: { from: "#f7f3ea", to: "#e8e0cf", accent: "#e4572e", text: "#1b1b1f", muted: "#5f5a4e", glowColor: "#f6b26b", headingFont: "playfair-display", bodyFont: "pt-serif", layout: "editorial", glowStrength: 35 },
  },
];

/**
 * Скрытые из галереи пресеты (геймерские, арт, лайфстайл, с контрастом ниже нормы).
 * Остаются только для обратной совместимости: ссылки на их id и сохранённые дизайны
 * продолжают работать, но в выборе их больше нет.
 */
const LEGACY_PRESETS: DesignPreset[] = [
  {
    id: "cyberpunk",
    name: "Киберпанк",
    group: "Тёмные",
    design: { from: "#0a0a0f", to: "#12121a", accent: "#00ff88", text: "#ffffff", muted: "#8b8ba7", glowColor: "#ff00ff", headingFont: "tektur", bodyFont: "play", pattern: "scanlines", layout: "brutal", upperTitle: true, titleScale: 88 },
  },
  {
    id: "terminal",
    name: "Терминал",
    group: "Тёмные",
    design: { from: "#050505", to: "#050505", bgMode: "solid", accent: "#33ff00", text: "#d9ffd9", muted: "#5fa05f", glowColor: "#1a3d1a", glowStrength: 0, headingFont: "fira-code", bodyFont: "jetbrains-mono", titleScale: 80, bodyScale: 92, pattern: "scanlines", frame: "line", numberStyle: "badge" },
  },
  {
    id: "hud",
    name: "Sci-Fi HUD",
    group: "Тёмные",
    design: { from: "#00111a", to: "#001f33", accent: "#00ffff", text: "#e6feff", muted: "#7fc9d9", glowColor: "#0080ff", headingFont: "exo-2", bodyFont: "play", frame: "corners", pattern: "grid", upperTitle: true, layout: "swiss" },
  },
  {
    id: "gaming",
    name: "Гейминг",
    group: "Тёмные",
    design: { from: "#120024", to: "#2d0a4e", accent: "#b4ff39", text: "#ffffff", muted: "#c3a7e0", glowColor: "#ff2e97", headingFont: "russo-one", bodyFont: "exo-2", titleScale: 92, upperTitle: true, layout: "poster" },
  },
  {
    id: "matrix",
    name: "Матрица",
    group: "Тёмные",
    design: { from: "#000000", to: "#021b02", accent: "#00ff41", text: "#d6ffd6", muted: "#4f9f58", headingFont: "pixelify-sans", bodyFont: "fira-code", pattern: "noise", titleScale: 90, glowStrength: 30 },
  },
  {
    id: "brutal",
    name: "Брутализм",
    group: "Арт",
    design: { from: "#fffdf5", to: "#fffdf5", bgMode: "solid", accent: "#ff5252", text: "#000000", muted: "#333333", glowStrength: 0, headingFont: "rubik-mono-one", bodyFont: "rubik", layout: "brutal", frame: "thick", hardShadow: true, radius: 0, titleScale: 80, upperTitle: true, numberStyle: "badge" },
  },
  {
    id: "neobrutal",
    name: "Нео-брутализм",
    group: "Арт",
    design: { from: "#ffd93d", to: "#ffd93d", bgMode: "solid", accent: "#000000", text: "#0a0a0a", muted: "#3b3b3b", glowStrength: 0, headingFont: "rubik", bodyFont: "rubik", layout: "card", frame: "thick", hardShadow: true, radius: 0, titleScale: 90, numberStyle: "badge" },
  },
  {
    id: "acid",
    name: "Кислотный",
    group: "Арт",
    design: { from: "#09090b", to: "#09090b", bgMode: "solid", accent: "#dfe104", text: "#fafafa", muted: "#a1a1aa", glowStrength: 0, headingFont: "alumni-sans", bodyFont: "inter", layout: "poster", titleScale: 130, upperTitle: true, frame: "line" },
  },
  {
    id: "bauhaus",
    name: "Bauhaus",
    group: "Арт",
    design: { from: "#f0f0f0", to: "#f0f0f0", bgMode: "solid", accent: "#d02020", text: "#121212", muted: "#4a4a4a", glowColor: "#1040c0", glowStrength: 0, headingFont: "montserrat", bodyFont: "inter", layout: "bandsplit", radius: 0, upperTitle: true, titleScale: 92 },
  },
  {
    id: "constructivism",
    name: "Конструктивизм",
    group: "Арт",
    design: { from: "#f2ece1", to: "#e8ded0", accent: "#d81e05", text: "#1a1a1a", muted: "#4c4c4c", glowStrength: 0, headingFont: "stalinist-one", bodyFont: "pt-serif", layout: "diagonal", radius: 0, upperTitle: true, titleScale: 78 },
  },
  {
    id: "memphis",
    name: "Memphis 80s",
    group: "Арт",
    design: { from: "#fff8f0", to: "#ffe9f4", accent: "#ff71ce", text: "#22223b", muted: "#6a7bb4", glowColor: "#86ccca", headingFont: "unbounded", bodyFont: "rubik", pattern: "memphis", layout: "sticker", titleScale: 84, radius: 28 },
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    group: "Арт",
    design: { from: "#2b1055", to: "#7597de", accent: "#05ffa1", text: "#ffffff", muted: "#ffc4f3", glowColor: "#ff71ce", headingFont: "unbounded", bodyFont: "play", pattern: "grid", titleScale: 92, layout: "poster", upperTitle: true },
  },
  {
    id: "popart",
    name: "Поп-арт",
    group: "Арт",
    design: { from: "#ffe600", to: "#ffb800", accent: "#ff2d55", text: "#111111", muted: "#5a4a00", glowStrength: 0, headingFont: "rubik-mono-one", bodyFont: "rubik", pattern: "halftone", layout: "sticker", radius: 20, upperTitle: true, titleScale: 82 },
  },
  {
    id: "pixel",
    name: "Пиксель-арт",
    group: "Арт",
    design: { from: "#1a1c2c", to: "#333c57", accent: "#ffcd75", text: "#f4f4f4", muted: "#a7b5d8", glowStrength: 20, headingFont: "pixelify-sans", bodyFont: "pixelify-sans", pattern: "grid", radius: 0, titleScale: 86, frame: "thick" },
  },
  {
    id: "luxury",
    name: "Люкс",
    group: "Журнал",
    design: { from: "#0f0d0b", to: "#241d16", accent: "#c9a227", text: "#f7f1e6", muted: "#bdae95", glowColor: "#c9a227", glowStrength: 30, headingFont: "cormorant", bodyFont: "montserrat", layout: "editorial", titleScale: 110, frame: "line" },
  },
  {
    id: "academia",
    name: "Академия",
    group: "Журнал",
    design: { from: "#1c1714", to: "#251e19", accent: "#c9a227", text: "#e8dfd4", muted: "#9c8b7a", glowStrength: 10, headingFont: "yeseva-one", bodyFont: "lora", layout: "editorial", titleScale: 92 },
  },
  {
    id: "vintage",
    name: "Винтаж-плёнка",
    group: "Журнал",
    design: { from: "#f5e6c8", to: "#e4cfa6", accent: "#c2513a", text: "#3a2d20", muted: "#7a6a54", glowColor: "#d4a574", headingFont: "yeseva-one", bodyFont: "lora", pattern: "noise", photoEffect: "sepia", layout: "magazine", titleScale: 92 },
  },
  {
    id: "sketch",
    name: "Скетч",
    group: "Журнал",
    design: { from: "#fafaf8", to: "#f1efe9", accent: "#ff4d4d", text: "#2d2d2d", muted: "#6b6b6b", glowStrength: 0, headingFont: "caveat", bodyFont: "marmelad", layout: "sticker", titleScale: 128, frame: "tape", radius: 18 },
  },
  {
    id: "sunset",
    name: "Закат",
    group: "Тёплые",
    design: { from: "#2a0f2e", to: "#7a1f4d", accent: "#ffb35c", text: "#fff7ef", muted: "#f0c6d8", glowColor: "#ff5c8a", headingFont: "montserrat", bodyFont: "montserrat" },
  },
  {
    id: "candy",
    name: "Конфета",
    group: "Тёплые",
    design: { from: "#ffe3f1", to: "#ffd0e6", accent: "#ff3d8b", text: "#3a0d24", muted: "#8a4a68", headingFont: "unbounded", bodyFont: "manrope", titleScale: 84, layout: "card", numberStyle: "badge", glowStrength: 60 },
  },
  {
    id: "terracotta",
    name: "Терракота",
    group: "Тёплые",
    design: { from: "#f5f0e1", to: "#e3d2bb", accent: "#c67b5c", text: "#3c2f26", muted: "#7a6a58", glowColor: "#b5651d", glowStrength: 25, headingFont: "cormorant", bodyFont: "lora", layout: "magazine", titleScale: 104 },
  },
  {
    id: "forest",
    name: "Лес",
    group: "Тёплые",
    design: { from: "#0d1f14", to: "#1d3a26", accent: "#8ed081", text: "#f1fff2", muted: "#a8c3a4", glowColor: "#4caf50", headingFont: "spectral", bodyFont: "lora", layout: "bar" },
  },
  {
    id: "ukiyoe",
    name: "Укиё-э",
    group: "Тёплые",
    design: { from: "#f3ead7", to: "#dcc9a8", accent: "#1b4a7a", text: "#20262e", muted: "#5d6b78", glowColor: "#c2513a", glowStrength: 25, headingFont: "yeseva-one", bodyFont: "spectral", layout: "cover-split", titleScale: 96, photoEffect: "duotone" },
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
    pattern: oneOf(
      i.pattern,
      ["none", "dots", "grid", "stripes", "noise", "halftone", "zigzag", "memphis", "scanlines"] as const,
      base.pattern,
    ),
    frame: oneOf(i.frame, ["none", "line", "thick", "inset", "corners", "tape"] as const, base.frame),
    hardShadow: bool(i.hardShadow, base.hardShadow),
    photoEffect: oneOf(i.photoEffect, ["normal", "duotone", "mono", "sepia"] as const, base.photoEffect),
    photoMode: oneOf(i.photoMode, ["fill", "half", "band", "circle", "collage"] as const, base.photoMode),
    upperTitle: bool(i.upperTitle, base.upperTitle),
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
  const p = PRESETS.find((x) => x.id === id) ?? LEGACY_PRESETS.find((x) => x.id === id);
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
