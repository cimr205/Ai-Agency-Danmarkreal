import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, TrendingUp, TrendingDown, Minus, Megaphone } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

// Ready for real Meta API data – currently shows empty state
// When connected, campaigns will be fetched from Meta Graph API

export function MetaCampaignsTable({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Empty array – will be populated from Meta API
  const campaigns: unknown[] = [];
  const filtered = campaigns;

  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-[14px] font-medium">{t('metaAds.campaigns')}</CardTitle>
          {!compact && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder={t('metaAds.searchCampaigns')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-32 text-sm">
                  <SelectValue placeholder={t('metaAds.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('metaAds.allStatus')}</SelectItem>
                  <SelectItem value="active">{t('metaAds.active')}</SelectItem>
                  <SelectItem value="paused">{t('metaAds.paused')}</SelectItem>
                  <SelectItem value="completed">{t('metaAds.completed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">{t('metaAds.campaign')}</TableHead>
                <TableHead className="text-xs">{t('metaAds.status')}</TableHead>
                {!compact && <TableHead className="text-xs">{t('metaAds.objective')}</TableHead>}
                <TableHead className="text-xs text-right">{t('metaAds.spend')}</TableHead>
                <TableHead className="text-xs text-right">{t('metaAds.ctr')}</TableHead>
                <TableHead className="text-xs text-right">{t('metaAds.cpc')}</TableHead>
                <TableHead className="text-xs text-right">{t('metaAds.conv')}</TableHead>
                <TableHead className="text-xs text-right">{t('metaAds.roas')}</TableHead>
                <TableHead className="text-xs text-center">{t('metaAds.trend')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={compact ? 8 : 9} className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                      <Megaphone className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{t('metaAds.noCampaignsYet')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('metaAds.createFirstCampaign')}</p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
