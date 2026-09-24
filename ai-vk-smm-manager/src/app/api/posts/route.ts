import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { generateDraft } from "@/lib/actions";
import { ensureSchema, logActivity } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(posts).orderBy(desc(posts.id)).limit(100);
  return NextResponse.json({ posts: rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    text?: string;
  };

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

  const post = await generateDraft(body.topic);
  return NextResponse.json({ post, mode: "generated" });
}
