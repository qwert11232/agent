"use client";

import { Check, Palette, RefreshCw, Save, Star, Trash2, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Panel, PixelLoader } from "@/components/ui";
import { DEFAULT_DESIGN, type Design } from "@/lib/design";

type PresetItem = { id: string | number; name: string; design: Design };
type DesignInfo = {
  default: Design;
  builtin: { id: string; name: string; design: Design }[];
  saved: { id: number; name: string; design: Design }[];
  fonts: { id: string; name: string; hint: string }[];
  layouts: readonly { id: string; name: string; hint: string }[];
  formats: readonly { id: string; name: string }[];
  fontStatus: Record<string, string>;
};
type MediaItem = { id: number; filename: string; mimeType: string };

/* ---------- Мелкие контролы ---------- */

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-base">
      <span className="pxtoggle shrink-0" data-on={on} onClick={() => onChange(!on)} role="switch" aria-checked={on} />
      {label}
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer border-[3px] border-line bg-transparent p-0.5"
          aria-label={label}
        />
        <input
          className="pixel-input font-mono"
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
        />
      </div>
    </Field>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </Field>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; name: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={`btn btn-sm ${value === o.id ? "btn-neon" : "btn-ghost"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Swatch({ d, active, name, onClick, onDelete }: { d: Design; active: boolean; name: string; onClick: () => void; onDelete?: () => void }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`block w-full border-[3px] p-1.5 text-left ${active ? "border-[#34d576]" : "border-line"}`}
        title={name}
      >
        <div
          className="flex h-16 items-end justify-between p-2"
          style={{ background: d.bgMode === "solid" ? d.from : `linear-gradient(${d.angle}deg, ${d.from}, ${d.to})` }}
        >
          <span className="text-lg font-bold leading-none" style={{ color: d.text }}>
            Аа
          </span>
          <span className="h-3 w-8" style={{ background: d.accent }} />
        </div>
        <div className="mt-1.5 truncate text-sm text-ink">{name}</div>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-1 top-1 bg-[#fa7a7a] p-1 text-[#530a0a]"
          aria-label="Удалить пресет"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Выбор дизайна для страниц «Карусели» и «Дайджест» ---------- */

export function DesignPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [info, setInfo] = useState<DesignInfo | null>(null);
  useEffect(() => {
    void fetch("/api/design")
      .then((r) => r.json() as Promise<DesignInfo>)
      .then(setInfo)
      .catch(() => undefined);
  }, []);
  return (
    <select className="pixel-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="default">Мой дизайн по умолчанию</option>
      <optgroup label="Встроенные">
        {(info?.builtin ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
      {info?.saved.length ? (
        <optgroup label="Мои пресеты">
          {info.saved.map((p) => (
            <option key={p.id} value={`saved:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

/* ---------- Страница редактора ---------- */

type Sample = { title: string; body: string; label: string };

export function DesignClient() {
  const [info, setInfo] = useState<DesignInfo | null>(null);
  const [d, setD] = useState<Design>(DEFAULT_DESIGN);
  const [activePreset, setActivePreset] = useState<string>("");
  const [sample, setSample] = useState<Sample>({ title: "", body: "", label: "" });
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [format, setFormat] = useState("square");
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/design");
    const data = (await r.json()) as DesignInfo;
    setInfo(data);
    return data;
  }, []);

  useEffect(() => {
    void load().then((data) => setD(data.default));
    void fetch("/api/media")
      .then((r) => r.json() as Promise<{ media: MediaItem[] }>)
      .then((m) => setMedia(m.media.filter((x) => /^image\/(png|jpeg)$/.test(x.mimeType))))
      .catch(() => undefined);
  }, [load]);

  // живое превью с дебаунсом
  useEffect(() => {
    if (!info) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const r = await fetch("/api/design/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ design: d, sample }),
        });
        const data = (await r.json()) as { images?: string[]; format?: string; error?: string };
        if (id !== reqId.current) return;
        if (data.error || !data.images) {
          setErr(data.error ?? "Ошибка превью");
        } else {
          setErr(null);
          setImages(data.images);
          setFormat(data.format ?? "square");
        }
      } catch {
        if (id === reqId.current) setErr("Не удалось получить превью");
      } finally {
        if (id === reqId.current) setRendering(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [d, sample, info]);

  const set = <K extends keyof Design>(key: K, value: Design[K]) => {
    setD((p) => ({ ...p, [key]: value }));
    setActivePreset("");
  };

  function applyPreset(key: string, design: Design) {
    setD((p) => ({ ...design, logoMediaId: p.logoMediaId, footer: p.footer, label: p.label }));
    setActivePreset(key);
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  }

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await r.json()) as { error?: string };
    if (!r.ok || data.error) {
      setErr(data.error ?? "Ошибка");
      return false;
    }
    return true;
  }

  async function saveDefault() {
    if (await post({ action: "saveDefault", design: d })) flash("Сохранено как дизайн по умолчанию ✓");
  }
  async function savePreset() {
    if (!presetName.trim()) return;
    if (await post({ action: "savePreset", name: presetName, design: d })) {
      setPresetName("");
      await load();
      flash("Пресет сохранён ✓");
    }
  }
  async function removePreset(id: number) {
    if (await post({ action: "deletePreset", id })) await load();
  }

  if (!info) return <PixelLoader />;

  const missing = Object.entries(info.fontStatus).filter(([, v]) => v === "missing").length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Готовые стили" icon={Palette} className="panel-bright">
          <p className="mb-3 text-base leading-6 text-muted">
            Выберите основу и подстройте под себя. Любой дизайн можно сохранить как свой пресет или назначить дизайном по умолчанию — его
            будут использовать автоматические карусели и ежедневный дайджест.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {info.builtin.map((p) => (
              <Swatch key={p.id} d={p.design} name={p.name} active={activePreset === p.id} onClick={() => applyPreset(p.id, p.design)} />
            ))}
          </div>
          {info.saved.length ? (
            <>
              <div className="field-label mt-5">Мои пресеты</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {info.saved.map((p) => (
                  <Swatch
                    key={p.id}
                    d={p.design}
                    name={p.name}
                    active={activePreset === `saved:${p.id}`}
                    onClick={() => applyPreset(`saved:${p.id}`, p.design)}
                    onDelete={() => removePreset(p.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </Panel>

        <Panel title="Цвета и фон" icon={Palette}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Фон: начало" value={d.from} onChange={(v) => set("from", v)} />
            <ColorField label="Фон: конец" value={d.to} onChange={(v) => set("to", v)} />
            <ColorField label="Акцент (номера, линии, прогресс)" value={d.accent} onChange={(v) => set("accent", v)} />
            <ColorField label="Цвет свечения" value={d.glowColor} onChange={(v) => set("glowColor", v)} />
            <ColorField label="Цвет заголовков" value={d.text} onChange={(v) => set("text", v)} />
            <ColorField label="Цвет текста и подписей" value={d.muted} onChange={(v) => set("muted", v)} />
            <Field label="Тип фона">
              <Seg
                value={d.bgMode}
                onChange={(v) => set("bgMode", v)}
                options={[
                  { id: "gradient", name: "Градиент" },
                  { id: "solid", name: "Сплошной" },
                ]}
              />
            </Field>
            <Field label="Узор">
              <Seg
                value={d.pattern}
                onChange={(v) => set("pattern", v)}
                options={[
                  { id: "none", name: "Нет" },
                  { id: "dots", name: "Точки" },
                  { id: "grid", name: "Сетка" },
                ]}
              />
            </Field>
            <Slider label="Угол градиента" value={d.angle} min={0} max={360} unit="°" onChange={(v) => set("angle", v)} />
            <Slider label="Сила свечения" value={d.glowStrength} min={0} max={100} unit="%" onChange={(v) => set("glowStrength", v)} />
            <Slider label="Затемнение фото-фона" value={d.photoDim} min={0} max={100} unit="%" onChange={(v) => set("photoDim", v)} />
          </div>
        </Panel>

        <Panel title="Шрифты и размеры" icon={Type}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Шрифт заголовков">
              <select className="pixel-select" value={d.headingFont} onChange={(e) => set("headingFont", e.target.value as Design["headingFont"])}>
                {info.fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.hint}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Шрифт текста">
              <select className="pixel-select" value={d.bodyFont} onChange={(e) => set("bodyFont", e.target.value as Design["bodyFont"])}>
                {info.fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.hint}
                  </option>
                ))}
              </select>
            </Field>
            <Slider label="Размер заголовков" value={d.titleScale} min={60} max={140} unit="%" onChange={(v) => set("titleScale", v)} />
            <Slider label="Размер текста" value={d.bodyScale} min={70} max={140} unit="%" onChange={(v) => set("bodyScale", v)} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            Шрифты с кириллицей лежат в <code>assets/fonts</code> и включены в сборку.
            {missing === 0 ? <Badge tone="neon">все файлы на месте</Badge> : <Badge tone="yellow">{missing} шр. подтянутся с CDN</Badge>}
          </p>
        </Panel>

        <Panel title="Макет и формат" icon={Palette}>
          <div className="grid gap-4">
            <Field label="Макет слайда">
              <Seg value={d.layout} onChange={(v) => set("layout", v)} options={info.layouts as readonly { id: Design["layout"]; name: string; hint: string }[]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Выравнивание">
                <Seg
                  value={d.align}
                  onChange={(v) => set("align", v)}
                  options={[
                    { id: "left", name: "Слева" },
                    { id: "center", name: "По центру" },
                  ]}
                />
              </Field>
              <Field label="Формат картинки">
                <Seg value={d.format} onChange={(v) => set("format", v)} options={info.formats as readonly { id: Design["format"]; name: string }[]} />
              </Field>
              <Field label="Номер слайда">
                <Seg
                  value={d.numberStyle}
                  onChange={(v) => set("numberStyle", v)}
                  options={[
                    { id: "big", name: "Крупный" },
                    { id: "badge", name: "В круге" },
                    { id: "none", name: "Без номера" },
                  ]}
                />
              </Field>
              <Slider label="Скругление плашки" value={d.radius} min={0} max={80} unit="px" onChange={(v) => set("radius", v)} />
            </div>
          </div>
        </Panel>

        <Panel title="Элементы и бренд" icon={Star}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle on={d.showLabel} onChange={(v) => set("showLabel", v)} label="Метка сверху слева" />
            <Toggle on={d.showCounter} onChange={(v) => set("showCounter", v)} label="Счётчик 1/7" />
            <Toggle on={d.showProgress} onChange={(v) => set("showProgress", v)} label="Полоса прогресса" />
            <Toggle on={d.showArrow} onChange={(v) => set("showArrow", v)} label="Стрелка «листайте»" />
            <Toggle on={d.accentBar} onChange={(v) => set("accentBar", v)} label="Акцентная чёрточка на обложке" />
            <div />
            <Field label="Своя метка сверху (пусто = авто)">
              <input className="pixel-input" value={d.label} maxLength={40} placeholder="Например: ЛАЙФХАКИ" onChange={(e) => set("label", e.target.value)} />
            </Field>
            <Field label="Подпись бренда внизу">
              <input className="pixel-input" value={d.footer} maxLength={40} placeholder="@my_agency" onChange={(e) => set("footer", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Логотип (PNG/JPEG из библиотеки фото)">
                <select
                  className="pixel-select"
                  value={d.logoMediaId ?? ""}
                  onChange={(e) => set("logoMediaId", e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Без логотипа</option>
                  {media.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.id} · {m.filename}
                    </option>
                  ))}
                </select>
                {!media.length ? <span className="mt-1 block text-sm text-muted">Загрузите логотип в разделе «Библиотека фото».</span> : null}
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Сохранение" icon={Save}>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-neon" onClick={saveDefault}>
              <Check size={14} /> Сделать дизайном по умолчанию
            </button>
            <input
              className="pixel-input !w-56"
              placeholder="Название пресета"
              value={presetName}
              maxLength={40}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button className="btn btn-violet" disabled={!presetName.trim()} onClick={savePreset}>
              <Save size={14} /> Сохранить как пресет
            </button>
            <button className="btn btn-ghost" onClick={() => applyPreset("midnight", info.builtin[0].design)}>
              <RefreshCw size={14} /> Сбросить
            </button>
          </div>
          {msg ? <p className="mt-3 text-base text-cyan-deep">{msg}</p> : null}
        </Panel>
      </div>

      {/* превью */}
      <div className="min-w-0">
        <div className="xl:sticky xl:top-4">
          <Panel
            title="Живое превью"
            icon={Palette}
            right={rendering ? <span className="text-sm blink">рисую…</span> : null}
            className="panel-bright"
          >
            <div className="mb-4 grid gap-3">
              <Field label="Заголовок для примера">
                <input className="pixel-input" value={sample.title} maxLength={70} placeholder="5 ошибок лендинга, которые сливают бюджет" onChange={(e) => setSample({ ...sample, title: e.target.value })} />
              </Field>
              <Field label="Текст слайда для примера">
                <textarea className="pixel-textarea" rows={2} value={sample.body} maxLength={220} placeholder="Короткое пояснение с практическим советом" onChange={(e) => setSample({ ...sample, body: e.target.value })} />
              </Field>
            </div>
            {err ? <p className="mb-3 text-base text-red-deep">{err}</p> : null}
            <div className="grid grid-cols-3 gap-2 xl:grid-cols-1 xl:gap-4">
              {images.length
                ? images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`Превью ${i + 1}`}
                      className={`w-full border-[3px] border-line object-cover ${format === "portrait" ? "aspect-[4/5]" : "aspect-square"} ${rendering ? "opacity-60" : ""}`}
                    />
                  ))
                : !err
                  ? <PixelLoader label="РИСУЮ ПРЕВЬЮ" />
                  : null}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
