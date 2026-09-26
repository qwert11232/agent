import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analytics, posts } from "@/db/schema";
import { ensureSchema } from "@/lib/core";
import { buildInsights, predictLikes } from "@/lib/insights";

export const dynamic = "force-dynamic";

async function insights() {
  const all = await db.select().from(posts);
  const last = (await db.select().from(analytics).orderBy(desc(analytics.date)).limit(1))[0];
  return { all, insights: buildInsights(all, last?.followers ?? 0) };
}

export async function GET() {
  await ensureSchema();
  const { insights: i } = await insights();
  return NextResponse.json(i);
}

/** Прогноз по тексту черновика. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    category?: string;
    hasImage?: boolean;
  };
  const { insights: i } = await insights();
  const forecast = predictLikes(
    body.text ?? "",
    body.category ?? "польза",
    Boolean(body.hasImage),
    i,
  );
  return NextResponse.json({ forecast, avgLikes: i.avgLikes });
}
