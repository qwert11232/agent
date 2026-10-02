import { getSettings, logActivity } from "./core";

/** Отправка уведомления владельцу в Telegram. Если токен не задан — молча пропускаем. */
export async function notifyOwner(text: string): Promise<boolean> {
  try {
    const s = await getSettings();
    const token = s.tgToken?.trim() || process.env.TG_BOT_TOKEN || "";
    const chatId = s.tgChatId?.trim() || process.env.TG_CHAT_ID || "";
    if (!token || !chatId) return false;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🤖 BOT-9000\n\n${text}`,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      await logActivity(
        "TELEGRAM: ОШИБКА",
        `sendMessage вернул HTTP ${res.status} — проверьте токен и chat id.`,
        "error",
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
