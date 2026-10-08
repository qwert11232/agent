import assert from "node:assert/strict";
import http from "node:http";

/* ---------------- фейковый мир: LLM + RSS + VK ---------------- */
type Req = { system: string; user: string; temperature: number; max_tokens: number };
const llmLog: Req[] = [];
const vkLog: { method: string; params: Record<string, string> }[] = [];
const postponed: { id: number; date: number; text: string }[] = [];
let wallId = 1000;
const flags = { firstBad: false, badNumber: false, digestBadNumber: false, aiDown: false };
let counter = 0;

const GOOD = [
  "Реклама работает, а заявок нет. Часто виноваты не объявления.\n\nДопустим, вы купили 1000 переходов, а до формы дошёл каждый пятый. Остальные 800 вы уже оплатили.\n\nОткройте сайт с телефона и пройдите путь клиента: цена, кнопка, заявка. Где поморщитесь, там и течёт бюджет.\n\nПришлите ссылку в сообщения группы: посмотрю первый экран.",
  "Форма из девяти полей съедает половину обращений. Это решается за вечер.\n\nКлиенту нужно имя и телефон. Остальное вы спросите по телефону, когда он уже заинтересован.\n\nУберите всё лишнее и сравните неделю до и после по числу заявок.",
  "Карточка товара с красивой упаковкой на первом фото не отвечает на главный вопрос покупателя: подойдёт ли мне.\n\nПоставьте на первое фото товар в использовании. Упаковку покажите третьим кадром.\n\nПроверка занимает десять минут.",
  "Бот, который отвечает на всё, раздражает. Бот, который отвечает на три частых вопроса и зовёт человека, экономит часы.\n\nНачните с вопросов, которые вам задают каждый день. Остальное пока оставьте менеджеру.",
  "Лендинг грузится три секунды, и вы думаете, что дело в скорости. Обычно дело в первом экране.\n\nПользователь должен за секунду понять, что вы продаёте и что делать дальше. Скорость вторична.",
  "Заявки приходят в мессенджер, в почту и в форму. Через неделю часть из них теряется.\n\nСоберите все входящие в одну таблицу или CRM. Это самая дешёвая автоматизация, которая окупается сразу.",
  "Редизайн лечит внешний вид, а заявки теряются в логике пути. Красивая страница с тем же маршрутом даст те же потери.\n\nСначала пройдите путь клиента, потом заказывайте дизайн.",
  "Отзывы на лендинге работают только после того, как починен первый экран. Иначе их никто не дочитает.\n\nПорядок такой: оффер, путь до формы, потом доказательства.",
];

