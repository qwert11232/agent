import assert from "node:assert/strict";
import { findUnsupportedNumbers, firstLineProblem, hasPromptLeak, sanitizePostText } from "../src/lib/style";
import { classifyComment, isLeadComment, isHelpRequest } from "../src/lib/comments";
import { isSameStory, parseRss } from "../src/lib/news";
import { PRESETS, PICKER_FONTS, presetDesign, luminance, DEFAULT_DESIGN } from "../src/lib/design";
import { planForDay } from "../src/lib/insights";
import { coverProblem } from "../src/lib/carousel";
import { AGENCY_PROMPT } from "../src/lib/prompts";
import { VOICE_STYLE } from "../src/lib/style";

let n = 0;
function t(name: string, fn: () => void) {
  try { fn(); n++; console.log("ok  ", name); } catch (e) { console.error("FAIL", name, "\n   ", (e as Error).message); process.exitCode = 1; }
}

// ---- 1.1 санитайзер: проценты больше не превращаются в мусор
for (const s of [
  "73% лендингов теряют заявки на форме.",
  "Конверсия выросла на 30% после правки.",
  "Клиент получил +50% заявок за месяц.",
  "Из 100 посетителей 3% оставляют заявку.",
  "Скидка 20% на аудит до пятницы.",
]) t(`sanitize keeps «${s.slice(0, 22)}…»`, () => {
  const out = sanitizePostText(s);
  assert.equal(out, s);
  assert.ok(!out.includes("например, в наших проектах"));
});
t("sanitize removes hashtags/markdown, keeps C#", () => {
  const out = sanitizePostText("**Жирный** текст #хештег про C# и ## не заголовок\n\n## Заголовок\n#ещё");
  assert.ok(!out.includes("#хештег") && !out.includes("**") && !out.includes("## "));
  assert.ok(out.includes("C#"));
});

// ---- политика фактов
t("number guard flags invented percent", () => {
  assert.deepEqual(findUnsupportedNumbers("Конверсия выросла на 30% после правки."), ["30%"]);
});
t("number guard allows facts-bank numbers", () => {
  assert.deepEqual(findUnsupportedNumbers("Конверсия выросла с 2 до 3% за месяц.", "кейс: конверсия с 2 до 3 % за месяц"), []);
});
t("number guard allows hypothetical calculations", () => {
  assert.deepEqual(findUnsupportedNumbers("Допустим, вы купили 1000 переходов, а до формы дошёл каждый пятый. Остальные 800 вы оплатили зря."), []);
});
t("number guard ignores list numbering, time, dates, years, single digits", () => {
  const txt = "1. Первый шаг\n2. Второй шаг\n\nПишите в 12:30, 5 октября 2026 года. Пять проверок, 3 шага.";
  assert.deepEqual(findUnsupportedNumbers(txt), []);
});
t("number guard ignores durations (effort, not results)", () => {
  assert.deepEqual(findUnsupportedNumbers("Это займёт 10 минут. Проверьте за 2 недели, раз в 3 месяца."), []);
});
t("number guard flags big money without source", () => {
  assert.ok(findUnsupportedNumbers("Это стоит вам 500 000 руб в месяц.").length === 1);
});
t("prompt leak detection", () => {
  assert.ok(hasPromptLeak("кейс клиента: придумай правдоподобную экспертную историю"));
  assert.ok(!hasPromptLeak("Сайт не продаёт. Начните с формы."));
});
t("first line problems", () => {
  assert.ok(firstLineProblem("Признаюсь честно, это было больно") !== "");
  assert.ok(firstLineProblem("Дайджест дня, 5 октября: что изменилось") !== "");
  assert.ok(firstLineProblem("Реклама работает, а заявок нет") === "");
  assert.ok(firstLineProblem("а".repeat(150)) !== "");
});

// ---- голос: число-запрет снят, хук-блок есть
t("VOICE_STYLE no longer bans all numbers, has hook block", () => {
  assert.ok(!VOICE_STYLE.includes("ЗАПРЕЩЕНЫ ЛЮБЫЕ утверждения с числами"));
  assert.ok(VOICE_STYLE.includes("ХУК") && VOICE_STYLE.includes("БАНКА ФАКТОВ"));
  for (const bad of ["вжух", "кайфанул", "кукуха"]) assert.ok(!VOICE_STYLE.includes(bad), bad);
});
t("AGENCY_PROMPT has real services and no 'придумай'/'CTA в каждом'", () => {
  assert.ok(AGENCY_PROMPT.includes("Карточки товаров"));
  assert.ok(!/придумай|в каждом посте/i.test(AGENCY_PROMPT.replace("Один призыв на пост", "")));
});

