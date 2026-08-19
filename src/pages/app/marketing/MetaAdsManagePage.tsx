import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MetaOverviewKPIs } from "@/components/marketing/meta/MetaOverviewKPIs";
import { MetaAccountConnection } from "@/components/marketing/meta/MetaAccountConnection";
import { MetaCampaignsTable } from "@/components/marketing/meta/MetaCampaignsTable";
import { MetaAdSetsTable } from "@/components/marketing/meta/MetaAdSetsTable";
import { MetaAdsTable } from "@/components/marketing/meta/MetaAdsTable";
import { MetaAIRecommendations } from "@/components/marketing/meta/MetaAIRecommendations";
import { MetaAIAdGenerator } from "@/components/marketing/meta/MetaAIAdGenerator";
import { MetaReports } from "@/components/marketing/meta/MetaReports";
import { MetaQuickAnalyst } from "@/components/marketing/meta/MetaQuickAnalyst";
import { MetaPerformanceCharts } from "@/components/marketing/meta/MetaPerformanceCharts";
import { CreateCampaignWizard } from "@/components/marketing/meta/CreateCampaignWizard";
import AiMediaContent from "@/components/marketing/AiMediaContent";
import { LayoutDashboard, Target, Layers, Lightbulb, BarChart3, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export default function MetaAdsManagePage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState("overview");
  const [wizardOpen, setWizardOpen] = useState(false);

  const sidebarItems = [
    { id: "overview", label: t('pages.meta.overview'), icon: LayoutDashboard },
    { id: "campaigns", label: t('pages.meta.campaigns'), icon: Target },
    { id: "adsets", label: t('pages.meta.adSets'), icon: Layers },
    { id: "insights", label: t('pages.meta.insights'), icon: Lightbulb },
    { id: "reports", label: t('pages.meta.reports'), icon: BarChart3 },
    { id: "media", label: t('pages.meta.aiMedia'), icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{t('pages.meta.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('pages.meta.subtitle')}</p>
        </div>
        <Button className="gap-2" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('pages.meta.createCampaign')}
        </Button>
      </div>

      {/* Section tabs — single flat row, no second sidebar */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border/60 -mb-px">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors shrink-0",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {activeSection !== "media" && <MetaOverviewKPIs />}

        {activeSection === "overview" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-6 min-w-0">
              <MetaAccountConnection />
              <MetaCampaignsTable compact />
            </div>
            <div className="min-w-0">
              <MetaPerformanceCharts />
            </div>
          </div>
        )}

        {activeSection === "campaigns" && <MetaCampaignsTable />}
        {activeSection === "adsets" && <MetaAdSetsTable />}

        {activeSection === "insights" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <MetaAIRecommendations />
              <MetaQuickAnalyst />
            </div>
            <MetaAIAdGenerator />
          </div>
        )}

        {activeSection === "reports" && <MetaReports />}
        {activeSection === "media" && <AiMediaContent />}
      </div>

      <CreateCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}