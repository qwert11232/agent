"use client";

import {
  CalendarClock,
  CornerDownRight,
  Globe,
  ImageIcon,
  Link2,
  Dices,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  MessageSquare,
  Repeat2,
  Send,
  Trash2,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Post } from "@/db/schema";
import { Badge, EmptyState, fmt, Panel, PixelLoader, StatusBadge } from "@/components/ui";

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "draft", label: "Черновики" },
  { key: "scheduled", label: "В очереди VK" },
  { key: "published", label: "Опубликованные" },
  { key: "failed", label: "Ошибки" },
] as const;

const TONE_LABEL: Record<string, string> = {
  friendly: "дружеский",
  business: "деловой",
  funny: "смешной",
};

function PostCard({
  post,
  onPublish,
  onDelete,
  onSchedule,
  busy,
}: {
  post: Post;
  onPublish: (id: number) => void;
  onDelete: (id: number) => void;
  onSchedule: (id: number, at: string) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planAt, setPlanAt] = useState("");
  const long = post.text.length > 320;
  let sourceList: { title: string; url: string }[] = [];
  try {
    if (post.sources) sourceList = JSON.parse(post.sources) as { title: string; url: string }[];
  } catch {
    sourceList = [];
  }

  return (
    <article className="panel flex flex-col popin">
      <div className="panel-header">
        <span className="dot" />
        <span>POST #{post.id}</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
          <StatusBadge status={post.status} />
          {post.source === "competitor" ? <Badge tone="violet">идея конкурента</Badge> : null}
        </span>
      </div>

      <div className="flex-1 p-4">
        {post.imageUrl ? (
          <span className="mb-3 block overflow-hidden border-[3px] border-line bg-panel2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt="Иллюстрация к посту"
              loading="lazy"
              className="h-48 w-full object-cover"
            />
          </span>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-lg leading-7 text-ink">
          {expanded || !long ? post.text : `${post.text.slice(0, 320)}…`}
        </p>
        {long ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 font-display text-[8px] uppercase tracking-widest text-cyan-deep hover:text-neon-dim"
          >
            {expanded ? "Свернуть ▲" : "Показать весь ▼"}
          </button>
        ) : null}

        {sourceList.length ? (
          <div className="mt-3 border-t-[3px] border-line pt-2">
            <span className="mb-1 block font-display text-[8px] uppercase tracking-widest text-muted">
              Источники
            </span>
            <ul className="flex flex-col gap-0.5">
              {sourceList.slice(0, 4).map((src, i) => (
                <li key={i} className="truncate text-sm">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-deep hover:underline"
                  >
                    <Link2 size={11} className="mr-1 inline" />
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {post.status === "published" ? (
          <div className="mt-3 grid grid-cols-4 gap-2 border-t-[3px] border-line pt-3 text-center">
            {[
              { icon: Heart, v: post.likes, c: "text-pink-deep" },
              { icon: MessageSquare, v: post.comments, c: "text-cyan-deep" },
              { icon: Eye, v: post.views, c: "text-yellow-deep" },
              { icon: Repeat2, v: post.reposts, c: "text-neon-dim" },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 border-r-2 border-line/40 last:border-0">
                <s.icon size={14} className={s.c} />
                <span className="font-display text-[10px] text-ink">
                {post.statsSyncedAt ? fmt.num(s.v) : "—"}
              </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {planOpen && post.status !== "published" ? (
        <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-line bg-[#f3f0ff] px-4 py-3">
          <CalendarClock size={15} className="text-violet-deep" />
          <input
            type="datetime-local"
            value={planAt}
            onChange={(e) => setPlanAt(e.target.value)}
            className="pixel-input !w-auto !py-2 !text-base"
          />
          <button
            onClick={() => {
              if (planAt) onSchedule(post.id, planAt);
              setPlanOpen(false);
            }}
            disabled={busy || !planAt}
            className="btn btn-sm btn-neon"
          >
            Запланировать
          </button>
          <span className="w-full text-sm text-muted">
            Время публикации в панели совпадёт со временем в ВК. С VK-токеном —
            пост уходит в отложенные ВКонтакте, публикует сам VK.
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-line bg-panel2 px-4 py-3">
        <span className="text-sm text-muted">
          {post.status === "scheduled" ? (
            <span className="flex items-center gap-1 text-violet-deep">
              выйдет {fmt.dateTime(post.scheduledAt)} · vk:{post.vkPostId}
            </span>
          ) : post.status === "published" ? (
            <span className="flex items-center gap-1">
              vk:{post.vkPostId} · {fmt.dateTime(post.publishedAt)}
              <ExternalLink size={11} className="text-linebright" />
            </span>
          ) : (
            <>создан {fmt.timeAgo(post.createdAt)}</>
          )}
        </span>
        <span className="ml-auto flex gap-2">
          {post.status !== "published" && post.status !== "scheduled" ? (
            <>
              <button onClick={() => onPublish(post.id)} disabled={busy} className="btn btn-sm btn-neon">
                <Send size={12} /> В эфир
              </button>
              <button
                onClick={() => setPlanOpen((v) => !v)}
                disabled={busy}
                className="btn btn-sm btn-violet"
                title="Запланировать на конкретное время"
              >
                <CalendarClock size={12} /> Позже
              </button>
            </>
          ) : null}
          <button
            onClick={() => {
              if (!confirmDel) {
                setConfirmDel(true);
                setTimeout(() => setConfirmDel(false), 3000);
              } else {
                onDelete(post.id);
              }
            }}
            disabled={busy}
            className={`btn btn-sm ${confirmDel ? "btn-red" : "btn-ghost"}`}
          >
            <Trash2 size={12} /> {confirmDel ? "Точно?" : "Удалить"}
          </button>
        </span>
      </div>
    </article>
  );
}

export default function PostsClient({
  initial,
  tone,
  groupId,
  defaultSearch,
  defaultImage,
  queueSize,
  vkLive,
}: {
  initial: Post[];
  tone: string;
  groupId: string;
  defaultSearch: boolean;
  defaultImage: boolean;
  queueSize: number;
  vkLive: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [genBusy, setGenBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [withSearch, setWithSearch] = useState(defaultSearch);
  const [withImage, setWithImage] = useState(defaultImage);
  const [queueBusy, setQueueBusy] = useState(false);

  const scheduled = posts
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => +new Date(a.scheduledAt ?? 0) - +new Date(b.scheduledAt ?? 0));

  async function fillQueue() {
    setQueueBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/queue", { method: "POST" });
      const d = (await res.json()) as { inVk: number; target: number; created: number; errors: string[] };
      setNotice(
        d.errors?.length
          ? d.errors.join("; ")
          : `В очереди ВКонтакте ${d.inVk} из ${d.target}${d.created ? `, добавлено ${d.created}` : ""}.`,
      );
      const fresh = (await (await fetch("/api/posts")).json()) as { posts: Post[] };
      setPosts(fresh.posts);
      router.refresh();
    } finally {
      setQueueBusy(false);
    }
  }

  async function generate(n = count) {
    setGenBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic || undefined, count: n, withSearch, withImage }),
      });
      const data = (await res.json()) as { post: Post; posts?: Post[] };
      const created = data.posts ?? [data.post];
      setPosts((p) => [...created.slice().reverse(), ...p]);
      setTopic("");
      setNotice(
        created.length > 1
          ? `Готово: создано ${created.length} черновиков — проверьте и публикуйте.`
          : `Черновик #${created[0].id} готов — проверьте и публикуйте.`,
      );
      router.refresh();
    } finally {
      setGenBusy(false);
    }
  }

  async function publish(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
      const data = (await res.json()) as { post?: Post; error?: string };
      if (data.post) {
        setPosts((p) => p.map((x) => (x.id === id ? data.post! : x)));
        setNotice(`Пост #${id} на стене группы! VK id: ${data.post.vkPostId}`);
      } else {
        setNotice(`Ошибка публикации: ${data.error ?? "unknown"}`);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function schedule(id: number, at: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/posts/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at }),
      });
      const data = (await res.json()) as { post?: Post; error?: string };
      if (data.post) {
        setPosts((p) => p.map((x) => (x.id === id ? data.post! : x)));
        setNotice(
          `Пост #${id} запланирован на ${fmt.dateTime(data.post.scheduledAt)} — время совпадёт в VK.`,
        );
      } else setNotice(`Не удалось: ${data.error ?? "ошибка"}`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      setPosts((p) => p.filter((x) => x.id !== id));
      setNotice(`Пост #${id} удалён.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    failed: posts.filter((p) => p.status === "failed").length,
  };
  const visible = posts.filter((p) => filter === "all" || p.status === filter);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ============ GENERATOR ============ */}
      <Panel title="Генератор постов" icon={Wand2} className="panel-bright">
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div className="flex-1">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void generate();
              }}
              placeholder="Тема поста (необязательно) — например: «новая фича продукта»"
              className="pixel-input"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-display text-[8px] uppercase tracking-widest text-muted">
                Сколько постов:
              </span>
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`btn btn-sm ${count === n ? "btn-violet" : "btn-ghost"}`}
                >
                  {n}
                </button>
              ))}
              <span className="text-sm text-muted">максимум 10 за раз</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setWithSearch((v) => !v)}
                className={`btn btn-sm ${withSearch ? "btn-cyan" : "btn-ghost"}`}
              >
                <Globe size={12} /> {withSearch ? "▣" : "▢"} Поиск в интернете
              </button>
              <button
                onClick={() => setWithImage((v) => !v)}
                className={`btn btn-sm ${withImage ? "btn-pink" : "btn-ghost"}`}
              >
                <ImageIcon size={12} /> {withImage ? "▣" : "▢"} Картинка
              </button>
            </div>
            <p className="mt-2 text-base text-muted">
              <CornerDownRight size={13} className="mr-1 inline text-neon-dim" />
              Промпт: «Ты SMM-менеджер группы ВК» + ваша инструкция + тон
              <span className="text-cyan-deep"> «{TONE_LABEL[tone] ?? tone}»</span> + пост
              150–250 слов с эмодзи и хештегами → статус
              <span className="text-cyan-deep"> draft</span>.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 md:w-64">
            <button onClick={() => void generate()} disabled={genBusy} className="btn btn-neon h-full min-h-12">
              {genBusy ? <PixelLoader label="Генерация" /> : (
                <>
                  <Wand2 size={15} /> Сгенерировать{count > 1 ? ` ×${count}` : ""}
                </>
              )}
            </button>
            <button onClick={() => void generate(1)} disabled={genBusy} className="btn btn-ghost" title="Сгенерировать ещё один вариант">
              <Dices size={14} /> Ещё вариант
            </button>
          </div>
        </div>
        {notice ? (
          <div className="mt-3 border-[3px] border-neon bg-[#e9fbf0] px-4 py-2.5 font-display text-[9px] uppercase tracking-wider text-neon-dim">
            ▶ {notice}
          </div>
        ) : null}
      </Panel>

      {/* ============ ОЧЕРЕДЬ VK ============ */}
      <Panel
        title="В очереди ВКонтакте (отложенные)"
        icon={CalendarClock}
        right={
          <span className="normal-case tracking-normal">
            <Badge tone={scheduled.length >= queueSize ? "neon" : scheduled.length ? "cyan" : "yellow"} led={scheduled.length > 0}>
              {scheduled.length} / {queueSize}
            </Badge>
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-base leading-6 text-muted">
            Эти посты уже лежат в ВК как отложенные — ВКонтакте опубликует их сам точно
            в указанное время, даже если сайт закрыт.
          </p>
          <button onClick={fillQueue} disabled={queueBusy || !vkLive} className="btn btn-sm btn-neon">
            {queueBusy ? <PixelLoader label="sync" /> : (<><CalendarClock size={12} /> Пополнить очередь</>)}
          </button>
        </div>
        {scheduled.length === 0 ? (
          <p className="text-base text-muted">
            {vkLive
              ? "Очередь пуста. Нажмите «Пополнить очередь» — бот напишет посты и поставит их в отложенные."
              : "Укажите VK Access Token и Group ID в настройках, чтобы бот ставил посты в отложенные."}
          </p>
        ) : (
          <ol className="flex flex-col">
            {scheduled.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3 border-b-2 border-line/50 py-2.5 last:border-0">
                <span className="font-display text-[9px] text-violet-deep">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-ink">
                    {p.text.replace(/\s+/g, " ").slice(0, 95)}
                  </span>
                  <span className="text-sm text-muted">vk id: {p.vkPostId ?? "—"} · #{p.id}</span>
                </span>
                <span className="shrink-0 font-display text-[9px] text-cyan-deep">
                  {fmt.dateTime(p.scheduledAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* ============ FILTERS ============ */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`btn btn-sm ${filter === f.key ? "btn-cyan" : "btn-ghost"}`}
          >
            {f.label}
            <span className="ml-1 border-2 border-black/40 bg-black/25 px-1.5 py-0.5 text-[9px]">
              {counts[f.key]}
            </span>
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-2 font-display text-[8px] uppercase tracking-widest text-muted md:flex">
          группа: {groupId || "demo"} · vk api wall.post
        </span>
      </div>

      {/* ============ LIST ============ */}
      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Здесь пока пусто"
          sub="Сгенерируйте первый пост — он появится как черновик. Затем: «В эфир» для публикации."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((p) => (
            <PostCard key={p.id} post={p} onPublish={publish} onDelete={remove} onSchedule={schedule} busy={busyId !== null} />
          ))}
        </div>
      )}
    </div>
  );
}
