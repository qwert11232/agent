import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/core";
import { detectTrends, runCompetitorScan } from "@/lib/trends";

export const dynamic = "force-dynamic";

/** Свежие темы: анализ конкурентов + своих постов + интернета. */
export async function GET() {
  await ensureSchema();
  return NextResponse.json(await detectTrends());
}

/** Полный AFK-скан: обновить конкурентов и пересчитать темы. */
export async function POST() {
  await ensureSchema();
  const scan = await runCompetitorScan();
  const trends = await detectTrends();
  return NextResponse.json({ ...trends, scan });
}
