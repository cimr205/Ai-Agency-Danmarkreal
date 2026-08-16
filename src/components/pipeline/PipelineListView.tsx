import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PIPELINE_STAGES, getStageLabel, daysSince, formatCurrency, type PipelineLead } from '@/lib/pipeline';
import { AlertTriangle, Sparkles, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { da, enUS, de } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';

type SortKey = 'name' | 'company_name' | 'status' | 'owner_name' | 'value' | 'last_touched_at' | 'score';
type SortDir = 'asc' | 'desc';

const DATE_LOCALES: Record<string, typeof da> = { da, en: enUS, de };

interface Props {
  leads: PipelineLead[];
  isLoading: boolean;
  currency: 'DKK' | 'USD';
  onSelectLead: (lead: PipelineLead) => void;
  slaThresholdDays?: number;
}

export default function PipelineListView({ leads, isLoading, currency, onSelectLead, slaThresholdDays = 3 }: Props) {
  const { t, locale } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>('last_touched_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const dateFnsLocale = DATE_LOCALES[locale] || da;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const arr = [...leads];
    arr.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortKey) {
        case 'name': aVal = a.name || ''; bVal = b.name || ''; break;
        case 'company_name': aVal = a.company_name || ''; bVal = b.company_name || ''; break;
        case 'status': aVal = a.status; bVal = b.status; break;
        case 'owner_name': aVal = a.owner_name || ''; bVal = b.owner_name || ''; break;
        case 'value': aVal = a.value || 0; bVal = b.value || 0; break;
        case 'last_touched_at': aVal = a.last_touched_at || ''; bVal = b.last_touched_at || ''; break;
        case 'score': aVal = a.score || 0; bVal = b.score || 0; break;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal), locale)
        : String(bVal).localeCompare(String(aVal), locale);
    });
    return arr;
  }, [leads, sortKey, sortDir, locale]);

  const SortableHead = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => handleSort(sortKeyVal)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyVal ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/70 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-border bg-card/70 backdrop-blur overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <SortableHead label={t('common.name')} sortKeyVal="name" />
              <SortableHead label={t('pipeline.company')} sortKeyVal="company_name" />
              <SortableHead label={t('pipeline.stage')} sortKeyVal="status" />
              <SortableHead label={t('pipeline.seller')} sortKeyVal="owner_name" />
              <SortableHead label={t('pipeline.value')} sortKeyVal="value" />
              <SortableHead label={t('pipeline.lastTouched')} sortKeyVal="last_touched_at" />
              <TableHead>{t('pipeline.aiRecommendation')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {t('pipeline.noLeads')}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map(lead => {
                const touched = daysSince(lead.last_touched_at);
                const isStale = touched !== null && touched > slaThresholdDays;
                const stageInfo = PIPELINE_STAGES.find(s => s.key === lead.status);

                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => onSelectLead(lead)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{lead.name}</div>
                        {isStale && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {`${t('pipeline.staleWarningPrefix')} ${touched} ${t('pipeline.staleWarningDays')}`}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{lead.company_name || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        className="text-xs"
                        style={{ backgroundColor: stageInfo?.color, color: '#fff' }}
                      >
                        {getStageLabel(lead.status, locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{lead.owner_name || '—'}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatCurrency(lead.value || 0, currency)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        {isStale && (
                          <span className="text-destructive text-xs font-medium">{touched}d</span>
                        )}
                        <span className="text-muted-foreground">
                          {lead.last_touched_at
                            ? format(new Date(lead.last_touched_at), 'dd. MMM yyyy', { locale: dateFnsLocale })
                            : '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.ai_recommendation ? (
                        <div className="flex items-start gap-1.5 max-w-[200px]">
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <span className="text-xs text-muted-foreground line-clamp-2">{lead.ai_recommendation}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
