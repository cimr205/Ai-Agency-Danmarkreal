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
import { Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SegmentedControl } from "@/components/workspace/SegmentedControl";

type MetaSection = "overview" | "campaigns" | "adsets" | "insights" | "reports" | "media";

export default function MetaAdsManagePage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<MetaSection>("overview");
  const [wizardOpen, setWizardOpen] = useState(false);

  const sections: { id: MetaSection; label: string }[] = [
    { id: "overview", label: t('pages.meta.overview') },
    { id: "campaigns", label: t('pages.meta.campaigns') },
    { id: "adsets", label: t('pages.meta.adSets') },
    { id: "insights", label: t('pages.meta.insights') },
    { id: "reports", label: t('pages.meta.reports') },
    { id: "media", label: t('pages.meta.aiMedia') },
  ];

  return (
    <div className="workspace-theme space-y-6">
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

      <SegmentedControl<MetaSection> layoutId="metaSectionPill" value={activeSection} onChange={setActiveSection} options={sections} />

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