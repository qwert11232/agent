import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/core";
import { getMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Отдаёт байты картинки из библиотеки (превью в панели и вложение в VK). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await ctx.params;
  const row = await getMedia(Number(id));
  if (!row) return new NextResponse("not found", { status: 404 });

  const buf = Buffer.from(row.data, "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
