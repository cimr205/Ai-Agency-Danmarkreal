import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export function MetaPerformanceCharts() {
  const { t } = useI18n();
  const [period, setPeriod] = useState("30");

  return (
    <div className="rounded-2xl bg-card border border-border/60 p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-5">
        <span className="text-[13px] font-medium text-foreground truncate">{t('metaAds.performance')}</span>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-7 w-[112px] text-[11px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('metaAds.last7')}</SelectItem>
            <SelectItem value="14">{t('metaAds.last14')}</SelectItem>
            <SelectItem value="30">{t('metaAds.last30')}</SelectItem>
            <SelectItem value="90">{t('metaAds.last90')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-baseline gap-8 mb-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[19px] font-semibold tracking-tight">–</p>
          <p className="text-[11px] text-muted-foreground truncate">{t('metaAds.clicks')}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[19px] font-semibold tracking-tight">–</p>
          <p className="text-[11px] text-muted-foreground truncate">{t('metaAds.conversions')}</p>
        </div>
      </div>
      <div className="h-28 flex items-center justify-center rounded-lg bg-muted/40 border border-border/50">
        <div className="text-center">
          <BarChart3 className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
          <p className="text-[11px] text-muted-foreground/70">Ingen kampagnedata endnu</p>
        </div>
      </div>

      <div className="h-px bg-border/50 my-5" />

      <p className="text-[11.5px] text-muted-foreground mb-3">{t('metaAds.spendRoasTrend')}</p>
      <div className="h-24 flex items-center justify-center rounded-lg bg-muted/40 border border-border/50">
        <TrendingUp className="h-5 w-5 text-muted-foreground/40" />
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-[10.5px] text-muted-foreground">{t('metaAds.clicks')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-[10.5px] text-muted-foreground">{t('metaAds.conversions')}</span>
        </div>
      </div>
    </div>
  );
}
