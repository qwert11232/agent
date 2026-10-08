import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { generateDraft } from "@/lib/actions";
import { ensureSchema, logActivity } from "@/lib/core";
import { AiUnavailableError } from "@/lib/gpt";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(posts).orderBy(desc(posts.id)).limit(100);
  return NextResponse.json({ posts: rows });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    text?: string;
    count?: number;
    withSearch?: boolean;
    withImage?: boolean;
    imageSource?: "none" | "ai" | "library";
    mediaId?: number;
    length?: "short" | "long";
  };
  const genOpts = {
    withSearch: body.withSearch,
    withImage: body.withImage,
    imageSource: body.imageSource,
    mediaId: body.mediaId,
    length: body.length === "short" || body.length === "long" ? body.length : undefined,
  };

  try {
    return await handleGenerate(body, genOpts);
  } catch (e) {
    // Нет AI-ключа или провайдер не ответил: заглушек нет, честно сообщаем.
    const status = e instanceof AiUnavailableError ? 422 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сгенерировать пост" }, { status });
  }
}

async function handleGenerate(
  body: { topic?: string; text?: string; count?: number },
  genOpts: Parameters<typeof generateDraft>[1],
) {
  // Пакетная генерация: до 10 черновиков за раз.
  const count = Math.min(Math.max(Number(body.count ?? 1) || 1, 1), 10);
  if (count > 1 && !body.text?.trim()) {
    const created = [];
    for (let i = 0; i < count; i++) {
      created.push(await generateDraft(body.topic, genOpts));
    }
    await logActivity(
      "ПАКЕТНАЯ ГЕНЕРАЦИЯ",
      `Создано черновиков: ${created.length} (до 10 за раз).`,
    );
    return NextResponse.json({ posts: created, post: created[0], mode: "batch" });
  }

  if (body.text?.trim()) {
    const row = (
      await db
        .insert(posts)
        .values({ text: body.text.trim(), status: "draft" })
        .returning()
    )[0];
    await logActivity("ПОСТ СОЗДАН ВРУЧНУЮ", `Черновик #${row.id} добавлен в очередь.`);
    return NextResponse.json({ post: row, mode: "manual" });
  }

  const post = await generateDraft(body.topic, genOpts);
  return NextResponse.json({ post, mode: "generated" });
}