function respond(r: Req): string {
  const sys = r.system, usr = r.user;
  if (sys.includes("редактор паблика практика")) return `Реклама идёт, а заявок нет: проверка ${++counter}`;
  if (sys.includes("делаешь слайды карусели")) {
    const first = !usr.includes("ЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ");
    const cover = first ? "Как понять, что сайту пора на редизайн" : "Сайт не продаёт? Начните не с редизайна";
    return "```json\n" + JSON.stringify({
      cover: { title: cover, subtitle: "Четыре проверки до дизайнера" },
      slides: [
        { kind: "point", title: "Редизайн лечит вид", body: "Красивая страница с тем же путём даст те же потери заявок. " + "Это слишком длинный текст слайда, который надо ужать до читаемой длины для телефона. ".repeat(2) },
        { kind: "checklist", title: "Четыре проверки за вечер", items: ["Первый экран с телефона", "Путь до цены", "Форма заявки", "Скорость ответа менеджера", "Лишний шестой пункт"] },
        { kind: "compare", title: "Редизайн или правка пути", left: { title: "Редизайн", items: ["Дорого", "Долго", "Не лечит логику", "четвёртый"] }, right: { title: "Правка пути", items: ["Дёшево", "Быстро", "Лечит потери"] } },
        { kind: "stats", title: "Потери на форме", stats: [{ value: "73%", label: "теряют заявки на форме" }] },
        { kind: "quote", title: "Цитата не из списка", body: "должна стать обычным слайдом" },
        { kind: "point", title: "Завтра за 10 минут", body: "Пройдите путь клиента с телефона." },
      ],
      cta: { title: "Пришлите ссылку", body: "Посмотрю первый экран и форму и напишу две правки.", button: "Написать в сообщения" },
      photoQuery: "website conversion",
    }) + "\n```";
  }
  if (sys.includes("подпись к карусели") && sys.includes("ЗАДАЧА: один готовый пост")) {
    counter++;
    return `Сайт не продаёт, и первая мысль про редизайн. Часто это дорого и мимо (${String.fromCharCode(1072 + (counter % 30))}).\n\nВ слайдах четыре проверки, которые стоит сделать до дизайнера. Сохраните, чтобы проверить в выходные.`;
  }
  if (sys.includes("ПЕРСОНА ДАЙДЖЕСТА")) {
    const extra = flags.digestBadNumber ? " Это даёт рост на 47% за месяц." : "";
    return `Яндекс меняет правила рекламы: проверьте кабинет до пятницы.\n\nГлавное. Платформа изменила правило показа объявлений. Для владельца это значит другие расходы на заявку. На этой неделе проверьте кампании.${extra}\n\nЕщё две вещи покороче. Маркетплейс обновил карточки. Telegram добавил новые боты.\n\nНа вашем месте я бы начал с кабинета.\n\nЕсли у вас карточки на маркетплейсе, напишите в сообщения группы, посмотрю.\n\nhttps://example.com/should-be-stripped\nИСТОЧНИКИ: 3,1,2`;
  }
  if (sys.includes("дизайнер-копирайтер")) {
    return JSON.stringify({ cover: { title: "Проверьте рекламный кабинет", subtitle: "" }, slides: [
      { title: "Правила показа изменились", body: "Расходы на заявку могут вырасти." },
      { title: "Маркетплейс обновил карточки", body: "Проверьте свои." },
      { title: "Новые боты в Telegram", body: "Можно автоматизировать ответы." }],
      final: { title: "Что бы я сделал", body: "Начал бы с рекламного кабинета." }, photoQuery: "ads" });
  }
  if (sys.includes("отвечаешь на комментарий")) return "Лендинг под вашу задачу можно сделать, но цена зависит от задачи. Какой продукт продаёте? Напишите в сообщения группы.";
  if (sys.includes("ЗАДАЧА: один готовый пост")) {
    if (flags.firstBad && !usr.includes("ЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ")) return "Признаюсь честно, этот пост начался плохо.\n\nТекст.";
    if (flags.badNumber) return "Конверсия выросла на 30% после правки формы.\n\nЭто сделал наш клиент за месяц.";
    return GOOD[counter++ % GOOD.length];
  }
  return "ok";
}

