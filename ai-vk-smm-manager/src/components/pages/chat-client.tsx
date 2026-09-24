"use client";

import { CornerDownLeft, SendHorizonal } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/db/schema";
import { fmt } from "@/components/ui";

const QUICK = [
  "Дай отчёт по статистике",
  "Сколько постов опубликовано?",
  "Как дела с охватами?",
  "Есть ошибки в работе?",
];

export default function ChatClient({
  initial,
  groupId,
}: {
  initial: ChatMessage[];
  groupId: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  async function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body || pending) return;
    setInput("");
    setPending(true);
    const optimistic: ChatMessage = {
      id: -Date.now(),
      sender: "user",
      message: body,
      createdAt: new Date(),
    } as ChatMessage;
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body }),
      });
      const data = (await res.json()) as { user: ChatMessage; bot: ChatMessage };
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        data.user,
        data.bot,
      ]);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <div className="panel panel-bright flex h-full min-h-[60vh] flex-col">
        {/* header */}
        <div className="panel-header justify-between">
          <span className="flex items-center gap-3">
            <span className="relative block h-8 w-8 overflow-hidden border-2 border-linebright">
              <Image src="/img/bot-avatar.png" alt="BOT-9000" fill sizes="32px" className="pixelated object-cover" />
            </span>
            <span>
              <span className="block text-ink">BOT-9000</span>
              <span className="flex items-center gap-1.5 text-[8px] normal-case tracking-normal text-muted">
                <span className="h-1.5 w-1.5 bg-neon-dim blink" /> онлайн · группа {groupId || "demo"}
              </span>
            </span>
          </span>
          <span className="text-[8px] text-muted">FEEDBACK.CHAT</span>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-bg/60 p-4 md:p-5">
          {messages.map((m) =>
            m.sender === "bot" ? (
              <div key={m.id} className="flex items-end gap-3 popin">
                <span className="relative block h-9 w-9 shrink-0 overflow-hidden border-2 border-violet">
                  <Image src="/img/bot-avatar.png" alt="bot" fill sizes="36px" className="pixelated object-cover" />
                </span>
                <div className="max-w-[85%]">
                  <div className="bubble bubble-bot">{m.message}</div>
                  <span className="mt-1 block text-sm text-muted">{fmt.dateTime(m.createdAt)}</span>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-end justify-end gap-3 popin">
                <div className="max-w-[85%] text-right">
                  <div className="bubble bubble-user text-left">{m.message}</div>
                  <span className="mt-1 block text-sm text-muted">{fmt.dateTime(m.createdAt)}</span>
                </div>
                <span className="relative block h-9 w-9 shrink-0 overflow-hidden border-2 border-neon">
                  <Image src="/img/user-avatar.png" alt="you" fill sizes="36px" className="pixelated object-cover" />
                </span>
              </div>
            ),
          )}
          {pending ? (
            <div className="flex items-end gap-3">
              <span className="relative block h-9 w-9 shrink-0 overflow-hidden border-2 border-violet">
                <Image src="/img/bot-avatar.png" alt="bot" fill sizes="36px" className="pixelated object-cover" />
              </span>
              <div className="bubble bubble-bot flex items-center gap-2">
                <span className="tdot" />
                <span className="tdot" />
                <span className="tdot" />
              </div>
            </div>
          ) : null}
        </div>

        {/* quick chips */}
        <div className="flex flex-wrap gap-2 border-t-[3px] border-line bg-panel px-4 py-2.5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={pending}
              className="border-2 border-line bg-panel2 px-2.5 py-1 text-sm text-muted transition-colors hover:border-neon-dim hover:text-neon-dim disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        {/* input */}
        <div className="flex items-stretch gap-3 border-t-[3px] border-line bg-panel p-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Напишите боту… (Enter — отправить, Shift+Enter — перенос)"
            className="pixel-textarea max-h-32 flex-1 resize-none"
          />
          <button onClick={() => send()} disabled={pending || !input.trim()} className="btn btn-neon">
            <SendHorizonal size={15} />
            <span className="hidden md:inline">Отправить</span>
            <CornerDownLeft size={12} className="md:hidden" />
          </button>
        </div>
      </div>
    </div>
  );
}
