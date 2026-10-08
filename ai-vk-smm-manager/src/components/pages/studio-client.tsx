"use client";

import { CalendarClock, Layers, Newspaper, Palette, Rocket, Send, Sparkles, Trash2, Wand2, GalleryHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, EmptyState, fmt, Panel, PixelLoader, StatusBadge } from "@/components/ui";
import { DesignPicker } from "@/components/pages/design-client";
import BuilderClient from "@/components/pages/builder-client";

type StudioPost = {
  id: number;
  text: string;
  status: string;
  kind: string;
  createdAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  slideIds: number[];
};

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="pxtoggle shrink-0" data-on={on} onClick={() => onChange(!on)} role="switch" aria-checked={on} />
      <div className="min-w-0 text-base leading-5">
        <span className="text-ink">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}

function PostCard({ post, onChanged }: { post: StudioPost; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [at, setAt] = useState("");
  const [style, setStyle] = useState("default");

  async function call(label: string, url: string, init?: RequestInit) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) setMsg(data.error ?? "Ошибка");
      else setMsg(label === "publish" ? "Опубликовано в ВКонтакте" : label === "schedule" ? "Поставлено в отложенные" : "Готово");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={post.kind === "digest" ? "yellow" : "pink"}>{post.kind === "digest" ? "Дайджест" : "Карусель"}</Badge>
        <StatusBadge status={post.status} />
        <span className="text-sm text-muted">#{post.id} · {fmt.dateTime(post.createdAt)}</span>
      </div>
      {post.slideIds.length ? (
        <div className="mb-3 flex gap-3 overflow-x-auto pb-2">
          {post.slideIds.map((sid, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={sid}
              src={`/api/post-images/${sid}`}
              alt={`Слайд ${i + 1}`}
              className="h-56 w-56 shrink-0 border-[3px] border-line object-cover"
            />
          ))}
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap break-words font-sans text-base leading-6 text-ink">{post.text}</pre>
      {post.status !== "published" && post.slideIds.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="min-w-52">
            <DesignPicker value={style} onChange={setStyle} />
          </div>
          <button
            className="btn btn-cyan btn-sm"
            disabled={!!busy}
            onClick={() =>
              call("restyle", "/api/carousel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "restyle", postId: post.id, theme: style }),
              })
            }
          >
            <Palette size={13} /> {busy === "restyle" ? "Рисую…" : "Сменить дизайн"}
          </button>
        </div>
      ) : null}
      {post.status !== "published" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-neon btn-sm" disabled={!!busy} onClick={() => call("publish", `/api/posts/${post.id}/publish`, { method: "POST" })}>
            <Send size={13} /> {busy === "publish" ? "Публикую…" : "Опубликовать сейчас"}
          </button>
          <input type="datetime-local" className="pixel-input !w-auto !py-2 !text-base" value={at} onChange={(e) => setAt(e.target.value)} />
          <button
            className="btn btn-violet btn-sm"
            disabled={!!busy || !at}
            onClick={() =>
              call("schedule", `/api/posts/${post.id}/schedule`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ at: new Date(at).toISOString() }),
              })
            }
          >
            <CalendarClock size={13} /> Отложить
          </button>
          <button className="btn btn-red btn-sm" disabled={!!busy} onClick={() => call("delete", `/api/posts/${post.id}`, { method: "DELETE" })}>
            <Trash2 size={13} />
          </button>
        </div>
      ) : null}
      {msg ? <p className="mt-3 text-base text-cyan-deep">{msg}</p> : null}
    </div>
  );
}

/* ====================== ДАЙДЖЕСТ ====================== */

type DigestSettings = {
  digestEnabled: boolean;
  digestTime: string;
  digestDays: string;
  digestCarousel: boolean;
  digestPhotos: boolean;
  digestNiche: string;
  active: boolean;
};

type NewsPreview = { id: string; title: string; url: string; source: string; snippet: string }[];

