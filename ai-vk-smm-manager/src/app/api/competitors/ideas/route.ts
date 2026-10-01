import { NextResponse } from "next/server";
import { runCompetitorIdeas } from "@/lib/competitor-ideas";
import { ensureSchema } from "@/lib/core";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Ручной запуск суточного анализа конкурентов (то же, что делает планировщик раз в сутки). */
export async function POST() {
  await ensureSchema();
  const report = await runCompetitorIdeas();
  return NextResponse.json({ report });
}
