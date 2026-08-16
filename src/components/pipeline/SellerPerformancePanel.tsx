import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { PIPELINE_STAGES, formatCurrency, convertCurrency, type PipelineLead } from '@/lib/pipeline';
import { Trophy, TrendingUp, Users, Timer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Props {
  leads: PipelineLead[];
  sellers: Array<{ id: string; full_name?: string; email: string }>;
  currency: 'DKK' | 'USD';
  isAdmin: boolean;
}

interface SellerStats {
  id: string;
  name: string;
  totalValue: number;
  wonValue: number;
  conversionRate: number;
  avgDaysInPipeline: number;
  totalLeads: number;
}

function extractName(seller: { full_name?: string; email: string }): string {
  if (seller.full_name) return seller.full_name;
  const local = seller.email.split('@')[0];
  return local.replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || seller.email;
}

export default function SellerPerformancePanel({ leads, sellers, currency, isAdmin }: Props) {
  const { t } = useI18n();

  const stats = useMemo(() => {
    const result: SellerStats[] = sellers.map(seller => {
      const sellerLeads = leads.filter(l => l.owner_id === seller.id);
      const totalValue = sellerLeads.reduce((sum, l) => {
        const leadCur = (l.currency || 'DKK') as 'DKK' | 'USD';
        return sum + convertCurrency(l.value || 0, leadCur, currency);
      }, 0);
      const qualifiedLeads = sellerLeads.filter(l => l.status === 'qualified' || l.status === 'customer');
      const wonValue = qualifiedLeads.reduce((sum, l) => {
        const leadCur = (l.currency || 'DKK') as 'DKK' | 'USD';
        return sum + convertCurrency(l.value || 0, leadCur, currency);
      }, 0);
      const conversionRate = sellerLeads.length > 0 ? (qualifiedLeads.length / sellerLeads.length) * 100 : 0;
      const avgDays = sellerLeads.length > 0
        ? sellerLeads.reduce((sum, l) => {
            if (!l.created_at) return sum;
            return sum + Math.floor((Date.now() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24));
          }, 0) / sellerLeads.length
        : 0;

      return {
        id: seller.id,
        name: extractName(seller),
        totalValue,
        wonValue,
        conversionRate,
        avgDaysInPipeline: Math.round(avgDays),
        totalLeads: sellerLeads.length,
      };
    });
    return result.sort((a, b) => b.wonValue - a.wonValue);
  }, [leads, sellers, currency]);

  const topSeller = stats[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              {t('pipeline.topSeller')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{topSeller?.name || '—'}</div>
            <div className="text-xs text-muted-foreground">
              {topSeller ? formatCurrency(topSeller.wonValue, currency) : '—'} {t('pipeline.closed')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              {t('pipeline.totalPipeline')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{formatCurrency(stats.reduce((s, x) => s + x.totalValue, 0), currency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {t('pipeline.sellers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{stats.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              {t('pipeline.avgDays')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {stats.length > 0 ? Math.round(stats.reduce((s, x) => s + x.avgDaysInPipeline, 0) / stats.length) : 0} {t('pipeline.days')}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              {t('pipeline.ranking')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('pipeline.seller')}</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>{t('pipeline.value')}</TableHead>
                  <TableHead>{t('pipeline.closed')}</TableHead>
                  <TableHead>{t('pipeline.conversion')}</TableHead>
                  <TableHead>{t('pipeline.avgDays')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((seller, i) => (
                  <TableRow key={seller.id}>
                    <TableCell>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</TableCell>
                    <TableCell className="font-medium">{seller.name}</TableCell>
                    <TableCell>{seller.totalLeads}</TableCell>
                    <TableCell>{formatCurrency(seller.totalValue, currency)}</TableCell>
                    <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(seller.wonValue, currency)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={seller.conversionRate} className="w-16 h-2" />
                        <span className="text-xs">{Math.round(seller.conversionRate)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{seller.avgDaysInPipeline}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
