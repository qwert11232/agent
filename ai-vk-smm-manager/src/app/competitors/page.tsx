import CompetitorsClient from "@/components/pages/competitors-client";
import { listCompetitors } from "@/lib/competitors";
import { ensureSchema, getSettings } from "@/lib/core";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  await ensureSchema();
  const [rows, s] = await Promise.all([listCompetitors(), getSettings()]);
  return (
    <CompetitorsClient
      initial={rows}
      live={isRealVkToken(s.vkToken)}
    />
  );
}
