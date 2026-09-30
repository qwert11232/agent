"use client";

import {
  Crown,
  Heart,
  Plus,
  RefreshCw,
  Swords,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Competitor } from "@/db/schema";
import { Badge, EmptyState, fmt, Panel, PixelLoader } from "@/components/ui";

export default function CompetitorsClient({
  initial,
  live,
}: {
  initial: Competitor[];
  live: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrowing, setBorrowing] = useState<number | null>(null);

  async function add() {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: input.trim() }),
      });
      const data = (await res.json()) as { competitors?: Competitor[]; error?: string };
      if (data.error) setError(data.error);
      if (data.competitors) setRows(data.competitors);
      setInput("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/competitors", { method: "PUT" });
      const data = (await res.json()) as { competitors: Competitor[] };
      setRows(data.competitors);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { competitors: Competitor[] };
      setRows(data.competitors);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /** Умное заимствование: генерим свой пост по удачной теме конкурента. */
  async function borrow(c: Competitor) {
    setBorrowing(c.id);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: `Напиши уникальный пост для нашей аудитории на тему, которая хорошо зашла у похожего сообщества: «${c.topPostText.slice(0, 220)}». Не копируй текст — раскрой тему по-своему.`,
          withImage: true,
        }),
      });
      router.push("/posts");
    } finally {
      setBorrowing(null);
    }
  }

  const leader = rows[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Panel title="Мониторинг конкурентов" icon={Swords} className="panel-bright">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="ID или короткое имя сообщества: например durov или 1"
            className="pixel-input flex-1"
          />
          <button onClick={add} disabled={busy || rows.length >= 5} className="btn btn-neon">
            <Plus size={14} /> Добавить
          </button>
          <button onClick={refreshAll} disabled={busy || !rows.length} className="btn btn-cyan">
            {busy ? <PixelLoader label="scan" /> : (<><RefreshCw size={13} /> Обновить</>)}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          До 5 сообществ. Бот собирает их подписчиков, средние лайки, частоту постов
          и лучший пост недели через VK API.
        </p>
        {error ? (
          <p className="mt-2 font-display text-[9px] uppercase tracking-widest text-red-deep">
            {error}
          </p>
        ) : null}
        {!live ? (
          <div className="mt-3">
            <Badge tone="yellow">Нужен VK Access Token — без него данные не собираются</Badge>
          </div>
        ) : null}
      </Panel>

      {rows.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="Конкуренты не добавлены"
          sub="Добавьте 3–5 сообществ вашей ниши — бот покажет, что у них работает, и предложит идеи постов."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((c) => (
            <article key={c.id} className="panel popin flex flex-col">
              <div className="panel-header">
                <span className="dot" />
                <span className="truncate normal-case tracking-normal">{c.name || c.groupId}</span>
                {leader && c.id === leader.id ? (
                  <span className="ml-auto">
                    <Badge tone="yellow">
                      <Crown size={10} /> Лидер
                    </Badge>
                  </span>
                ) : null}
              </div>
              <div className="flex-1 p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border-r-2 border-line/50">
                    <Users size={14} className="mx-auto text-violet-deep" />
                    <span className="mt-1 block font-display text-[11px] text-ink">
                      {fmt.num(c.followers)}
                    </span>
                    <span className="text-sm text-muted">подписчиков</span>
                  </div>
                  <div className="border-r-2 border-line/50">
                    <Heart size={14} className="mx-auto text-pink-deep" />
                    <span className="mt-1 block font-display text-[11px] text-ink">
                      {fmt.num(c.avgLikes)}
                    </span>
                    <span className="text-sm text-muted">ср. лайков</span>
                  </div>
                  <div>
                    <Swords size={14} className="mx-auto text-cyan-deep" />
                    <span className="mt-1 block font-display text-[11px] text-ink">
                      {c.postsWeek}
                    </span>
                    <span className="text-sm text-muted">постов/нед</span>
                  </div>
                </div>

                {c.topPostText ? (
                  <div className="mt-4 border-[3px] border-line bg-panel2 p-3">
                    <span className="mb-1 block font-display text-[8px] uppercase tracking-widest text-muted">
                      Лучший пост · {fmt.num(c.topPostLikes)} лайков
                    </span>
                    <p className="line-clamp-4 whitespace-pre-wrap text-base leading-6 text-ink">
                      {c.topPostText}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-line bg-panel2 px-4 py-3">
                <span className="text-sm text-muted">
                  {c.lastCheckedAt ? `обновлено ${fmt.timeAgo(c.lastCheckedAt)}` : "ещё не проверялся"}
                </span>
                <span className="ml-auto flex gap-2">
                  {c.topPostText ? (
                    <button
                      onClick={() => borrow(c)}
                      disabled={borrowing !== null}
                      className="btn btn-sm btn-violet"
                      title="Сгенерировать свой пост на эту тему"
                    >
                      <Wand2 size={12} /> Своя версия
                    </button>
                  ) : null}
                  <button onClick={() => remove(c.id)} disabled={busy} className="btn btn-sm btn-ghost">
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