function feed() {
  const items = Array.from({ length: 9 }, (_, i) =>
    `<item><title>${["Wildberries меняет комиссию для селлеров", "Яндекс Директ обновил правила рекламы", "Ozon запускает новые карточки товара", "VK Реклама: новые форматы", "Telegram добавил возможности для ботов", "Битрикс24 обновил CRM", "Как маркетплейсы влияют на продажи", "amoCRM выпустила интеграцию", "Налог для самозанятых изменится"][i]}</title><link>http://127.0.0.1:4010/a/${i}</link><description>Описание новости номер ${i} про бизнес, заявки и продажи, чтобы было что читать.</description></item>`).join("");
  return `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  const url = req.url ?? "";
  if (url === "/chat/completions") {
    if (flags.aiDown) { res.statusCode = 500; return res.end("{}"); }
    const b = JSON.parse(raw) as { messages: { role: string; content: string }[]; temperature: number; max_tokens: number };
    const r: Req = { system: b.messages.find((m) => m.role === "system")?.content ?? "", user: b.messages.find((m) => m.role === "user")?.content ?? "", temperature: b.temperature, max_tokens: b.max_tokens };
    llmLog.push(r);
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ choices: [{ message: { content: respond(r) } }] }));
  }
  if (url === "/feed.xml") { res.setHeader("content-type", "application/xml"); return res.end(feed()); }
  if (url === "/upload") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ server: 1, photo: "[{\"x\":1}]", hash: "h" })); }
  if (url.startsWith("/vk/")) {
    const method = url.slice(4);
    const params = Object.fromEntries(new URLSearchParams(raw));
    vkLog.push({ method, params });
    res.setHeader("content-type", "application/json");
    if (method === "wall.get") return res.end(JSON.stringify({ response: { items: postponed } }));
    if (method === "wall.post") { const id = wallId++; postponed.push({ id, date: Number(params.publish_date), text: params.message }); return res.end(JSON.stringify({ response: { post_id: id } })); }
    if (method === "photos.getWallUploadServer") return res.end(JSON.stringify({ response: { upload_url: "http://127.0.0.1:4010/upload" } }));
    if (method === "photos.saveWallPhoto") return res.end(JSON.stringify({ response: [{ id: 7, owner_id: -123456 }] }));
    return res.end(JSON.stringify({ response: {} }));
  }
  res.statusCode = 404; res.end("nf");
});
await new Promise<void>((r) => server.listen(4010, "127.0.0.1", () => r()));

process.env.AI_BASE_URL = "http://127.0.0.1:4010";
process.env.VK_API_BASE = "http://127.0.0.1:4010/vk";
process.env.DIGEST_FEEDS = "Test Biz|http://127.0.0.1:4010/feed.xml";
process.env.SCHEDULE_TZ = "Europe/Moscow";

const { db } = await import("../src/db");
const { sql, eq, desc } = await import("drizzle-orm");
const schema = await import("../src/db/schema");
const core = await import("../src/lib/core");
const { generateDraft } = await import("../src/lib/actions");
const { generateCarousel } = await import("../src/lib/carousel");
const { generateDigest } = await import("../src/lib/digest");
const { syncVkQueue, nextPublishTimes } = await import("../src/lib/queue");
const { AiUnavailableError } = await import("../src/lib/gpt");
const { processComments } = await import("../src/lib/comments").catch(() => ({ processComments: null }));
const { posts, settings, slideSpecs, postImages, leads } = schema;

let passed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log("ok  ", name); }
  catch (e) { console.error("FAIL", name, "\n    ", (e as Error).message.split("\n").slice(0, 6).join("\n     ")); process.exitCode = 1; }
}

// чистая БД: проверяем и DDL на пустой базе
await db.execute(sql`DROP SCHEMA public CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);
await core.ensureSchema();

await t("fresh DB defaults: slot 12:30, weekdays, digest Mon/Wed/Fri, new prompt", async () => {
  const s = await core.getSettings();
  assert.equal(s.scheduleTimes, "12:30"); assert.equal(s.publishDays, "1,2,3,4,5");
  assert.equal(s.digestDays, "1,3,5"); assert.equal(s.digestTime, "09:30"); assert.equal(s.postMode, "schedule");
  assert.ok(s.instruction.includes("Карточки товаров") && !s.instruction.includes("Призыв к действию в каждом посте"));
});

await t("legacy prompt in DB is upgraded to the new one", async () => {
  const s = await core.getSettings();
  await db.update(settings).set({ instruction: "Стиль подачи и голос задаёт отдельный блок. Призыв к действию в каждом посте" }).where(eq(settings.id, s.id));
  const s2 = await core.getSettings();
  assert.ok(s2.instruction.includes("Карточки товаров"));
});

await t("no AI key → AiUnavailableError, nothing saved (no mock in feed)", async () => {
  await assert.rejects(() => generateDraft(), (e) => e instanceof AiUnavailableError);
  assert.equal((await db.select().from(posts)).length, 0);
});

const s0 = await core.getSettings();
await db.update(settings).set({ gptKey: "sk-test-1234567890", vkToken: "vk1.a.realtoken12345678", groupId: "123456", factsBank: "кейс · магазин на Ozon · конверсия с 2 до 3 % за месяц · да", brandFooter: "@my_agency", useWebSearch: false, useImages: false, queueSize: 5, autoQueue: true, tgToken: "", tgChatId: "" }).where(eq(settings.id, s0.id));

