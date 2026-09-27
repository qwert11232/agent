import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { listComments, processComments } from "@/lib/comments";
import { ensureSchema } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  return NextResponse.json({ comments: await listComments() });
}

/** Опрос VK на новые комментарии + автоответы/модерация. */
export async function POST() {
  await ensureSchema();
  const result = await processComments();
  return NextResponse.json({ ...result, comments: await listComments() });
}

/** Отметить обработанным вручную. */
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (body.id) {
    await db.update(comments).set({ status: "replied" }).where(eq(comments.id, body.id));
  }
  return NextResponse.json({ comments: await listComments() });
}
