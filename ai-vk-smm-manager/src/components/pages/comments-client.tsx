"use client";

import {
  AlertTriangle,
  Ban,
  BookOpen,
  Check,
  HelpCircle,
  MessagesSquare,
  RefreshCw,
  Save,
  Smile,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommentRow } from "@/db/schema";
import { Badge, EmptyState, fmt, Panel, PixelLoader } from "@/components/ui";

const SENTIMENT_META: Record<
  string,
  { label: string; tone: string; icon: typeof Smile }
> = {
  positive: { label: "Позитив", tone: "neon", icon: Smile },
  question: { label: "Вопрос", tone: "cyan", icon: HelpCircle },
  negative: { label: "Негатив", tone: "red", icon: AlertTriangle },
  spam: { label: "Спам", tone: "ghost", icon: Ban },
  neutral: { label: "Нейтрально", tone: "ghost", icon: MessagesSquare },
};

export default function CommentsClient({
  initial,
  autoReply,
  autoModerate,
  faq,
  live,
}: {
  initial: CommentRow[];
  autoReply: boolean;
  autoModerate: boolean;
  faq: string;
  live: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [reply, setReply] = useState(autoReply);
  const [moderate, setModerate] = useState(autoModerate);
  const [faqText, setFaqText] = useState(faq);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function scan() {
    setBusy(true);
    try {
      const res = await fetch("/api/comments", { method: "POST" });
      const data = (await res.json()) as { comments: CommentRow[] };
      setRows(data.comments);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const cur = await (await fetch("/api/settings")).json();
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cur.settings,
          autoReply: reply,
          autoModerate: moderate,
          faq: faqText,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    all: rows.length,
    question: rows.filter((r) => r.sentiment === "question").length,
    negative: rows.filter((r) => r.sentiment === "negative").length,
    spam: rows.filter((r) => r.sentiment === "spam").length,
  };
  const visible = rows.filter((r) => filter === "all" || r.sentiment === filter);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* ===== Управление ===== */}
      <Panel title="Автоответы и модерация" icon={ShieldCheck} className="panel-bright">
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => setReply((v) => !v)}
            className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${reply ? "btn-neon" : "btn-ghost"}`}
            style={{ padding: "14px 16px" }}
          >
            <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
              <MessagesSquare size={13} /> {reply ? "▣" : "▢"} Автоответы на комментарии
            </span>
            <span className="text-left font-pixel text-sm opacity-90">
              Бот сам отвечает на вопросы и благодарности, извиняется за негатив.
            </span>
          </button>
          <button
            onClick={() => setModerate((v) => !v)}
            className={`btn flex-col !items-start gap-1.5 !normal-case !tracking-normal ${moderate ? "btn-cyan" : "btn-ghost"}`}
            style={{ padding: "14px 16px" }}
          >
            <span className="flex items-center gap-2 font-display text-[9px] uppercase tracking-widest">
              <Ban size={13} /> {moderate ? "▣" : "▢"} Автомодерация спама
            </span>
            <span className="text-left font-pixel text-sm opacity-90">
              Спам, реклама и мат удаляются автоматически, владелец получает алерт.
            </span>
          </button>
        </div>

        <label className="field-label mt-5 block">
          <BookOpen size={12} className="mr-1 inline" /> База знаний (FAQ) для ответов
        </label>
        <textarea
          value={faqText}
          onChange={(e) => setFaqText(e.target.value)}
          rows={5}
          placeholder={"Доставка: по России 3–5 дней, Москва/СПб 1–2 дня.\nОплата: карта, СБП, наличными при получении.\nВозврат: 14 дней без вопросов."}
          className="pixel-textarea"
        />
        <p className="mt-2 text-sm text-muted">
          Бот отвечает строго по этой базе и не выдумывает факты.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={saveSettings} disabled={busy} className="btn btn-neon">
            <Save size={14} /> Сохранить
          </button>
          <button onClick={scan} disabled={busy} className="btn btn-cyan">
            {busy ? <PixelLoader label="scan" /> : (<><RefreshCw size={13} /> Проверить комментарии</>)}
          </button>
          {saved ? <Badge tone="neon" led>Сохранено</Badge> : null}
          {!live ? <Badge tone="yellow">Нужен VK-токен и Group ID</Badge> : <Badge tone="neon" led>VK подключён</Badge>}
        </div>
      </Panel>

      {/* ===== Фильтры ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "Все" },
          { key: "question", label: "Вопросы" },
          { key: "negative", label: "Негатив" },
          { key: "spam", label: "Спам" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`btn btn-sm ${filter === f.key ? "btn-cyan" : "btn-ghost"}`}
          >
            {f.label}
            <span className="ml-1 border-2 border-black/30 bg-black/10 px-1.5 py-0.5 text-[9px]">
              {counts[f.key as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {/* ===== Список ===== */}
      {visible.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Комментариев пока нет"
          sub={
            live
              ? "Нажмите «Проверить комментарии» — бот заберёт их из группы, ответит и почистит спам."
              : "Укажите VK Access Token и Group ID в настройках, чтобы бот видел комментарии."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((c) => {
            const meta = SENTIMENT_META[c.sentiment] ?? SENTIMENT_META.neutral;
            const Icon = meta.icon;
            return (
              <article key={c.id} className="panel popin">
                <div className="panel-header">
                  <span className="dot" />
                  <Icon size={13} />
                  <span className="normal-case tracking-normal">{c.authorName}</span>
                  <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {c.status === "hidden" ? <Badge tone="ghost">Скрыт</Badge> : null}
                    {c.status === "alert" ? <Badge tone="red" led>Нужно внимание</Badge> : null}
                    {c.status === "replied" ? <Badge tone="neon">Отвечено</Badge> : null}
                  </span>
                </div>
                <div className="p-4">
                  <p className="whitespace-pre-wrap text-base leading-6 text-ink">{c.text}</p>
                  {c.reply ? (
                    <div className="mt-3 border-l-[6px] border-violet bg-[#f3f0ff] p-3">
                      <span className="mb-1 block font-display text-[8px] uppercase tracking-widest text-violet-deep">
                        Ответ бота
                      </span>
                      <p className="whitespace-pre-wrap text-base leading-6 text-ink">{c.reply}</p>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-sm text-muted">{fmt.dateTime(c.createdAt)}</span>
                    {c.status === "alert" ? (
                      <Link href="/chat" className="btn btn-sm btn-ghost ml-auto">
                        <Check size={12} /> Обсудить с ботом
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
