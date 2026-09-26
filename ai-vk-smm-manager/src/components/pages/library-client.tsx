"use client";

import {
  Check,
  ImagePlus,
  Images,
  Pencil,
  Repeat2,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { MediaLite } from "@/lib/media";
import { Badge, EmptyState, fmt, Panel, PixelLoader } from "@/components/ui";

export default function LibraryClient({
  initial,
  imageSource,
}: {
  initial: MediaLite[];
  imageSource: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [genId, setGenId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("file", f));
      form.append("caption", caption);
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = (await res.json()) as {
        media?: MediaLite[];
        saved?: number;
        error?: string;
      };
      if (data.error) setNotice(data.error);
      if (data.media) setItems(data.media);
      if (data.saved) setNotice(`Загружено фото: ${data.saved}. Микро-ТЗ применено.`);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption(id: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, caption: editText }),
      });
      const data = (await res.json()) as { media: MediaLite[] };
      setItems(data.media);
      setEditId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { media: MediaLite[] };
      setItems(data.media);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /** Сгенерировать пост под конкретное фото прямо сейчас. */
  async function makePost(id: number) {
    setGenId(id);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageSource: "library", mediaId: id, withImage: true }),
      });
      router.push("/posts");
    } finally {
      setGenId(null);
    }
  }

  const unused = items.filter((i) => i.usedCount === 0).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ===== Загрузка ===== */}
      <Panel title="Библиотека фото" icon={Images} className="panel-bright">
        <label className="field-label">
          Микро-ТЗ для загружаемых фото (о чём написать текст)
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder="Например: «Новая коллекция курток, акцент на водоотталкивающую ткань, цена от 4990 ₽, призыв заказать до конца недели»"
          className="pixel-textarea"
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
          className="mt-4 flex flex-col items-center gap-3 border-[3px] border-dashed border-linebright bg-panel2 px-6 py-8 text-center"
        >
          <ImagePlus size={30} className="text-violet-deep" />
          <p className="font-display text-[10px] uppercase tracking-widest text-muted">
            Перетащите фото сюда
          </p>
          <p className="text-base text-muted">
            или выберите файлы — можно сразу несколько (до 6 МБ каждое)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => void upload(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn btn-neon"
          >
            {busy ? <PixelLoader label="upload" /> : (<><Upload size={14} /> Выбрать фото</>)}
          </button>
        </div>

        {notice ? (
          <div className="mt-3 border-[3px] border-neon bg-[#e9fbf0] px-4 py-2.5 font-display text-[9px] uppercase tracking-wider text-neon-dim">
            ▶ {notice}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="violet">Всего фото: {items.length}</Badge>
          <Badge tone={unused ? "neon" : "ghost"}>Не использовано: {unused}</Badge>
          <Badge tone={imageSource === "library" ? "neon" : "yellow"}>
            {imageSource === "library"
              ? "Автопостинг берёт фото отсюда"
              : "Включите «Фото из библиотеки» в настройках"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          Бот берёт фото по кругу: сначала новые, потом самые давние. Текст пишется
          строго по микро-ТЗ, а само фото остаётся вашим — оно прикрепляется к посту в VK.
        </p>
      </Panel>

      {/* ===== Сетка ===== */}
      {items.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Библиотека пуста"
          sub="Загрузите фото товаров или услуг и добавьте к ним микро-ТЗ — бот сам соберёт из них посты."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <article key={m.id} className="panel popin flex flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${m.id}/raw`}
                alt={m.filename}
                loading="lazy"
                className="h-48 w-full border-b-[3px] border-line object-cover"
              />
              <div className="flex-1 p-3">
                {editId === m.id ? (
                  <>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="pixel-textarea !text-base"
                      placeholder="Микро-ТЗ: о чём написать текст к этому фото"
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => saveCaption(m.id)} disabled={busy} className="btn btn-sm btn-neon">
                        <Check size={12} /> Сохранить
                      </button>
                      <button onClick={() => setEditId(null)} className="btn btn-sm btn-ghost">
                        Отмена
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="min-h-[3rem] text-base leading-6 text-ink">
                      {m.caption || (
                        <span className="text-muted">
                          Микро-ТЗ не задано — бот напишет текст по общей инструкции.
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <Repeat2 size={12} />
                      использовано {m.usedCount}×
                      {m.lastUsedAt ? ` · ${fmt.timeAgo(m.lastUsedAt)}` : ""}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 border-t-[3px] border-line bg-panel2 px-3 py-2.5">
                <button
                  onClick={() => makePost(m.id)}
                  disabled={genId !== null}
                  className="btn btn-sm btn-neon"
                >
                  <Wand2 size={12} /> {genId === m.id ? "Пишу…" : "Сделать пост"}
                </button>
                <button
                  onClick={() => {
                    setEditId(m.id);
                    setEditText(m.caption);
                  }}
                  className="btn btn-sm btn-ghost"
                >
                  <Pencil size={12} />
                </button>
                <button onClick={() => remove(m.id)} disabled={busy} className="btn btn-sm btn-ghost ml-auto">
                  <Trash2 size={12} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
