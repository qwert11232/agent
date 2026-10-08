"use client";

import {
  Bot,
  CalendarClock,
  Repeat,
  Globe,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/db/schema";
import { Panel } from "@/components/ui";
import { AGENCY_PROMPT } from "@/lib/prompts";

const TONES = [
  { key: "friendly", label: "Живой", desc: "Голос практика: коротко, по-человечески, без пафоса; эмодзи 0-1 в конце", color: "btn-neon" },
  { key: "business", label: "Деловой", desc: "Больше деловых терминов, но голос остаётся живым, без канцелярита", color: "btn-cyan" },
  { key: "funny", label: "С юмором", desc: "Чуть больше иронии и самоиронии; без клоунады и мемов", color: "btn-yellow" },
] as const;

type CheckResult = { ok: boolean; simulated: boolean; message: string };

function CheckLine({ title, res }: { title: string; res: CheckResult }) {
  const Icon = res.ok ? CheckCircle2 : res.simulated ? TriangleAlert : XCircle;
  const cls = res.ok ? "text-neon-dim border-neon bg-[#e9fbf0]" : res.simulated ? "text-yellow-deep border-yellow bg-[#fff7e0]" : "text-red-deep border-red bg-[#ffecec]";
  return (
    <div className={`flex items-start gap-3 border-[3px] px-3 py-2.5 ${cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span className="text-base leading-5">
        <b className="font-display text-[9px] uppercase tracking-widest">{title}</b>
        <br />
        {res.message}
      </span>
    </div>
  );
}

export default function SettingsClient({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    vkToken: initial.vkToken,
    gptKey: initial.gptKey,
    vkServiceToken: initial.vkServiceToken,
    groupId: initial.groupId,
    instruction: initial.instruction,
    tone: initial.tone,
    factsBank: initial.factsBank,
    brandFooter: initial.brandFooter,
  });
  const [times] = useState<string[]>(
    initial.scheduleTimes.split(",").map((t) => t.trim()).filter(Boolean),
  );
  const [active, setActive] = useState(initial.active);
  const [useWebSearch, setUseWebSearch] = useState(initial.useWebSearch);
  const [useImages, setUseImages] = useState(initial.useImages);
  const [imageSource, setImageSource] = useState(initial.imageSource);
  const [ideasEnabled, setIdeasEnabled] = useState(initial.competitorIdeasEnabled);
  const [tg, setTg] = useState({ token: initial.tgToken, chatId: initial.tgChatId });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checks, setChecks] = useState<{ vk: CheckResult; gpt: CheckResult; service?: CheckResult } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          useWebSearch,
          useImages,
          imageSource,
          autoReply: initial.autoReply,
          autoModerate: initial.autoModerate,
          faq: initial.faq,
          competitorIdeasEnabled: ideasEnabled,
          tgToken: tg.token,
          tgChatId: tg.chatId,
          useStrategy: initial.useStrategy,
        }),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3500);
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    setChecking(true);
    try {
      const res = await fetch("/api/settings/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setChecks((await res.json()) as { vk: CheckResult; gpt: CheckResult; service?: CheckResult });
    } finally {
      setChecking(false);
    }
  }

  async function toggleActive() {
    setActive((a) => !a);
    const res = await fetch("/api/toggle", { method: "POST" });
    const data = (await res.json()) as { settings: Settings };
    setActive(data.settings.active);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* ============ AUTOPILOT ============ */}
      <div className={`panel border-l-[10px] ${active ? "border-l-neon" : "border-l-red"} flex flex-wrap items-center gap-4 p-5`}>
        <Power size={26} className={active ? "text-neon-dim" : "text-red-deep"} />
        <div className="min-w-0 flex-1">
          <p className={`font-display text-[11px] uppercase tracking-widest ${active ? "text-neon-dim" : "text-red-deep"}`}>
            Автопостинг {active ? "включён" : "выключен"}
          </p>
          <p className="text-base text-muted">
            Планировщик публикует посты в слоты: {times.join(" · ") || "— не заданы"}
          </p>
        </div>
        <div className="pxtoggle scale-125" data-on={active} onClick={toggleActive} role="switch" aria-checked={active} />
      </div>

      {/* ============ TOKENS ============ */}
      <Panel title="Доступы и API" icon={KeyRound}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">VK Access Token</label>
            <input
              value={form.vkToken}
              onChange={set("vkToken")}
              placeholder="vk1.a.… или demo"
              className="pixel-input font-mono text-base"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label">Group ID</label>
            <input
              value={form.groupId}
              onChange={set("groupId")}
              placeholder="например: 223344556"
              className="pixel-input font-mono text-base"
              inputMode="numeric"
            />
          </div>
          <div className="md:col-span-2">
            <label className="field-label">VK Сервисный ключ (анализ конкурентов)</label>
            <input
              value={form.vkServiceToken}
              onChange={set("vkServiceToken")}
              placeholder="сервисный ключ приложения VK ID (или переменная VK_SERVICE_TOKEN)"
              className="pixel-input font-mono text-base"
              autoComplete="off"
            />
            <p className="mt-1.5 text-sm text-muted">
              Отдельный от токена сообщества: им бот только ЧИТАЕТ чужие открытые стены. Публикует по-прежнему токен сообщества.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-3 text-base">
              <span
                className="pxtoggle"
                data-on={ideasEnabled}
                onClick={() => setIdeasEnabled((v) => !v)}
                role="switch"
                aria-checked={ideasEnabled}
              />
              Раз в сутки превращать вирусные посты конкурентов в черновики
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="field-label">AI API Key (OpenAI / Groq)</label>
            <input
              value={form.gptKey}
              onChange={set("gptKey")}
              placeholder="sk-… или gsk_…"
              className="pixel-input font-mono text-base"
              autoComplete="off"
            />
            <p className="mt-1.5 text-sm text-muted">
              Поддерживаются OpenAI (sk-…) и Groq (gsk_…, модель gpt-oss-120b). Без ключа посты не генерируются: заглушек вместо текста бот не публикует.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={validate} disabled={checking} className="btn btn-cyan">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            Проверить токены
          </button>
          <span className="flex items-center gap-2 text-base text-muted">
            <ShieldCheck size={14} className="text-neon-dim" />
            Проверка идёт через VK groups.getById и /models у провайдера AI
          </span>
        </div>

        {checks ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 popin">
            <CheckLine title="VK API" res={checks.vk} />
            <CheckLine title="AI API" res={checks.gpt} />
            {checks.service ? <CheckLine title="VK сервисный ключ" res={checks.service} /> : null}
          </div>
        ) : null}
      </Panel>

      {/* ============ УВЕДОМЛЕНИЯ ============ */}
      <Panel title="Уведомления владельцу (Telegram)" icon={Bot}>
        <p className="mb-4 text-base text-muted">
          Опционально: бот шлёт вам алерты о публикациях, негативных комментариях и
          потенциальных клиентах. Создайте бота через @BotFather и узнайте chat id
          через @userinfobot.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Telegram Bot Token</label>
            <input
              value={tg.token}
              onChange={(e) => setTg((t) => ({ ...t, token: e.target.value }))}
              placeholder="123456:ABC-DEF…"
              className="pixel-input font-mono text-base"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label">Chat ID (ваш id)</label>
            <input
              value={tg.chatId}
              onChange={(e) => setTg((t) => ({ ...t, chatId: e.target.value }))}
              placeholder="123456789"
              className="pixel-input font-mono text-base"
              inputMode="numeric"
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Пустые поля — уведомления просто не отправляются, на работу бота не влияет.
          Можно также задать через переменные TG_BOT_TOKEN и TG_CHAT_ID.
        </p>
      </Panel>

      {/* ============ CONTENT ============ */}
      <Panel title="Контент и тон" icon={SlidersHorizontal}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="field-label !mb-0">Инструкция боту (system prompt)</label>
          <button
            onClick={() => setForm((f) => ({ ...f, instruction: AGENCY_PROMPT }))}
            type="button"
            className="btn btn-sm btn-violet"
            title="Сбросить на профильный промпт AI-агентства: кейсы, инсайты, офферы"
          >
            <FlaskConical size={12} /> Шаблон AI-агентства
          </button>
        </div>
        <textarea
          value={form.instruction}
          onChange={set("instruction")}
          rows={4}
          placeholder="Опишите тематику группы, стиль и что публиковать…"
          className="pixel-textarea"
        />

        <label className="field-label mt-5 block">Банк фактов (реальные кейсы, ошибки, наблюдения, цифры)</label>
        <textarea
          value={form.factsBank}
          onChange={set("factsBank")}
          rows={6}
          placeholder={"Одна запись - один абзац. Формат: тип (кейс / моя ошибка / наблюдение / публичная цифра с источником) · ниша · что было · что сделали · результат (только реальный) · можно публиковать (да / только обобщённо).\nПример: кейс · магазин на Ozon · карточки с упаковкой на первом фото · поставили на первое фото результат использования · конверсия карточки выросла с 2 до 3 % за месяц, клиент разрешил · да"}
          className="pixel-textarea"
        />
        <p className="mt-1.5 text-sm text-muted">
          Только отсюда бот берёт личные истории, результаты клиентов и точные цифры. Пока банк пуст, посты строятся на позиции автора,
          разборе типовой ситуации и расчёте на условных числах («допустим…»), без выдуманных клиентов. Пост с числом, которого нет
          в банке и нет в расчёте, помечается на проверку и не уходит в автоочередь.
        </p>

        <label className="field-label mt-5 block">Подпись бренда на слайдах</label>
        <input
          value={form.brandFooter}
          onChange={set("brandFooter")}
          placeholder="@my_agency"
          className="pixel-input"
          maxLength={40}
        />

        <label className="field-label mt-5 block">Тон общения</label>
        <div className="grid gap-3 sm:grid-cols-3">
          {TONES.map((t) => (
            <button
              key={t.key}
              onClick={() => setForm((f) => ({ ...f, tone: t.key }))}
              className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${
                form.tone === t.key ? t.color : "btn-ghost"
              }`}
              style={{ padding: "12px 14px" }}
            >
              <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
                {form.tone === t.key ? "▣" : "▢"} {t.label}
              </span>
              <span className="text-left font-pixel text-sm opacity-90">{t.desc}</span>
            </button>
          ))}
        </div>
      </Panel>

      {/* ============ SCHEDULE SUMMARY ============ */}
      <Panel title="Расписание и очередь" icon={CalendarClock} className="panel-bright">
        <p className="text-base leading-6 text-muted">
          Сейчас: слоты {times.length ? times.join(" · ") : "не заданы"} · запас в ВКонтакте: {initial.queueSize} ·
          автоочередь {initial.autoQueue ? "включена" : "выключена"}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href="/content?tab=planner" className="btn btn-neon">
            <CalendarClock size={14} /> Открыть планировщик
          </Link>
        </div>
        <p className="mt-3 text-sm leading-5 text-muted">
          Частота, время выхода, размер запаса и типы постов в ротации (короткие, лонгриды, карусели)
          настраиваются на странице «Контент → Планировщик» — простыми переключателями, без ручного ввода.
        </p>
      </Panel>

      {/* ============ IMAGE SOURCE ============ */}
      <Panel title="Источник изображений" icon={ImageIcon}>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { key: "none", label: "Без картинок", desc: "Только текст" },
            { key: "ai", label: "AI-генерация", desc: "Рисуется иллюстрация под текст" },
            { key: "library", label: "Моя библиотека", desc: "Ваши фото + микро-ТЗ к каждому" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setImageSource(m.key);
                setUseImages(m.key !== "none");
              }}
              className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${
                imageSource === m.key ? "btn-pink" : "btn-ghost"
              }`}
              style={{ padding: "12px 14px" }}
            >
              <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
                {imageSource === m.key ? "▣" : "▢"} {m.label}
              </span>
              <span className="text-left font-pixel text-sm opacity-90">{m.desc}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          В режиме «Моя библиотека» бот берёт ваши фото по кругу и пишет текст строго
          по микро-ТЗ — фото остаётся вашим, генерируется только текст.
        </p>
      </Panel>

      {/* ============ SUPERPOWERS ============ */}
      <Panel title="Возможности генератора" icon={Sparkles}>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => setUseWebSearch((v) => !v)}
            className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${
              useWebSearch ? "btn-cyan" : "btn-ghost"
            }`}
            style={{ padding: "14px 16px" }}
          >
            <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
              <Globe size={13} /> {useWebSearch ? "▣" : "▢"} Поиск в интернете
            </span>
            <span className="text-left font-pixel text-sm opacity-90">
              Бот ищет свежие факты и пишет пост по ним, добавляя источники.
            </span>
          </button>
          <button
            onClick={() => setUseImages((v) => !v)}
            className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${
              useImages ? "btn-pink" : "btn-ghost"
            }`}
            style={{ padding: "14px 16px" }}
          >
            <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
              <ImageIcon size={13} /> {useImages ? "▣" : "▢"} Генерация картинок
            </span>
            <span className="text-left font-pixel text-sm opacity-90">
              К каждому посту рисуется иллюстрация и грузится на стену VK.
            </span>
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Обе функции бесплатны и не требуют ключей. Для более качественного поиска
          можно задать переменную окружения TAVILY_API_KEY.
        </p>
      </Panel>

      {/* ============ SAVE ============ */}
      <div className="sticky bottom-3 z-20 flex items-center gap-4">
        <button onClick={save} disabled={saving} className="btn btn-neon flex-1 !py-4 !text-[11px]">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Сохранить настройки
        </button>
        {saved ? (
          <span className="badge bg-[#34d576] text-[#05340f] popin">
            <span className="led" /> СОХРАНЕНО В POSTGRES
          </span>
        ) : null}
      </div>
    </div>
  );
}