// ---- план по дате публикации
t("planForDay uses publication date weekday", () => {
  // 2026-10-05 пн, 06 вт, 07 ср
  assert.equal(planForDay(new Date("2026-10-05T10:00:00Z")).format, "short");
  assert.equal(planForDay(new Date("2026-10-06T10:00:00Z")).format, "carousel");
  assert.equal(planForDay(new Date("2026-10-07T10:00:00Z")).format, "long");
  const thu = planForDay(new Date("2026-10-08T10:00:00Z"));
  assert.ok(["возражение", "процесс"].includes(thu.category));
  for (let d = 0; d < 14; d++) {
    const p = planForDay(new Date(Date.UTC(2026, 9, 1 + d, 10)));
    assert.ok(!/придумай/i.test(p.brief));
  }
});
t("planForDay events limited (no 1 May / 9 May / Valentine)", () => {
  assert.equal(planForDay(new Date("2027-05-09T10:00:00Z")).event, null);
  assert.equal(planForDay(new Date("2027-02-14T10:00:00Z")).event, null);
  assert.equal(planForDay(new Date("2027-03-08T10:00:00Z")).event, "Международный женский день");
});

// ---- комментарии
t("spam regex no longer kills 'инвестиции'", () => {
  assert.notEqual(classifyComment("Инвестиции в разработку окупятся?"), "spam");
  assert.notEqual(classifyComment("Какие ставки по срокам?"), "spam");
  assert.equal(classifyComment("Заработок без вложений, пиши мне"), "spam");
});
t("leads for own services", () => {
  for (const x of ["Нужен чат-бот для записи клиентов", "сколько стоит лендинг?", "делаете карточки товаров для Ozon?", "нужна автоматизация заявок", "Какие сроки на интернет-магазин"]) assert.ok(isLeadComment(x), x);
});
t("'не работает форма на сайте' is a lead, not negative", () => {
  const x = "Не работает форма на сайте, помогите";
  assert.ok(isHelpRequest(x) && isLeadComment(x));
  assert.notEqual(classifyComment(x), "negative");
  assert.equal(classifyComment("Обман и развод, верните деньги"), "negative");
});

// ---- новости
t("same story dedup", () => {
  assert.ok(isSameStory("OpenAI releases new GPT model for developers", "New GPT model released by OpenAI for developers"));
  assert.ok(!isSameStory("Wildberries меняет комиссию для селлеров", "Яндекс запустил новый рекламный формат"));
});
t("rss parser", () => {
  const xml = `<rss><channel><item><title>A &amp; B</title><link>https://x.ru/1</link><description>desc</description></item><item><title>C</title><link>https://x.ru/2</link></item></channel></rss>`;
  const r = parseRss(xml, "vc.ru");
  assert.equal(r.length, 2); assert.equal(r[0].title, "A & B"); assert.equal(r[0].business, true);
});

// ---- карусель
t("cover problem detection", () => {
  assert.ok(coverProblem("Как понять, что пора на редизайн") !== "");
  assert.ok(coverProblem("Разбор: типичные ошибки") !== "");
  assert.ok(coverProblem("Сайт не продаёт? Начните не с редизайна") === "");
});

// ---- дизайн

function ratio(a: string, b: string) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
t("gallery has exactly 14 presets, all with text and muted contrast >= 4.5", () => {
  assert.equal(PRESETS.length, 14);
  for (const p of PRESETS) {
    const d = presetDesign(p.id)!;
    assert.ok(d, p.id);
    const bgs = d.bgMode === "solid" ? [d.from] : [d.from, d.to];
    for (const bg of bgs) {
      assert.ok(ratio(d.text, bg) >= 4.5, `${p.id} text ${ratio(d.text, bg).toFixed(2)}`);
      assert.ok(ratio(d.muted, bg) >= 4.5, `${p.id} muted ${ratio(d.muted, bg).toFixed(2)}`);
    }
  }
});
t("legacy preset ids still resolve", () => {
  assert.ok(presetDesign("gaming")); assert.ok(presetDesign("vaporwave"));
  assert.ok(!PRESETS.find((p) => p.id === "gaming"));
});
t("picker fonts = 11", () => { assert.equal(PICKER_FONTS.length, 11); });
t("default design: glow<=40, label off", () => {
  assert.ok(DEFAULT_DESIGN.glowStrength <= 40); assert.equal(DEFAULT_DESIGN.showLabel, false);
  assert.equal(presetDesign("ai-native")!.glowStrength <= 40, true);
  assert.equal(presetDesign("ocean")!.pattern, "none");
});
console.log(`\n${n} passed`);
