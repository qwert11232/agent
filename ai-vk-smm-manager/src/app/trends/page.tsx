import TrendsClient from "@/components/pages/trends-client";
import { ensureSchema, getSettings } from "@/lib/core";
import { listCompetitorRows } from "@/lib/trends";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  await ensureSchema();
  const [rivals, s] = await Promise.all([listCompetitorRows(), getSettings()]);
  return <TrendsClient rivals={rivals} live={isRealVkToken(s.vkToken)} />;
}