export function DigestClient() {
  const [cfg, setCfg] = useState<DigestSettings | null>(null);
  const [digests, setDigests] = useState<StudioPost[]>([]);
  const [theme, setTheme] = useState("default");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [news, setNews] = useState<NewsPreview | null>(null);
  const [newsBusy, setNewsBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/digest");
    const d = (await r.json()) as { settings: DigestSettings; digests: StudioPost[] };
    setCfg(d.settings);
    setDigests(d.digests);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveCfg() {
    if (!cfg) return;
    await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", ...cfg }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function generate() {
    if (!cfg) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carousel: cfg.digestCarousel, photos: cfg.digestPhotos, theme }),
      });
      const d = (await r.json()) as { error?: string };
      if (d.error) setErr(d.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function showNews() {
    setNewsBusy(true);
    try {
      const r = await fetch("/api/digest?news=1");
      const d = (await r.json()) as { items: NewsPreview };
      setNews(d.items);
    } finally {
      setNewsBusy(false);
    }
  }

  if (!cfg) return <PixelLoader />;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Дайджест ниши" icon={Newspaper} className="panel-bright">
        <p className="mb-4 text-base leading-6 text-muted">
          Бот собирает свежие материалы (Hacker News, dev.to, Habr и русскоязычные бизнес-ленты), выбирает одну главную новость для
          владельца бизнеса и пару коротких, и пишет пост с позицией: что это меняет и что сделать. Первая строка - вывод дня, а не дата.
          Факты и числа берутся только из найденных статей. Если число не из материалов, выпуск остаётся черновиком до проверки.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Toggle on={cfg.digestEnabled} onChange={(v) => setCfg({ ...cfg, digestEnabled: v })} label="Публиковать дайджест по выбранным дням" hint={cfg.active ? "Автопилот включён — всё сработает само" : "Включите автопилот на Дашборде, иначе тик не запустится"} />
          <div>
            <label className="field-label">Время выхода</label>
            <input type="time" className="pixel-input" value={cfg.digestTime} onChange={(e) => setCfg({ ...cfg, digestTime: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Дни выхода (рекомендуем пн, ср, пт: так нет «баннерной слепоты»)</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const cur = (cfg.digestDays || "1,3,5").split(",").map(Number);
                const on = cur.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`btn btn-sm ${on ? "btn-neon" : "btn-ghost"}`}
                    onClick={() => setCfg({ ...cfg, digestDays: (on ? cur.filter((x) => x !== d) : [...cur, d]).join(",") })}
                  >
                    {on ? "▣" : "▢"} {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d]}
                  </button>
                );
              })}
            </div>
          </div>
          <Toggle on={cfg.digestCarousel} onChange={(v) => setCfg({ ...cfg, digestCarousel: v })} label="Карусель из слайдов" hint="Обложка + главная новость + остальные + «что бы я сделал»" />
          <Toggle on={cfg.digestPhotos} onChange={(v) => setCfg({ ...cfg, digestPhotos: v })} label="Фото-фон на обложке" hint="Pexels (если есть ключ) или Openverse, public domain" />
          <div className="md:col-span-2">
            <label className="field-label">Ниша (по каким темам отбирать)</label>
            <input className="pixel-input" value={cfg.digestNiche} onChange={(e) => setCfg({ ...cfg, digestNiche: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-cyan" onClick={saveCfg}>{saved ? "Сохранено ✓" : "Сохранить"}</button>
          <div className="min-w-56">
            <DesignPicker value={theme} onChange={setTheme} />
          </div>
          <button className="btn btn-neon" disabled={busy} onClick={generate}>
            <Wand2 size={14} /> {busy ? "Собираю…" : "Собрать дайджест сейчас"}
          </button>
          <button className="btn btn-ghost" disabled={newsBusy} onClick={showNews}>
            {newsBusy ? "Ищу…" : "Показать найденные новости"}
          </button>
        </div>
        {busy ? <div className="mt-3"><PixelLoader label="ЧИТАЮ НОВОСТИ, ПИШУ ТЕКСТ, РИСУЮ СЛАЙДЫ" /></div> : null}
        {err ? <p className="mt-3 text-base text-red-deep">{err}</p> : null}
      </Panel>

      {news ? (
        <Panel title="Кандидаты на сегодня" icon={Sparkles}>
          <ul className="flex flex-col gap-3">
            {news.map((n) => (
              <li key={n.id} className="text-base leading-6">
                <Badge tone="cyan">{n.source}</Badge>{" "}
                <a href={n.url} target="_blank" rel="noreferrer" className="text-ink underline">{n.title}</a>
                {n.snippet ? <span className="block text-sm text-muted">{n.snippet}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-4">
        {digests.length === 0 ? (
          <EmptyState icon={Newspaper} title="Дайджестов пока нет" sub="Нажмите «Собрать дайджест сейчас» — бот сделает первый." />
        ) : (
          digests.map((p) => <PostCard key={p.id} post={p} onChanged={load} />)
        )}
      </div>
    </div>
  );
}

/* ====================== КАРУСЕЛИ ====================== */

export function CarouselClient() {
  const [mode, setMode] = useState<"ai" | "builder">("ai");
  const [items, setItems] = useState<StudioPost[]>([]);
  const [topic, setTopic] = useState("");
  const [slides, setSlides] = useState(6);
  const [theme, setTheme] = useState("default");
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/carousel");
    const d = (await r.json()) as { items: StudioPost[] };
    setItems(d.items);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, slides, theme, photos }),
      });
      const d = (await r.json()) as { error?: string };
      if (d.error) setErr(d.error);
      else setTopic("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <button className={`btn btn-sm ${mode === "ai" ? "btn-neon" : "btn-ghost"}`} onClick={() => setMode("ai")}>
          <Wand2 size={13} /> AI из темы
        </button>
        <button className={`btn btn-sm ${mode === "builder" ? "btn-neon" : "btn-ghost"}`} onClick={() => setMode("builder")}>
          <Layers size={13} /> Конструктор из шаблонов
        </button>
      </div>
      {mode === "builder" ? (
        <BuilderClient onDone={load} />
      ) : (
      <Panel title="Новая карусель" icon={GalleryHorizontal} className="panel-bright">
        <p className="mb-4 text-base leading-6 text-muted">
          Слайды рисуются самим приложением (бесплатно, без внешних сервисов): чёткий русский текст, настраиваемый дизайн
          (цвета, шрифты, макет, логотип и подпись бренда), нумерация и прогресс-полоска. В ВКонтакте уходят как один пост с несколькими фото (до 10) — листаются свайпом.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="field-label">Тема карусели</label>
            <input className="pixel-input" placeholder="Например: 5 ошибок лендинга, которые сливают рекламный бюджет" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Содержательных слайдов: {slides}</label>
            <input type="range" min={3} max={8} value={slides} onChange={(e) => setSlides(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="field-label">Дизайн слайдов</label>
            <DesignPicker value={theme} onChange={setTheme} />
            <a href="/design" className="mt-1 inline-flex items-center gap-1 text-sm text-cyan-deep underline">
              <Palette size={12} /> Настроить дизайн
            </a>
          </div>
          <Toggle on={photos} onChange={setPhotos} label="Фото-фон на обложке и финале" hint="Pexels (если задан ключ) или Openverse (public domain)" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn btn-neon" disabled={busy || !topic.trim()} onClick={generate}>
            <Rocket size={14} /> {busy ? "Рисую…" : "Создать карусель"}
          </button>
          {busy ? <PixelLoader label="ПИШУ СЛАЙДЫ И РИСУЮ" /> : null}
        </div>
        {err ? <p className="mt-3 text-base text-red-deep">{err}</p> : null}
      </Panel>
      )}



      <div className="flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState icon={GalleryHorizontal} title="Каруселей пока нет" sub="Введите тему и нажмите «Создать карусель»." />
        ) : (
          items.map((p) => <PostCard key={p.id} post={p} onChanged={load} />)
        )}
      </div>
    </div>
  );
}
