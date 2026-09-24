"use client";

import {
  CalendarClock,
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/db/schema";
import { Panel } from "@/components/ui";

const TONES = [
  { key: "friendly", label: "Дружеский", desc: "Тёплые посты, «друзья», лёгкие эмодзи", color: "btn-neon" },
  { key: "business", label: "Деловой", desc: "Структура, тезисы, корпоративный стиль", color: "btn-cyan" },
  { key: "funny", label: "Смешной", desc: "Шутки, мемы, дерзкие CTA", color: "btn-yellow" },
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
    groupId: initial.groupId,
    instruction: initial.instruction,
    tone: initial.tone,
  });
  const [times, setTimes] = useState<string[]>(
    initial.scheduleTimes.split(",").map((t) => t.trim()).filter(Boolean),
  );
  const [active, setActive] = useState(initial.active);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checks, setChecks] = useState<{ vk: CheckResult; gpt: CheckResult } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, scheduleTimes: times.join(",") }),
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
      setChecks((await res.json()) as { vk: CheckResult; gpt: CheckResult });
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

  function setTime(i: number, v: string) {
    setTimes((t) => t.map((x, idx) => (idx === i ? v : x)));
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
            <label className="field-label">AI API Key (OpenAI / Groq)</label>
            <input
              value={form.gptKey}
              onChange={set("gptKey")}
              placeholder="sk-… или gsk_… (пусто → встроенный генератор)"
              className="pixel-input font-mono text-base"
              autoComplete="off"
            />
            <p className="mt-1.5 text-sm text-muted">
              Поддерживаются OpenAI (sk-…) и Groq (gsk_…, модель gpt-oss-120b). Ключ можно не задавать — бот будет писать сам.
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
          </div>
        ) : null}
      </Panel>

      {/* ============ CONTENT ============ */}
      <Panel title="Контент и тон" icon={SlidersHorizontal}>
        <label className="field-label">Инструкция боту (system prompt)</label>
        <textarea
          value={form.instruction}
          onChange={set("instruction")}
          rows={4}
          placeholder="Опишите тематику группы, стиль и что публиковать…"
          className="pixel-textarea"
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

      {/* ============ SCHEDULE ============ */}
      <Panel title="Расписание постов" icon={CalendarClock}>
        <p className="mb-3 text-base text-muted">
          Слоты времени в формате ЧЧ:ММ — до 10 штук. По наступлении слота бот
          публикует готовый черновик или генерирует новый.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {times.map((t, i) => (
            <span key={i} className="flex items-center gap-0 border-[3px] border-line bg-bg">
              <input
                type="time"
                value={t}
                onChange={(e) => setTime(i, e.target.value)}
                className="bg-transparent px-3 py-2.5 font-display text-[11px] text-neon-dim outline-none"
              />
              <button
                onClick={() => setTimes((arr) => arr.filter((_, idx) => idx !== i))}
                className="border-l-[3px] border-line px-2.5 py-2.5 text-red-deep hover:bg-panel2"
                title="Удалить слот"
              >
                <Trash2 size={14} />
              </button>
            </span>
          ))}
          {times.length < 10 ? (
            <button onClick={() => setTimes((arr) => [...arr, "12:00"])} className="btn btn-sm btn-ghost">
              <Plus size={13} /> Слот
            </button>
          ) : null}
        </div>
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
