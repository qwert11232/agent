import { NextRequest, NextResponse } from "next/server";
import { runTickIfDue } from "@/lib/actions";

export const dynamic = "force-dynamic";

/** Периодический тик планировщика (замена cron/APScheduler в serverless-среде). */
async function tick() {
  const result = await runTickIfDue();
  return NextResponse.json(result);
}

export async function POST() {
  return tick();
}

/**
 * GET — для внешних cron-сервисов (cron-job.org, Vercel Cron и т.п.).
 * Если задана переменная CRON_SECRET — требуется заголовок
 * Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  return tick();
}
