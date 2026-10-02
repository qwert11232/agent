"use client";

import {
  Crown,
  Flame,
  Lightbulb,
  Radar,
  RefreshCw,
  Sparkles,
  Swords,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Competitor } from "@/db/schema";
import { Badge, EmptyState, fmt, Panel, PixelLoader } from "@/components/ui";

type Topic = {
  title: string;
  why: string;
  angle: string;
  source: string;
  heat: number;
};

export default function TrendsClient({
  rivals,
  live,
}: {
  rivals: Competitor[];
  live: boolean;
}) {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);

  async function load(deep = false) {
    deep ? setScanning(true) : setLoading(true);
    try {
      const res = await fetch("/api/trends", { method: deep ? "POST" : "GET" });
      const d = (await res.json()) as { topics: Topic[]; summary: string };
      setTopics(d.topics ?? []);
      setSummary(d.summary ?? "");
      if (deep) router.refresh();
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Написать пост по найденной теме. */
  async function write(t: Topic) {
    setWriting(t.title);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: `${t.title}. Угол подачи: ${t.angle}` }),
      });
      router.push("/posts");
    } finally {
      setWriting(null);
    }
  }

  const leader = [...rivals].sort((a, b) => b.avgLikes - a.avgLikes)[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm uppercase tracking-widest text-ink">
          <Radar size={16} className="mr-2 inline text-violet-deep" />
          Тренды и разведка
        </h2>
        <Badge tone={live ? "neon" : "yellow"} led={live}>
          {live ? "Мониторинг активен" : "нужен VK-токен"}
        </Badge>
        <button onClick={() => load(true)} disabled={scanning} className="btn btn-sm btn-cyan ml-auto">
          {scanning ? <PixelLoader label="скан" /> : (<><RefreshCw size={13} /> Полный скан</>)}
        </button>
      </div>

      <Panel title="Что писать прямо сейчас" icon={Lightbulb} className="panel-bright">
        {loading ? (
          <div className="py-8 text-center"><PixelLoader label="анализирую" /></div>
        ) : topics.length === 0 ? (
          <EmptyState icon={Sparkles} title="Тем пока нет" sub="Нажмите «Полный скан» — бот изучит конкурентов, ваши посты и свежие источники." />
        ) : (
          <ul className="flex flex-col gap-3">
            {topics.map((t, i) => (
              <li key={i} className="border-[3px] border-line bg-panel2 p-4 popin">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-display text-[10px] uppercase tracking-wider text-ink">
                    {t.title}
                  </span>
                  <span className="ml-auto flex items-center gap-1" title={`Актуальность ${t.heat}/5`}>
                    {Array.from({ length: 5 }).map((_, k) => (
                      <span
                        key={k}
                        className={`inline-block h-2.5 w-2.5 ${k < t.heat ? "bg-[#e0479e]" : "bg-panel3"}`}
                      />
                    ))}
                  </span>
                </div>
                <p className="text-base leading-6 text-ink">{t.why}</p>
                <p className="mt-1 text-base leading-6 text-muted">Как подать: {t.angle}</p>
                <button
                  onClick={() => write(t)}
                  disabled={writing !== null}
                  className="btn btn-sm btn-neon mt-3"
                >
                  <Wand2 size={12} /> {writing === t.title ? "Пишу…" : "Написать пост"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {summary ? <p className="mt-3 text-sm text-muted">{summary}</p> : null}
      </Panel>

      <Panel
        title="Разведка по конкурентам"
        icon={Swords}
        right={
          <Link href="/competitors" className="font-display text-[8px] uppercase tracking-widest text-neon-dim hover:text-ink">
            Список →
          </Link>
        }
      >
        {rivals.length === 0 ? (
          <EmptyState icon={Swords} title="Конкуренты не добавлены" sub="Добавьте 3–5 сообществ — бот будет ежедневно разбирать их контент и подсказывать идеи." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rivals.map((c) => (
              <div key={c.id} className="border-[3px] border-line bg-panel2 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="truncate font-display text-[9px] uppercase text-ink">
                    {c.name || c.groupId}
                  </span>
                  {leader && c.id === leader.id ? (
                    <Badge tone="yellow"><Crown size={10} /> лидер</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3 text-base text-muted">
                  <span>{fmt.num(c.followers)} подписчиков</span>
                  <span className="text-pink-deep">{fmt.num(c.avgLikes)} ср. лайков</span>
                  <span className="text-cyan-deep">{c.postsWeek} постов/нед</span>
                </div>
                {c.topPostText ? (
                  <p className="mt-2 line-clamp-3 text-base leading-6 text-ink">
                    <Flame size={12} className="mr-1 inline text-pink-deep" />
                    {c.topPostText}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted">
                  {c.lastCheckedAt ? `проверен ${fmt.timeAgo(c.lastCheckedAt)}` : "ещё не сканировался"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
