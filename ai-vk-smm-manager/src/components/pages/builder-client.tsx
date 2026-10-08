"use client";

import { ArrowDown, ArrowUp, Layers, Plus, Rocket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Panel, PixelLoader } from "@/components/ui";
import { DesignPicker } from "@/components/pages/design-client";
import {
  defaultSpec,
  SLIDE_TEMPLATES,
  TEMPLATE_GROUPS,
  type SlideSpecLike,
  type SlideTemplateId,
} from "@/lib/templates";

type Slide = { key: number; spec: SlideSpecLike };

let seed = 1;
const nextKey = () => seed++;

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

/** Поля редактирования зависят от шаблона — вся правка текстовая, превью рисует сервер. */
function SpecFields({ spec, onChange }: { spec: SlideSpecLike; onChange: (s: SlideSpecLike) => void }) {
  const set = (k: keyof SlideSpecLike, v: unknown) => onChange({ ...spec, [k]: v });
  const showTitle = spec.kind !== "cta";
  const listKinds = ["checklist", "steps", "timeline", "ticker", "price"];
  return (
    <div className="flex flex-col gap-3">
      {showTitle && spec.kind !== "quote" ? (
        <F label="Заголовок">
          <input className="pixel-input" value={spec.title ?? ""} maxLength={90} onChange={(e) => set("title", e.target.value)} />
        </F>
      ) : null}
      {spec.kind === "cover" || spec.kind === "point" || spec.kind === "outro" || spec.kind === "cta" ? (
        <F label={spec.kind === "cta" ? "Пояснение" : "Подзаголовок / текст"}>
          <textarea className="pixel-textarea" rows={2} value={spec.body ?? ""} maxLength={260} onChange={(e) => set("body", e.target.value)} />
        </F>
      ) : null}
      {spec.kind === "quote" ? (
        <>
          <F label="Цитата">
            <textarea className="pixel-textarea" rows={3} value={spec.body ?? ""} maxLength={220} onChange={(e) => set("body", e.target.value)} />
          </F>
          <F label="Подпись (автор)">
            <input className="pixel-input" value={spec.author ?? ""} maxLength={60} onChange={(e) => set("author", e.target.value)} />
          </F>
        </>
      ) : null}
      {listKinds.includes(spec.kind) ? (
        <F
          label={
            spec.kind === "steps"
              ? "Шаги (с новой строки; «Заголовок — пояснение»)"
              : spec.kind === "timeline"
                ? "Этапы (с новой строки; «Неделя 1 — что делаем»)"
                : spec.kind === "ticker"
                  ? "Строки-заголовки (до 3)"
                  : spec.kind === "price"
                    ? "Что входит в тариф (с новой строки)"
                    : "Пункты (каждый с новой строки, до 5)"
          }
        >
          <textarea
            className="pixel-textarea"
            rows={5}
            value={(spec.items ?? []).join("\n")}
            onChange={(e) => set("items", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, spec.kind === "ticker" ? 3 : 5))}
          />
        </F>
      ) : null}
      {spec.kind === "faq" ? (
        <>
          <F label="Вопрос клиента">
            <input className="pixel-input" value={spec.question ?? ""} maxLength={120} onChange={(e) => set("question", e.target.value)} />
          </F>
          <F label="Ответ">
            <textarea className="pixel-textarea" rows={3} value={spec.answer ?? ""} maxLength={300} onChange={(e) => set("answer", e.target.value)} />
          </F>
        </>
      ) : null}
      {spec.kind === "price" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <F label="Цена крупно">
            <input className="pixel-input" value={spec.price ?? ""} maxLength={20} placeholder="80 000 руб." onChange={(e) => set("price", e.target.value)} />
          </F>
          <F label="Подпись под ценой">
            <input className="pixel-input" value={spec.period ?? ""} maxLength={40} placeholder="срок 2 недели" onChange={(e) => set("period", e.target.value)} />
          </F>
        </div>
      ) : null}
      {spec.kind === "bars" ? (
        <F label="Столбики: подпись и значение (до 5)">
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => {
              const bars = spec.bars ?? [];
              return (
                <div key={i} className="flex gap-2">
                  <input
                    className="pixel-input flex-1"
                    placeholder={i === 0 ? "Было" : i === 1 ? "Стало" : "подпись"}
                    value={bars[i]?.label ?? ""}
                    maxLength={24}
                    onChange={(e) => {
                      const next = [...bars];
                      next[i] = { label: e.target.value, value: next[i]?.value ?? 0 };
                      set("bars", next.filter((x) => x.label));
                    }}
                  />
                  <input
                    className="pixel-input !w-24"
                    type="number"
                    value={bars[i]?.value ?? ""}
                    onChange={(e) => {
                      const next = [...bars];
                      next[i] = { label: next[i]?.label ?? "", value: Number(e.target.value) || 0 };
                      set("bars", next.filter((x) => x.label));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </F>
      ) : null}
      {spec.kind === "logos" ? (
        <F label="Плитки: технологии или клиенты (через запятую, до 8)">
          <input
            className="pixel-input"
            value={(spec.tags ?? []).join(", ")}
            onChange={(e) => set("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8))}
          />
        </F>
      ) : null}
      {spec.kind === "stats" ? (
        <>
          <F label="Метрики (1–3): значение + подпись">
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => {
                const st = spec.stats ?? [];
                return (
                  <div key={i} className="flex gap-2">
                    <input
                      className="pixel-input !w-28"
                      placeholder="48 часов"
                      value={st[i]?.value ?? ""}
                      maxLength={16}
                      onChange={(e) => {
                        const next = [...st];
                        next[i] = { value: e.target.value, label: next[i]?.label ?? "" };
                        set("stats", next.filter((x) => x.value || x.label));
                      }}
                    />
                    <input
                      className="pixel-input flex-1"
                      placeholder="подпись: что значит эта цифра"
                      value={st[i]?.label ?? ""}
                      maxLength={60}
                      onChange={(e) => {
                        const next = [...st];
                        next[i] = { value: next[i]?.value ?? "", label: e.target.value };
                        set("stats", next.filter((x) => x.value || x.label));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </F>
        </>
      ) : null}
      {spec.kind === "compare" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="flex flex-col gap-2">
              <F label={side === "left" ? "Левая колонка — заголовок" : "Правая колонка — заголовок"}>
                <input
                  className="pixel-input"
                  value={spec[side]?.title ?? ""}
                  maxLength={40}
                  onChange={(e) => set(side, { title: e.target.value, items: spec[side]?.items ?? [] })}
                />
              </F>
              <F label="Пункты (по строкам, до 4)">
                <textarea
                  className="pixel-textarea"
                  rows={4}
                  value={(spec[side]?.items ?? []).join("\n")}
                  onChange={(e) =>
                    set(side, {
                      title: spec[side]?.title ?? "",
                      items: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4),
                    })
                  }
                />
              </F>
            </div>
          ))}
        </div>
      ) : null}
      {spec.kind === "code" ? (
        <F label="Строки терминала (до 9; $ — команда, # — комментарий, + — успех)">
          <textarea
            className="pixel-textarea font-mono"
            rows={6}
            value={(spec.codeLines ?? []).join("\n")}
            onChange={(e) => set("codeLines", e.target.value.split("\n").slice(0, 9))}
          />
        </F>
      ) : null}
      {spec.kind === "cta" ? (
        <F label="Текст на кнопке">
          <input className="pixel-input" value={spec.button ?? ""} maxLength={40} onChange={(e) => set("button", e.target.value)} />
        </F>
      ) : null}
    </div>
  );
}

export default function BuilderClient({ onDone }: { onDone?: () => void }) {
  const [slides, setSlides] = useState<Slide[]>([
    { key: nextKey(), spec: defaultSpec("cover") },
    { key: nextKey(), spec: defaultSpec("point") },
    { key: nextKey(), spec: defaultSpec("outro") },
  ]);
  const [sel, setSel] = useState(0);
  const [theme, setTheme] = useState("default");
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [format, setFormat] = useState("square");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const reqId = useRef(0);

  const templateName = (id: string) => SLIDE_TEMPLATES.find((t) => t.id === id)?.name ?? id;
  const current = slides[Math.min(sel, slides.length - 1)];

  // живое превью выбранного слайда
  useEffect(() => {
    if (!current) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const r = await fetch("/api/design/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme, spec: current.spec, index: sel + 1, total: slides.length }),
        });
        const data = (await r.json()) as { image?: string; format?: string; error?: string };
        if (id !== reqId.current) return;
        if (data.error || !data.image) setErr(data.error ?? "Ошибка превью");
        else {
          setErr(null);
          setImage(data.image);
          setFormat(data.format ?? "square");
        }
      } catch {
        if (id === reqId.current) setErr("Не удалось получить превью");
      } finally {
        if (id === reqId.current) setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [current, theme, sel, slides.length]);

  function addSlide(id: SlideTemplateId) {
    setSlides((p) => [...p, { key: nextKey(), spec: defaultSpec(id) }]);
    setSel((_) => slides.length);
    setPickerOpen(false);
  }

  function move(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= slides.length) return;
    setSlides((p) => {
      const copy = [...p];
      const [x] = copy.splice(from, 1);
      copy.splice(to, 0, x);
      return copy;
    });
    setSel(to);
  }

  function remove(idx: number) {
    if (slides.length <= 1) return;
    setSlides((p) => p.filter((_, i) => i !== idx));
    setSel((s) => Math.max(0, Math.min(s, slides.length - 2)));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", theme, caption, slides: slides.map((s) => s.spec) }),
      });
      const d = (await r.json()) as { post?: { id: number }; error?: string };
      if (d.error || !d.post) {
        setErr(d.error ?? "Не удалось сохранить");
      } else {
        setMsg(`Черновик карусели #${d.post.id} создан ниже ✓ Его можно опубликовать, запланировать или поменять дизайн.`);
        onDone?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Конструктор карусели по шаблонам" icon={Layers} className="panel-bright">
      <p className="mb-4 text-base leading-6 text-muted">
        Шаблоны собраны по принципам базы forevercomponents.com — типографика, списки и прогресс, карточки, дата-виз, терминал,
        маркетинговые призывы. Соберите структуру, впишите тексты, а дизайн (цвета, шрифты, макет, логотип) возьмём из выбранного стиля.
      </p>
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* ---------- структура ---------- */}
        <div className="flex flex-col gap-3">
          {slides.map((s, i) => (
            <div key={s.key} className={`panel p-3 ${i === sel ? "border-[3px] border-[#34d576]" : ""}`}>
              <div className="flex items-center gap-2">
                <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left" onClick={() => setSel(i)}>
                  <span className="font-display text-[9px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <Badge tone={s.spec.kind === "cover" ? "neon" : s.spec.kind === "cta" || s.spec.kind === "outro" ? "yellow" : "cyan"}>
                    {templateName(s.spec.kind)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.spec.title || s.spec.body || "…"}</span>
                </button>
                <button className="btn btn-sm btn-ghost !px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                  <ArrowUp size={12} />
                </button>
                <button className="btn btn-sm btn-ghost !px-2" disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                  <ArrowDown size={12} />
                </button>
                <button className="btn btn-sm btn-red !px-2" onClick={() => remove(i)} aria-label="Удалить">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-violet" onClick={() => setPickerOpen((v) => !v)}>
            <Plus size={14} /> Добавить слайд
          </button>
          {pickerOpen ? (
            <div className="panel p-3 popin">
              {TEMPLATE_GROUPS.map((g) => (
                <div key={g} className="mb-3 last:mb-0">
                  <div className="field-label !mb-2">{g}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {SLIDE_TEMPLATES.filter((t) => t.group === g).map((t) => (
                      <button key={t.id} className="btn btn-sm btn-ghost hover:!bg-[#34d576] hover:!text-[#05340f]" title={t.hint} onClick={() => addSlide(t.id)}>
                        <Plus size={11} /> {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ---------- редактор ---------- */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <div className="flex min-w-0 flex-col gap-4">
            {current ? (
              <SpecFields
                spec={current.spec}
                onChange={(spec) => setSlides((p) => p.map((x, i) => (i === sel ? { ...x, spec } : x)))}
              />
            ) : null}
            <F label="Дизайн карусели">
              <DesignPicker value={theme} onChange={setTheme} />
            </F>
            <F label="Подпись к посту (пусто — сгенерируем из заголовка)">
              <textarea className="pixel-textarea" rows={3} value={caption} maxLength={4000} onChange={(e) => setCaption(e.target.value)} />
            </F>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-neon" disabled={saving || slides.length < 2} onClick={save}>
                <Rocket size={14} /> {saving ? "Рисую карусель…" : "Сохранить как карусель"}
              </button>
              {slides.length < 2 ? <span className="text-sm text-muted">Нужно минимум 2 слайда</span> : null}
            </div>
            {err ? <p className="text-base text-red-deep">{err}</p> : null}
            {msg ? <p className="text-base text-cyan-deep">{msg}</p> : null}
          </div>
          <div className="min-w-0">
            <div className="lg:sticky lg:top-4">
              <div className="field-label !mb-2">
                Превью слайда {sel + 1}/{slides.length} {previewing ? <span className="blink">· рисую…</span> : null}
              </div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt="Превью слайда"
                  className={`w-full border-[3px] border-line object-cover ${format === "portrait" ? "aspect-[4/5]" : "aspect-square"} ${previewing ? "opacity-60" : ""}`}
                />
              ) : (
                <PixelLoader label="РИСУЮ" />
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