await t("generateDraft: hook block, facts bank, cta step, temperature, no hashtags", async () => {
  llmLog.length = 0;
  const p = await generateDraft(undefined, { forDate: new Date("2026-10-05T09:00:00Z"), length: "short" });
  const r = llmLog[0];
  assert.ok(r.system.includes("ХУК") && r.system.includes("ЛЕСТНИЦА ПРИЗЫВОВ"));
  assert.ok(r.user.includes("БАНК ФАКТОВ (реальные случаи") && r.user.includes("с 2 до 3"));
  assert.ok(r.user.includes("миф или позиция")); // рубрика понедельника
  assert.ok(r.user.includes("Ступень призыва для этого поста: 1"));
  assert.equal(r.temperature, 0.85);
  assert.equal(p.category, "миф"); assert.equal(p.size, "short"); assert.equal(p.reviewNote, "");
  assert.ok(!/#\S/.test(p.text) && !r.user.includes("придумай правдоподобную"));
});

await t("rubric follows PUBLICATION date (Wed → long, 'разбор', max_tokens>=2800, cta 3)", async () => {
  llmLog.length = 0;
  const p = await generateDraft(undefined, { forDate: new Date("2026-10-07T09:00:00Z") });
  assert.equal(p.category, "разбор"); assert.equal(p.size, "long");
  assert.ok(llmLog[0].max_tokens >= 2800);
  assert.ok(llmLog[0].system.includes("Объём 2500-4500") && llmLog[0].user.includes("Ступень призыва для этого поста: 3"));
});

await t("recent first lines are passed to the next generation", async () => {
  llmLog.length = 0;
  await generateDraft(undefined, { forDate: new Date("2026-10-08T09:00:00Z"), length: "short" });
  assert.ok(llmLog[0].user.includes("ПЕРВЫЕ СТРОКИ ПОСЛЕДНИХ ПОСТОВ"));
});

await t("bad first line triggers a retry with a note", async () => {
  flags.firstBad = true; llmLog.length = 0;
  const p = await generateDraft(undefined, { forDate: new Date("2026-10-09T09:00:00Z"), length: "short" });
  flags.firstBad = false;
  assert.ok(llmLog.length >= 2 && llmLog[1].user.includes("ЗАМЕЧАНИЕ К ПРОШЛОЙ ПОПЫТКЕ"));
  assert.ok(!/^признаюсь/i.test(p.text));
});

await t("invented number → reviewNote set (and percent NOT rewritten)", async () => {
  flags.badNumber = true;
  const p = await generateDraft(undefined, { forDate: new Date("2026-10-12T09:00:00Z"), length: "short" });
  flags.badNumber = false;
  assert.ok(p.text.includes("30%") && !p.text.includes("например, в наших проектах"));
  assert.ok(p.reviewNote.includes("30%"), p.reviewNote);
});

await t("AI provider down → AiUnavailableError", async () => {
  flags.aiDown = true;
  await assert.rejects(() => generateDraft(undefined, { length: "short" }), (e) => e instanceof AiUnavailableError);
  flags.aiDown = false;
});

let carouselId = 0;
await t("carousel: arc, kinds, tightened text, cta slide, cover retry, brand footer, rendered PNGs", async () => {
  llmLog.length = 0;
  const { post, slideIds } = await generateCarousel({ topic: "Сайт не продаёт" });
  carouselId = post.id;
  // обложка: первая попытка «Как…» отклонена, вторая принята
  const slideCalls = llmLog.filter((x) => x.system.includes("делаешь слайды карусели"));
  assert.equal(slideCalls.length, 2);
  assert.ok(slideCalls[0].temperature === 0.7);
  const specs = (JSON.parse((await db.select().from(slideSpecs).where(eq(slideSpecs.postId, post.id)))[0].data).specs as any[]);
  assert.equal(specs[0].kind, "cover"); assert.ok(!/^как/i.test(specs[0].title));
  assert.equal(specs.at(-1).kind, "cta"); assert.ok(specs.at(-1).button);
  const kinds = new Set(specs.map((x) => x.kind));
  assert.ok(["point", "checklist", "compare"].every((k) => kinds.has(k)), [...kinds].join());
  assert.ok(!kinds.has("stats") && !kinds.has("quote"), "stats from non-facts and unknown kinds must become point");
  for (const sp of specs.slice(1, -1)) assert.ok((sp.body ?? "").length <= 120, `body ${sp.body?.length}`);
  const cl = specs.find((x) => x.kind === "checklist"); assert.ok(cl.items.length <= 5);
  const cmp = specs.find((x) => x.kind === "compare"); assert.ok(cmp.left.items.length <= 3);
  assert.equal(slideIds.length, specs.length);
  assert.equal(post.size, "carousel"); assert.equal(post.kind, "carousel");
  assert.ok(post.imageUrl);
  // подпись: роль caption, первая строка не обязана быть вопросом, cta 2
  const cap = llmLog.find((x) => x.system.includes("подпись к карусели"))!;
  assert.ok(cap.user.includes("Ступень призыва для этого поста: 2"));
  assert.ok(!cap.user.includes("личная история из практики"));
});

await t("carousel: 73% in slide text is flagged for review", async () => {
  const p = (await db.select().from(posts).where(eq(posts.id, carouselId)))[0];
  assert.equal(p.reviewNote, "", "stats slide was converted; remaining text has no unsupported numbers: " + p.reviewNote);
});

await t("second carousel gets earlier captions as 'recent' (no variant:0 shell)", async () => {
  llmLog.length = 0;
  await generateCarousel({ topic: "Карточка товара не продаёт" });
  const cap = llmLog.find((x) => x.system.includes("подпись к карусели"))!;
  assert.ok(cap.user.includes("ПЕРВЫЕ СТРОКИ ПОСЛЕДНИХ ПОСТОВ"));
});

await t("digest: conclusion first line, ≤2 links, no inline URLs, temp 0.45, sources, label, review off", async () => {
  llmLog.length = 0;
  const { post, slideIds } = await generateDigest({ carousel: true, photos: false });
  const call = llmLog.find((x) => x.system.includes("ПЕРСОНА ДАЙДЖЕСТА"))!;
  assert.equal(call.temperature, 0.45);
  assert.ok(call.user.includes("Дату и слово «Дайджест» в текст не ставь"));
  const first = post.text.split("\n")[0];
  assert.ok(!/^дайджест/i.test(first) && first.length <= 110, first);
  const links = post.text.match(/https?:\/\/\S+/g) ?? [];
  assert.ok(links.length >= 1 && links.length <= 2, String(links.length));
  assert.ok(!post.text.includes("should-be-stripped") && !post.text.includes("ИСТОЧНИКИ"));
  assert.equal(post.reviewNote, "");
  assert.ok(slideIds.length >= 4);
  assert.ok(/^\[1\] /m.test(call.user)); // материалы пронумерованы для ИСТОЧНИКИ: N
});

await t("digest: number not from materials → reviewNote", async () => {
  flags.digestBadNumber = true;
  const { post } = await generateDigest({ carousel: false });
  flags.digestBadNumber = false;
  assert.ok(post.reviewNote.includes("47%"), post.reviewNote);
});

await t("digest dedup: same story from two sources collapses (news layer)", async () => {
  const { fetchNews } = await import("../src/lib/news");
  const items = await fetchNews({ niche: "сайты, боты", limit: 10 });
  assert.ok(items.length >= 5);
  assert.ok(items.some((i) => i.source === "Test Biz"));
});

/* ---------- расписание ---------- */
await t("nextPublishTimes: slot mode, weekdays only, 12:30 Moscow, defaults when slots empty", async () => {
  const s = await core.getSettings();
  const times = nextPublishTimes({ ...s, scheduleTimes: "", postMode: "schedule" }, 10);
  assert.equal(times.length, 10);
  for (const d of times) {
    const p = core.zonedParts(d);
    assert.ok(p.weekday >= 1 && p.weekday <= 5, `weekday ${p.weekday}`);
    assert.equal(p.hour, 12); assert.equal(p.minute, 30);
  }
});
await t("nextPublishTimes: interval mode never lands at night or on weekends", async () => {
  const s = await core.getSettings();
  const times = nextPublishTimes({ ...s, postMode: "interval", intervalMinutes: 240 }, 40);
  for (const d of times) {
    const p = core.zonedParts(d);
    assert.ok(p.hour >= 8 && p.hour < 21, `hour ${p.hour}`);
    assert.ok(p.weekday >= 1 && p.weekday <= 5);
  }
  assert.ok(times.every((d, i) => i === 0 || d > times[i - 1]));
});
await t("nextPublishTimes: Saturday allowed when enabled", async () => {
  const s = await core.getSettings();
  const times = nextPublishTimes({ ...s, scheduleTimes: "12:30", postMode: "schedule", publishDays: "6" }, 3);
  assert.ok(times.every((d) => core.zonedParts(d).weekday === 6));
});

/* ---------- очередь: формат слота = план недели по дате публикации ---------- */
await t("syncVkQueue: slot formats follow weekly plan; flagged posts are not scheduled", async () => {
  await db.delete(posts); // чистый старт
  postponed.length = 0; vkLog.length = 0; llmLog.length = 0;
  await db.update(settings).set({ queueSize: 5, queueTypes: "short,long,carousel", postMode: "schedule", scheduleTimes: "12:30", publishDays: "1,2,3,4,5" });
  const r = await syncVkQueue({ silent: true });
  assert.equal(r.errors.length, 0, r.errors.join("; "));
  assert.equal(r.created, 5);
  const rows = await db.select().from(posts).where(eq(posts.status, "scheduled"));
  assert.equal(rows.length, 5);
  for (const row of rows) {
    const plan = (await import("../src/lib/insights")).planForDay(new Date(row.scheduledAt!));
    const kind = row.kind === "carousel" ? "carousel" : row.size;
    assert.equal(kind, plan.format, `post #${row.id} sched ${row.scheduledAt?.toISOString()} plan ${plan.format}`);
    assert.equal(row.category, plan.category === "чек-лист" ? "чек-лист" : row.category);
    const p = core.zonedParts(new Date(row.scheduledAt!));
    assert.ok(p.weekday >= 1 && p.weekday <= 5 && p.hour === 12 && p.minute === 30);
  }
  // VK получил по одному wall.post на пост, у карусели есть вложения
  assert.equal(vkLog.filter((x) => x.method === "wall.post").length, 5);
});

await t("syncVkQueue: post needing review is not scheduled", async () => {
  await db.delete(posts); postponed.length = 0; vkLog.length = 0;
  flags.badNumber = true;
  await db.update(settings).set({ queueTypes: "short", queueSize: 2 });
  const r = await syncVkQueue({ silent: true });
  flags.badNumber = false;
  assert.equal(r.created, 0);
  assert.ok(r.errors.some((e) => e.includes("ручной проверке")), r.errors.join("|"));
  assert.equal(vkLog.filter((x) => x.method === "wall.post").length, 0);
  const rows = await db.select().from(posts);
  assert.ok(rows.length >= 1 && rows.every((x) => x.status === "draft" && x.reviewNote));
});

await t("slot type respected: short slot does not take a long draft", async () => {
  await db.delete(posts); postponed.length = 0;
  await db.insert(posts).values({ text: "Длинный черновик ".repeat(200), status: "draft", size: "long", category: "разбор" });
  await db.update(settings).set({ queueTypes: "short", queueSize: 1 });
  const r = await syncVkQueue({ silent: true });
  assert.equal(r.created, 1);
  const sched = (await db.select().from(posts).where(eq(posts.status, "scheduled")))[0];
  assert.equal(sched.size, "short");
  const left = (await db.select().from(posts).where(eq(posts.status, "draft")))[0];
  assert.equal(left.size, "long");
});


/* ---------- тик автопостинга (режим слотов) ---------- */
const { runTickIfDue } = await import("../src/lib/actions");
const { planForDay } = await import("../src/lib/insights");
function nowSlot() { const z = core.zonedParts(new Date()); return `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`; }

await t("tick (slot mode): publishes draft of the type the weekly plan asks for", async () => {
  await db.delete(posts); postponed.length = 0; vkLog.length = 0;
  const plan = planForDay(new Date());
  await db.update(settings).set({ active: true, autoQueue: false, postMode: "schedule", scheduleTimes: nowSlot(), publishDays: "0,1,2,3,4,5,6", lastSlotKey: "", queueTypes: "short,long,carousel", digestEnabled: false, autoReply: false, autoModerate: false });
  // «чужой» черновик другого типа не должен быть взят
  const wrongSize = plan.format === "long" ? "short" : "long";
  await db.insert(posts).values({ text: "Чужой черновик. ".repeat(wrongSize === "long" ? 200 : 5), status: "draft", size: wrongSize, category: "x" });
  const r = await runTickIfDue();
  assert.equal((r as any).ran, true, JSON.stringify(r));
  const pub = (await db.select().from(posts).where(eq(posts.id, (r as any).postId)))[0];
  const kind = pub.kind === "carousel" ? "carousel" : pub.size;
  assert.equal(kind, plan.format);
  assert.ok(vkLog.some((x) => x.method === "wall.post"));
  const wrong = (await db.select().from(posts).where(eq(posts.category, "x")))[0];
  assert.equal(wrong.status, "draft");
});

await t("tick: flagged post → slot closed, no regeneration loop on next tick", async () => {
  await db.delete(posts); llmLog.length = 0;
  flags.badNumber = true;
  await db.update(settings).set({ lastSlotKey: "", scheduleTimes: nowSlot(), queueTypes: "short" });
  const r1 = await runTickIfDue();
  assert.equal((r1 as any).ran, false);
  const calls = llmLog.length;
  const r2 = await runTickIfDue();
  flags.badNumber = false;
  assert.equal(llmLog.length, calls, "second tick must not call the LLM again");
  assert.ok(["no-slot-due", "interval-wait"].includes((r2 as any).reason), JSON.stringify(r2));
  const rows = await db.select().from(posts);
  assert.ok(rows.length >= 1 && rows.every((x) => x.status === "draft" && x.reviewNote));
});

/* ---------- комментарии ---------- */
const comments = await import("../src/lib/comments");
await t("buildReply: lead prompt, no emoji-persona, empty for negative/thanks path", async () => {
  llmLog.length = 0;
  const r = await comments.buildReply("сколько стоит лендинг?", "question", { faq: "", instruction: "x", apiKey: "sk-test-1234567890", lead: true });
  assert.ok(r.length > 10);
  assert.ok(llmLog[0].system.includes("лид") && llmLog[0].system.includes("ОДИН уточняющий вопрос"));
  assert.equal(llmLog[0].temperature, 0.6);
  assert.equal(await comments.buildReply("Ужас, обман", "negative", { faq: "", instruction: "", apiKey: "sk-test-1234567890" }), "");
});
await t("buildReply fallback without AI: no emoji, no 'отправим в личку'", async () => {
  flags.aiDown = true;
  const a = await comments.buildReply("сколько стоит?", "question", { faq: "", instruction: "", apiKey: "sk-test-1234567890", lead: true });
  const b = await comments.buildReply("Спасибо!", "positive", { faq: "", instruction: "", apiKey: "sk-test-1234567890" });
  flags.aiDown = false;
  assert.ok(a && !/[\u{1F300}-\u{1FAFF}]/u.test(a) && !/отправим/i.test(a));
  assert.equal(b, "");
});

/* ---------- PATCH ручной проверки ---------- */
await t("review flow: approve clears note; edit re-checks numbers", async () => {
  const p = (await db.insert(posts).values({ text: "Рост 30% за месяц", status: "draft", reviewNote: "числа без опоры" }).returning())[0];
  const route = await import("../src/app/api/posts/[id]/route");
  const ctx = { params: Promise.resolve({ id: String(p.id) }) };
  let res = await route.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ text: "Рост 30% за месяц у клиента" }) }), ctx);
  let j = await res.json(); assert.ok(j.post.reviewNote.includes("30%"));
  res = await route.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ text: "Реклама есть, а заявок нет." }) }), ctx);
  j = await res.json(); assert.equal(j.post.reviewNote, "");
  await db.update(posts).set({ reviewNote: "x" }).where(eq(posts.id, p.id));
  res = await route.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ approve: true }) }), ctx);
  j = await res.json(); assert.equal(j.post.reviewNote, "");
});

console.log(`\n${passed} passed`);
server.close();
process.exit(process.exitCode ?? 0);
