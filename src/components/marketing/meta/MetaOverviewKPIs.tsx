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
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<KpiData>(emptyKpi);
  const [loading, setLoading] = useState(false);

  // Fetch all ad accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
      if (!profile?.company_id) return;

      const { data: conn } = await supabase
        .from("meta_connections")
        .select("access_token")
        .eq("company_id", profile.company_id)
        .eq("status", "connected")
        .single();
      if (!conn?.access_token) return;
      setToken(conn.access_token);

      const { data: adAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name, currency")
        .eq("company_id", profile.company_id);

      if (adAccounts && adAccounts.length > 0) {
        setAccounts(adAccounts);
        setSelectedAccountId(adAccounts[0].account_id);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch KPIs when selected account changes
  const fetchKpis = useCallback(async (actId: string, accessToken: string, cur: string) => {
    setLoading(true);
    try {
      const accountResp = await fetch(
        `https://graph.facebook.com/v21.0/act_${actId}?fields=balance,amount_spent,spend_cap,currency,funding_source_details&access_token=${accessToken}`
      );

      let balance: string | null = null;
      let amountSpent: string | null = null;
      let spendLimit: string | null = null;
      let fundingAmount: string | null = null;
      let detectedCurrency = cur;

      if (accountResp.ok) {
        const d = await accountResp.json();
        if (d.currency) detectedCurrency = d.currency;
        if (d.balance !== undefined) balance = (Math.abs(parseInt(d.balance)) / 100).toFixed(2);
        if (d.amount_spent !== undefined) amountSpent = (parseInt(d.amount_spent) / 100).toFixed(2);
        if (d.spend_cap !== undefined && d.spend_cap !== "0") spendLimit = (parseInt(d.spend_cap) / 100).toFixed(2);
        if (d.funding_source_details) {
          const fsd = d.funding_source_details;
          if (fsd.display_string) fundingAmount = fsd.display_string;
          if (fsd.current_balance !== undefined) {
            const cb = Math.abs(parseInt(fsd.current_balance)) / 100;
            if (cb > 0) balance = cb.toFixed(2);
          }
        }
      }

      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString().split("T")[0];
      const until = today.toISOString().split("T")[0];

      let totalSpend: string | null = null;
      let impressions: string | null = null;
      let clicks: string | null = null;
      let ctr: string | null = null;

      const insightsResp = await fetch(
        `https://graph.facebook.com/v21.0/act_${actId}/insights?fields=spend,impressions,clicks,ctr&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`
      );
      if (insightsResp.ok) {
        const insData = await insightsResp.json();
        if (insData.data && insData.data.length > 0) {
          const row = insData.data[0];
          if (row.spend) totalSpend = parseFloat(row.spend).toFixed(2);
          if (row.impressions) impressions = parseInt(row.impressions).toLocaleString("da-DK");
          if (row.clicks) clicks = parseInt(row.clicks).toLocaleString("da-DK");
          if (row.ctr) ctr = parseFloat(row.ctr).toFixed(2) + "%";
        }
      }

      setData({
        balance, amountSpent, spend_limit: spendLimit,
        currency: detectedCurrency, accountId: actId,
        fundingAmount, totalSpend, impressions, clicks, ctr,
      });
    } catch (e) {
      console.error("Failed to fetch Meta KPIs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAccountId || !token) return;
    const account = accounts.find(a => a.account_id === selectedAccountId);
    fetchKpis(selectedAccountId, token, account?.currency || "DKK");
  }, [selectedAccountId, token, accounts, fetchKpis]);

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
