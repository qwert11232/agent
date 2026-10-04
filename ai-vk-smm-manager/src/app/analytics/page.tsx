import { BarChart3, Brain, Radar, Swords } from "lucide-react";
import { HubBar } from "@/components/hub";
import { CompetitorsTab, InsightsTab, StatsTab, TrendsTab } from "@/components/server-tabs";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "insights", label: "Умная аналитика", icon: Brain },
  { id: "trends", label: "Тренды", icon: Radar },
  { id: "competitors", label: "Конкуренты", icon: Swords },
];

export default async function AnalyticsHubPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <>
      <HubBar base="/analytics" active={tab ?? "stats"} tabs={TABS} />
      {tab === "insights" ? (
        <InsightsTab />
      ) : tab === "trends" ? (
        <TrendsTab />
      ) : tab === "competitors" ? (
        <CompetitorsTab />
      ) : (
        <StatsTab />
      )}
    </>
  );
}
