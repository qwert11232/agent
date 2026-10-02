import { eq } from "drizzle-orm";
import { db } from "@/db";
import { postImages } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return new Response("bad id", { status: 400 });
  const row = (await db.select().from(postImages).where(eq(postImages.id, numId)))[0];
  if (!row) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
