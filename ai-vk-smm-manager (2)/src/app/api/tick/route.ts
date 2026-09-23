import { NextResponse } from "next/server";
import { runTickIfDue } from "@/lib/actions";

export const dynamic = "force-dynamic";

/** Периодический тик планировщика (замена cron/APScheduler в serverless-среде). */
export async function POST() {
  const result = await runTickIfDue();
  return NextResponse.json(result);
}
