"use client";

import {
  CornerDownRight,
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
  busy,
}: {
  post: Post;
  onPublish: (id: number) => void;
  onDelete: (id: number) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const long = post.text.length > 320;

  return (
    <article className="panel flex flex-col popin">
      <div className="panel-header">
        <span className="dot" />
        <span>POST #{post.id}</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
          <StatusBadge status={post.status} />
        </span>
      </div>

      <div className="flex-1 p-4">
        <p className="whitespace-pre-wrap break-words text-lg leading-7 text-ink">
          {expanded || !long ? post.text : `${post.text.slice(0, 320)}…`}
        </p>
        {long ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 font-display text-[8px] uppercase tracking-widest text-cyan hover:text-neon"
          >
            {expanded ? "Свернуть ▲" : "Показать весь ▼"}
          </button>
        ) : null}

        {post.status === "published" ? (
          <div className="mt-3 grid grid-cols-4 gap-2 border-t-[3px] border-line pt-3 text-center">
            {[
              { icon: Heart, v: post.likes, c: "text-pink" },
              { icon: MessageSquare, v: post.comments, c: "text-cyan" },
              { icon: Eye, v: post.views, c: "text-yellow" },
              { icon: Repeat2, v: post.reposts, c: "text-neon" },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 border-r-2 border-line/40 last:border-0">
                <s.icon size={14} className={s.c} />
                <span className="font-display text-[10px] text-ink">{fmt.num(s.v)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-line bg-panel2 px-4 py-3">
        <span className="text-sm text-muted">
          {post.status === "published" ? (
            <span className="flex items-center gap-1">
              vk:{post.vkPostId} · {fmt.dateTime(post.publishedAt)}
              <ExternalLink size={11} className="text-linebright" />
            </span>
          ) : (
            <>создан {fmt.timeAgo(post.createdAt)}</>
          )}
        </span>
        <span className="ml-auto flex gap-2">
          {post.status !== "published" ? (
            <button onClick={() => onPublish(post.id)} disabled={busy} className="btn btn-sm btn-neon">
              <Send size={12} /> В эфир
            </button>
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
}: {
  initial: Post[];
  tone: string;
  groupId: string;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [genBusy, setGenBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setGenBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic || undefined }),
      });
      const data = (await res.json()) as { post: Post };
      setPosts((p) => [data.post, ...p]);
      setTopic("");
      setNotice(`Черновик #${data.post.id} готов — проверьте и публикуйте.`);
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
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Тема поста (необязательно) — например: «новая фича продукта»"
              className="pixel-input"
            />
            <p className="mt-2 text-base text-muted">
              <CornerDownRight size={13} className="mr-1 inline text-neon" />
              Промпт: «Ты SMM-менеджер группы ВК» + ваша инструкция + тон
              <span className="text-cyan"> «{TONE_LABEL[tone] ?? tone}»</span> + пост
              150–250 слов с эмодзи и хештегами → статус
              <span className="text-cyan"> draft</span>.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 md:w-64">
            <button onClick={generate} disabled={genBusy} className="btn btn-neon h-full min-h-12">
              {genBusy ? <PixelLoader label="Генерация" /> : (
                <>
                  <Wand2 size={15} /> Сгенерировать
                </>
              )}
            </button>
            <button onClick={() => generate()} disabled={genBusy} className="btn btn-ghost" title="Сгенерировать ещё один вариант">
              <Dices size={14} /> Ещё вариант
            </button>
          </div>
        </div>
        {notice ? (
          <div className="mt-3 border-[3px] border-neon bg-[#0f2018] px-4 py-2.5 font-display text-[9px] uppercase tracking-wider text-neon">
            ▶ {notice}
          </div>
        ) : null}
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
            <PostCard key={p.id} post={p} onPublish={publish} onDelete={remove} busy={busyId !== null} />
          ))}
        </div>
      )}
    </div>
  );
}
