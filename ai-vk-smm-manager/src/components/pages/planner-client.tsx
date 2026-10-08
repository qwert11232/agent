"use client";

import { CalendarClock, Check, Power, Rocket, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Panel, PixelLoader, StatusBadge } from "@/components/ui";
import type { Post } from "@/db/schema";

type SettingsShape = {
  active: boolean;
  scheduleTimes: string;
  queueSize: number;
  autoQueue: boolean;
  queueTypes: string;
  publishDays: string;
  vkToken: string;
  groupId: string;
};

function fmtTime(iso: string | Date | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function TypeBadge({ post }: { post: Post }) {
  if (post.kind === "carousel") return <Badge tone="pink">карусель</Badge>;
  if (post.kind === "digest") return <Badge tone="yellow">дайджест</Badge>;
  if (post.size === "long") return <Badge tone="cyan">лонгрид</Badge>;
  if (post.size === "short") return <Badge tone="violet">короткий</Badge>;
  return null;
}

export default function PlannerClient() {
  const [s, setS] = useState<SettingsShape | null>(null);
  const [scheduled, setScheduled] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<Post[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [at, setAt] = useState("");
  const [times, setTimes] = useState<string[]>(["12:30", "18:30"]);
  const [perDay, setPerDay] = useState(1);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [queueSize, setQueueSize] = useState(7);
  const [autoQueue, setAutoQueue] = useState(true);
  const [types, setTypes] = useState<string[]>(["short", "long", "carousel"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sr, qr, pr] = await Promise.all([fetch("/api/settings"), fetch("/api/queue"), fetch("/api/posts")]);
    const st = ((await sr.json()) as { settings: SettingsShape }).settings;
    const sch = ((await qr.json()) as { scheduled: Post[] }).scheduled;
    const all = ((await pr.json()) as { posts: Post[] }).posts;
    setS(st);
    setScheduled(sch);
    const dr = all.filter((p) => p.status === "draft");
    setDrafts(dr);
    setDraftId((cur) => cur ?? dr[0]?.id ?? null);
    const slots = st.scheduleTimes.split(",").map((t) => t.trim()).filter(Boolean);
    setPerDay(Math.min(2, Math.max(1, slots.length || 1)));
    setTimes([slots[0] ?? "12:30", slots[1] ?? "18:30"]);
    setDays(
      (st.publishDays || "1,2,3,4,5").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    );
    setQueueSize(st.queueSize || 7);
    setAutoQueue(st.autoQueue);
    setTypes(st.queueTypes.split(",").map((t) => t.trim()).filter(Boolean));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  }

  async function save() {
    setBusy("save");
    try {
      const chosen = times.slice(0, perDay);
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleTimes: chosen.join(","),
          queueSize,
          autoQueue,
          queueTypes: types.join(","),
          publishDays: days.join(","),
          postMode: "schedule",
        }),
      });
      flash("Расписание сохранено ✓ Бот будет регать посты в выбранные слоты автоматически.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutopilot() {
    setBusy("power");
    try {
      await fetch("/api/toggle", { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function fillQueue() {
    setBusy("fill");
    try {
      const res = await fetch("/api/queue", { method: "POST" });
      const d = (await res.json()) as { inVk: number; target: number; created: number; errors: string[] };
      flash(d.errors?.length ? d.errors.join("; ") : `Очередь пополнена: ${d.inVk} из ${d.target}${d.created ? `, добавлено ${d.created}` : ""}.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function plan(mode: "next" | "custom" | Date) {
    if (!draftId) return;
    setBusy("plan");
    try {
      const body = mode === "next" ? { next: true } : mode === "custom" ? { at: new Date(at).toISOString() } : { at: mode.toISOString() };
      const res = await fetch(`/api/posts/${draftId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { post?: Post; error?: string };
      if (d.error) flash(d.error);
      else flash(`Черновик #${draftId} запланирован на ${fmtTime(d.post?.scheduledAt ?? null)}.`);
      await load();
    } finally {
      setBusy(null);
      setAt("");
    }
  }

  function tomorrowAt(h: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d;
  }

  function toggleType(t: string) {
    setTypes((cur) => {
      if (cur.includes(t)) return cur.length > 1 ? cur.filter((x) => x !== t) : cur;
      return [...cur, t];
    });
  }

  if (!s) return <PixelLoader />;

  const vkLive = Boolean(s.vkToken && s.groupId);

  return (
    <div className="flex flex-col gap-5">
      {/* ========== АВТОПИЛОТ ========== */}
      <Panel
        title="Автопилот"
        icon={Power}
        className="panel-bright"
        right={
          <span className="normal-case tracking-normal">
            <Badge tone={s.active ? "neon" : "yellow"} led={s.active}>{s.active ? "включён" : "выключен"}</Badge>
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className={`pxtoggle scale-125 ${busy === "power" ? "opacity-50" : ""}`} data-on={s.active} onClick={toggleAutopilot} role="switch" aria-checked={s.active} />
          <p className="min-w-0 flex-1 text-base leading-6 text-muted">
            Бот сам ставит посты в отложенные ВКонтакте выбранных типов и точно в слоты. Ниже — всё расписание одним экраном:
            без ручного ввода полустанка и «окон догона».
          </p>
        </div>
      </Panel>

      {/* ========== РАСПИСАНИЕ ========== */}
      <Panel title="Расписание публикаций" icon={CalendarClock}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="field-label">Сколько раз в день публиковать</label>
            <div className="flex gap-2">
              {[1, 2].map((n) => (
                <button key={n} className={`btn ${perDay === n ? "btn-neon" : "btn-ghost"}`} onClick={() => setPerDay(n)}>
                  {n} {n === 1 ? "раз" : "раза"}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              {Array.from({ length: perDay }).map((_, i) => (
                <div key={i}>
                  <label className="field-label">{i === 0 ? "Первый слот" : "Второй слот"}</label>
                  <input
                    type="time"
                    className="pixel-input !w-32"
                    value={times[i] ?? "12:30"}
                    onChange={(e) => setTimes((t) => t.map((x, k) => (k === i ? e.target.value : x)))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Дни публикаций (для B2B выходные слабее: оставьте один лёгкий пост или паузу)</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    className={`btn btn-sm ${on ? "btn-neon" : "btn-ghost"}`}
                    onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
                  >
                    {on ? "▣" : "▢"} {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">
              Формат и рубрика каждого слота определяются днём публикации: пн - миф/позиция, вт - карусель-чек-лист, ср - лонгрид-разбор,
              чт - возражение или процесс, пт - оффер или сравнение, сб/вс - лёгкое вовлечение.
            </p>
          </div>
          <div>
            <label className="field-label">Запас отложенных постов в ВК: {queueSize}</label>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 7, 10].map((n) => (
                <button key={n} className={`btn btn-sm ${queueSize === n ? "btn-violet" : "btn-ghost"}`} onClick={() => setQueueSize(n)}>
                  {n}
                </button>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-3 text-base">
              <span className="pxtoggle shrink-0" data-on={autoQueue} onClick={() => setAutoQueue((v) => !v)} role="switch" aria-checked={autoQueue} />
              Поддерживать запас автоматически
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Какие типы разрешены в очереди (если формат слота по плану недели выключен, берётся один из разрешённых)</label>
            <div className="flex flex-wrap gap-2">
              <button className={`btn ${types.includes("short") ? "btn-violet" : "btn-ghost"}`} onClick={() => toggleType("short")}>
                <Zap size={14} /> {types.includes("short") ? "▣" : "▢"} Короткие посты
              </button>
              <button className={`btn ${types.includes("long") ? "btn-cyan" : "btn-ghost"}`} onClick={() => toggleType("long")}>
                <CalendarClock size={14} /> {types.includes("long") ? "▣" : "▢"} Большие посты (лонгрид)
              </button>
              <button className={`btn ${types.includes("carousel") ? "btn-pink" : "btn-ghost"}`} onClick={() => toggleType("carousel")}>
                <Rocket size={14} /> {types.includes("carousel") ? "▣" : "▢"} Карусели с фото
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Картинки для каруселей ищутся в бесплатных стоках (Pexels/Openverse) сами, оформление — из «Дизайн по умолчанию».
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-neon" disabled={!!busy} onClick={save}>
            <Check size={14} /> {busy === "save" ? "Сохраняю…" : "Применить расписание"}
          </button>
          {!vkLive ? <span className="text-base text-muted">Чтобы очередь уходила в ВК, укажите VK Token и Group ID в настройках.</span> : null}
        </div>
      </Panel>

      {/* ========== ОЧЕРЕДЬ ========== */}
      <Panel
        title="Очередь публикаций"
        icon={CalendarClock}
        right={
          <span className="normal-case tracking-normal">
            <button className="btn btn-sm btn-neon" disabled={!!busy} onClick={fillQueue}>
              {busy === "fill" ? "…" : <><Rocket size={12} /> Пополнить</>}
            </button>
          </span>
        }
      >
        {scheduled.length === 0 ? (
          <p className="text-base text-muted">Очередь пуста. Примените расписание и нажмите «Пополнить» — бот сам напишет посты выбранных типов.</p>
        ) : (
          <ol className="flex flex-col">
            {scheduled.slice(0, 10).map((p, i) => (
              <li key={p.id} className="flex items-start gap-3 border-b-2 border-line/50 py-2.5 last:border-0">
                <span className="font-display text-[9px] text-violet-deep">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <TypeBadge post={p} />
                    <StatusBadge status={p.status} />
                  </span>
                  <span className="block truncate text-base text-ink">{p.text.replace(/\s+/g, " ").slice(0, 90)}</span>
                </span>
                <span className="shrink-0 font-display text-[9px] text-cyan-deep">{fmtTime(p.scheduledAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* ========== РУЧНОЕ ПЛАНИРОВАНИЕ ========== */}
      <Panel title="Запланировать черновик вручную" icon={CalendarClock}>
        {drafts.length === 0 ? (
          <p className="text-base text-muted">Свободных черновиков нет — создайте их на вкладке «Посты» или «Карусели».</p>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className="field-label">Черновик</label>
              <select className="pixel-select" value={draftId ?? ""} onChange={(e) => setDraftId(Number(e.target.value) || null)}>
                {drafts.slice(0, 30).map((d) => (
                  <option key={d.id} value={d.id}>
                    #{d.id} · {d.kind === "carousel" ? "карусель" : d.size === "long" ? "лонгрид" : "текст"} · {d.text.replace(/\s+/g, " ").slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-cyan" disabled={!!busy || !draftId} onClick={() => plan("next")}>
                <Rocket size={13} /> В ближайший слот
              </button>
              <button className="btn btn-violet" disabled={!!busy || !draftId} onClick={() => plan(tomorrowAt(12))}>
                Завтра в 12:00
              </button>
              <button className="btn btn-violet" disabled={!!busy || !draftId} onClick={() => plan(tomorrowAt(19))}>
                Завтра в 19:00
              </button>
              <input type="datetime-local" className="pixel-input !w-auto !py-2" value={at} onChange={(e) => setAt(e.target.value)} />
              <button className="btn btn-ghost" disabled={!!busy || !draftId || !at} onClick={() => plan("custom")}>
                В точное время
              </button>
            </div>
          </div>
        )}
        {msg ? <p className="mt-3 text-base text-cyan-deep">{msg}</p> : null}
      </Panel>
    </div>
  );
}
