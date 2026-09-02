import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Eye, MousePointerClick, BarChart3, TrendingUp, Wallet, CreditCard, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

type BalanceView = "funds" | "outstanding";

interface AdAccount {
  account_id: string;
  account_name: string | null;
  currency: string | null;
}

interface KpiData {
  balance: string | null;
  amountSpent: string | null;
  spend_limit: string | null;
  currency: string;
  accountId: string | null;
  fundingAmount: string | null;
  totalSpend: string | null;
  impressions: string | null;
  clicks: string | null;
  ctr: string | null;
}

const emptyKpi: KpiData = {
  balance: null, amountSpent: null, spend_limit: null,
  currency: "DKK", accountId: null, fundingAmount: null,
  totalSpend: null, impressions: null, clicks: null, ctr: null,
};

export function MetaOverviewKPIs() {
  const { t } = useI18n();
  const [balanceView, setBalanceView] = useState<BalanceView>("funds");
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [data, setData] = useState<KpiData>(emptyKpi);
  const [loading, setLoading] = useState(false);

  // Fetch all ad accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      const { data } = await supabase.rpc("get_meta_connection_status");
      const status = data as unknown as { status?: string; ad_accounts?: AdAccount[] };
      const adAccounts = status.status === "connected" ? status.ad_accounts ?? [] : [];

      if (adAccounts && adAccounts.length > 0) {
        setAccounts(adAccounts);
        setSelectedAccountId(adAccounts[0].account_id);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch KPIs when selected account changes
  const fetchKpis = useCallback(async (actId: string, cur: string) => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString().split("T")[0];
      const { data: account } = await supabase.from("meta_ad_accounts").select("id").eq("account_id", actId).single();
      const { data: rows, error } = await supabase.from("meta_daily_insights")
        .select("spend,impressions,clicks").eq("ad_account_id", account?.id ?? "").gte("insight_date", since);
      if (error) throw error;
      const totals = (rows ?? []).reduce((acc, row) => ({
        spend: acc.spend + Number(row.spend || 0),
        impressions: acc.impressions + Number(row.impressions || 0),
        clicks: acc.clicks + Number(row.clicks || 0),
      }), { spend: 0, impressions: 0, clicks: 0 });
      const calculatedCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

      setData({
        balance: null, amountSpent: null, spend_limit: null,
        currency: cur, accountId: actId, fundingAmount: null,
        totalSpend: totals.spend.toFixed(2),
        impressions: totals.impressions.toLocaleString("da-DK"),
        clicks: totals.clicks.toLocaleString("da-DK"),
        ctr: calculatedCtr.toFixed(2) + "%",
      });
    } catch (e) {
      console.error("Failed to fetch Meta KPIs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    const account = accounts.find(a => a.account_id === selectedAccountId);
    fetchKpis(selectedAccountId, account?.currency || "DKK");
  }, [selectedAccountId, accounts, fetchKpis]);

  const selectedAccount = accounts.find(a => a.account_id === selectedAccountId);
  const selectedLabel = selectedAccount?.account_name || selectedAccount?.account_id || t('metaAds.selectAccount');

  const outstandingValue = (() => {
    if (data.spend_limit && data.amountSpent) {
      return (parseFloat(data.spend_limit) - parseFloat(data.amountSpent)).toFixed(2);
    }
    return data.amountSpent;
  })();

  const balanceCardValue = balanceView === "funds"
    ? (data.balance !== null ? `${data.balance} ${data.currency}` : (data.fundingAmount || "–"))
    : (outstandingValue !== null ? `${outstandingValue} ${data.currency}` : "–");

  const balanceCardLabel = balanceView === "funds" ? t('metaAds.funds') : t('metaAds.outstanding');

  const kpiDefs = [
    { label: balanceCardLabel, icon: balanceView === "funds" ? Wallet : CreditCard, value: balanceCardValue, highlight: true },
    { label: t('metaAds.spend30d'), icon: DollarSign, value: data.totalSpend !== null ? `${data.totalSpend} ${data.currency}` : "–" },
    { label: t('metaAds.impressions'), icon: Eye, value: data.impressions || "–" },
    { label: t('metaAds.clicks'), icon: MousePointerClick, value: data.clicks || "–" },
    { label: t('metaAds.avgCtr'), icon: BarChart3, value: data.ctr || "–" },
    { label: t('metaAds.roas'), icon: TrendingUp, value: "–" },
  ];

  return (
    <div className="space-y-3">
      {/* Account selector */}
      {accounts.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('metaAds.adAccount')}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                  "bg-muted hover:bg-muted/80 text-foreground transition-colors",
                  loading && "opacity-50 pointer-events-none"
                )}
              >
                {selectedLabel}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {accounts.map((acc) => (
                <DropdownMenuItem
                  key={acc.account_id}
                  onClick={() => setSelectedAccountId(acc.account_id)}
                  className={cn(
                    "text-xs",
                    acc.account_id === selectedAccountId && "bg-accent"
                  )}
                >
                  <span className="font-medium">{acc.account_name || acc.account_id}</span>
                  {acc.currency && (
                    <span className="ml-2 text-muted-foreground">({acc.currency})</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Overview — flowing stats strip, no boxes */}
      <div className={cn(
        "flex flex-wrap items-stretch gap-x-8 gap-y-4 py-4 border-y border-border/60",
        loading && "opacity-50 transition-opacity",
      )}>
        {kpiDefs.map((kpiItem, i) => (
          <div key={kpiItem.label} className="flex items-stretch gap-x-8">
            {i > 0 && <div className="hidden sm:block w-px bg-border/60" aria-hidden />}
            <div className="shrink-0">
              <div className="text-[11.5px] text-muted-foreground first-letter:uppercase">{kpiItem.label}</div>
              <div className="text-[19px] font-semibold tracking-tight tabular-nums mt-0.5">{kpiItem.value}</div>
              {kpiItem.highlight ? (
                <div className="flex items-center gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setBalanceView(balanceView === "funds" ? "outstanding" : "funds")}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
                  >
                    {balanceView === "funds" ? t('metaAds.outstandingTab') : t('metaAds.fundsTab')}
                  </button>
                  <a
                    href={data.accountId ? `https://business.facebook.com/ads/manager/account_settings/account_billing/?act=${data.accountId}` : "https://business.facebook.com/billing"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline"
                  >
                    {t('metaAds.addFunds')}
                  </a>
                </div>
              ) : (
                <p className="text-[10.5px] text-muted-foreground/60 mt-0.5">
                  {kpiItem.value === "–" ? t('metaAds.noDataYet') : t('metaAds.last30Days')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
