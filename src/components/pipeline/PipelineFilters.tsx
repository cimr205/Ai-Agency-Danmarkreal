import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PIPELINE_STAGES, getStageLabel } from '@/lib/pipeline';
import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Filters {
  status: string;
  owner_id: string;
  q: string;
  min_score: number;
  max_score: number;
  min_value: number;
  max_value: number;
}

function extractName(seller: { full_name?: string; email: string }): string {
  if (seller.full_name) return seller.full_name;
  const local = seller.email.split('@')[0];
  return local.replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || seller.email;
}

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  sellers: Array<{ id: string; full_name?: string; email: string }>;
}

export default function PipelineFilters({ filters, onChange, sellers }: Props) {
  const { t, locale } = useI18n();
  const update = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('pipeline.searchLeads')}
          value={filters.q}
          onChange={e => update({ q: e.target.value })}
          className="pl-9"
        />
      </div>

      <Select value={filters.status || 'all'} onValueChange={v => update({ status: v === 'all' ? '' : v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder={t('pipeline.allStages')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('pipeline.allStages')}</SelectItem>
          {PIPELINE_STAGES.map(s => (
            <SelectItem key={s.key} value={s.key}>{getStageLabel(s.key, locale)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.owner_id || 'all'} onValueChange={v => update({ owner_id: v === 'all' ? '' : v })}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('pipeline.allSellers')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('pipeline.allSellers')}</SelectItem>
          {sellers.map(s => (
            <SelectItem key={s.id} value={s.id}>{extractName(s)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="min-w-[140px] space-y-1" title={locale === 'da' ? 'Filtrer leads efter lead-score (0 = lavest, 5 = højest). Scoren bruges til at prioritere de vigtigste leads.' : 'Filter leads by lead score (0 = lowest, 5 = highest). The score helps prioritize the most promising leads.'}>
        <div className="text-xs text-muted-foreground">{t('pipeline.scoreRange')}: {filters.min_score}–{filters.max_score}
          <span className="ml-1 text-muted-foreground/60 cursor-help" title={locale === 'da' ? 'Lead-score angiver hvor lovende et lead er baseret på engagement og data-kvalitet' : 'Lead score indicates how promising a lead is based on engagement and data quality'}>ⓘ</span>
        </div>
        <Slider
          min={0}
          max={5}
          step={1}
          value={[filters.min_score, filters.max_score]}
          onValueChange={([min, max]) => update({ min_score: min, max_score: max })}
        />
      </div>
    </div>
  );
}
