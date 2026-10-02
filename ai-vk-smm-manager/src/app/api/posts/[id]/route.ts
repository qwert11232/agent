import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { postImages, posts, slideSpecs } from "@/db/schema";
import { logActivity } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  await db.delete(postImages).where(eq(postImages.postId, numId));
  await db.delete(slideSpecs).where(eq(slideSpecs.postId, numId));
  await db.delete(posts).where(eq(posts.id, numId));
  await logActivity("ПОСТ УДАЛЁН", `Запись #${numId} удалена из базы.`, "info");
  return NextResponse.json({ ok: true });
}
