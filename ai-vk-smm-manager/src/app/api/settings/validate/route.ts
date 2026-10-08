import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/core";
import { checkServiceKey } from "@/lib/competitor-ideas";
import { isRealVkToken, resolveServiceToken, validateGptKey, validateVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const [vk, gpt] = await Promise.all([
    validateVkToken(String(body.vkToken ?? ""), String(body.groupId ?? "")),
    validateGptKey(String(body.gptKey ?? "")),
  ]);

  // Сервисный ключ (чтение стен конкурентов) — отдельная проверка.
  const serviceToken = resolveServiceToken(String(body.vkServiceToken ?? ""));
  let service: { ok: boolean; simulated: boolean; message: string };
  if (!isRealVkToken(serviceToken)) {
    service = {
      ok: false,
      simulated: true,
      message: "Сервисный ключ не задан — анализ конкурентов отключён.",
    };
  } else {
    const check = await checkServiceKey(serviceToken);
    service = check.ok
      ? { ok: true, simulated: false, message: "Сервисный ключ принят: чтение стен конкурентов доступно." }
      : { ok: false, simulated: false, message: `Сервисный ключ не работает: ${check.error}` };
  }

  await logActivity(
    "ПРОВЕРКА ТОКЕНОВ",
    `VK: ${vk.ok ? "OK" : vk.simulated ? "DEMO" : "FAIL"}; GPT: ${gpt.ok ? "OK" : gpt.simulated ? "MOCK" : "FAIL"}.`,
    vk.ok || gpt.ok ? "success" : "info",
  );

  return NextResponse.json({ vk, gpt, service });
}
