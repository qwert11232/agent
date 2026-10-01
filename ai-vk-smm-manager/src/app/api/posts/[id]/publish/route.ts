import { NextResponse } from "next/server";
import { publishPostById } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  try {
    const post = await publishPostById(numId);
    return NextResponse.json({ post });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "publish failed" },
      { status: 500 },
    );
  }
}
