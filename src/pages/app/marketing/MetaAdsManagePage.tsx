import { useState } from "react";
import metaAdsBg from "@/assets/meta-ads-bg.png";
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
import { Megaphone, LayoutDashboard, Target, Layers, Lightbulb, BarChart3, Plus, Sparkles } from "lucide-react";
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
    <div className="flex gap-0 -m-6 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <img src={metaAdsBg} alt="" className="w-full h-full object-cover opacity-15 blur-[2px]" />
        <div className="absolute inset-0 bg-background/60" />
      </div>

      <aside className="w-44 shrink-0 liquid-glass-sidebar min-h-[calc(100vh-4rem)]">
        <div className="p-3 space-y-0.5">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
                  isActive
                    ? "liquid-glass-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/40"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('pages.meta.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('pages.meta.subtitle')}</p>
              </div>
            </div>
            <Button className="gap-2" onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('pages.meta.createCampaign')}
            </Button>
          </div>

          {activeSection !== "media" && <MetaOverviewKPIs />}

          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                  <MetaAccountConnection />
                  <MetaCampaignsTable compact />
                </div>
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
      </div>

      <CreateCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}