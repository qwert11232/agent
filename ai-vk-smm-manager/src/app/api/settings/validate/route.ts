import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/core";
import { validateGptKey, validateVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const [vk, gpt] = await Promise.all([
    validateVkToken(String(body.vkToken ?? ""), String(body.groupId ?? "")),
    validateGptKey(String(body.gptKey ?? "")),
  ]);

  await logActivity(
    "ПРОВЕРКА ТОКЕНОВ",
    `VK: ${vk.ok ? "OK" : vk.simulated ? "DEMO" : "FAIL"}; GPT: ${gpt.ok ? "OK" : gpt.simulated ? "MOCK" : "FAIL"}.`,
    vk.ok || gpt.ok ? "success" : "info",
  );

  return NextResponse.json({ vk, gpt });
}
