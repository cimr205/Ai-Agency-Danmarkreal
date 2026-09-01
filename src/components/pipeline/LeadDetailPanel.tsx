import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PIPELINE_STAGES, getStageLabel, daysSince, formatCurrency, type PipelineLead } from '@/lib/pipeline';
import { useUpdateLead, useLeadAiRecommendation } from '@/hooks/api/usePipeline';
import { useDeals } from '@/hooks/api/useDeals';
import { useConvertLeadToDeal } from '@/hooks/api/useLeads';
import { useCreateTask } from '@/hooks/api/useTasks';
import { useActivityLogs } from '@/hooks/api/useActivityLogs';
import { toast } from 'sonner';
import { Sparkles, Clock, Mail, Phone, Building2, CalendarClock, AlertTriangle, CheckCircle2, Briefcase, ListTodo, Send, PenLine, PhoneCall, X, History, LinkIcon, Star } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { da, enUS, de } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';
import { useNavigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import { AIEmailWriter } from '@/components/leads/AIEmailWriter';

const DATE_LOCALES: Record<string, typeof da> = { da, en: enUS, de };

interface Props {
  lead: PipelineLead | null;
  open: boolean;
  onClose: () => void;
}

export default function LeadDetailPanel({ lead, open, onClose }: Props) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : 'en';
  const updateLead = useUpdateLead();
  const aiRecommend = useLeadAiRecommendation();
  const convertToDeal = useConvertLeadToDeal();
  const createTask = useCreateTask();
  const { data: allDeals } = useDeals();
  const { data: activityLogs } = useActivityLogs(20);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [aiEmailOpen, setAiEmailOpen] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const dateFnsLocale = DATE_LOCALES[locale] || da;

  if (!lead) return null;

  const touched = daysSince(lead.last_touched_at);
  const isStale = touched !== null && touched > 3;
  const stageInfo = PIPELINE_STAGES.find(s => s.key === lead.status);

  // Associated deals - find deals whose title contains this lead's name
  const associatedDeals = (allDeals ?? []).filter(d =>
    d.title?.toLowerCase().includes(lead.name?.toLowerCase()) ||
    d.notes?.toLowerCase().includes(lead.name?.toLowerCase())
  );

  // Lead activity from activity logs
  const leadActivity = (activityLogs ?? []).filter(a =>
    a.entity_id === lead.id || a.description?.includes(lead.name)
  ).slice(0, 5);

  const scoreLabels: Record<number, string> = {
    1: locale === 'da' ? 'Kold' : 'Cold',
    2: locale === 'da' ? 'Lav' : 'Low',
    3: locale === 'da' ? 'Medium' : 'Medium',
    4: locale === 'da' ? 'Varm' : 'Warm',
    5: locale === 'da' ? 'Hed' : 'Hot',
  };

  const handleSave = async () => {
    try {
      await updateLead.mutateAsync({ id: lead.id, data: editData });
      toast.success(t('pipeline.leadUpdated'));
      setEditMode(false);
      setEditData({});
    } catch {
      toast.error(t('pipeline.updateError'));
    }
  };

  const handleAiRecommend = async () => {
    try {
      const res = await aiRecommend.mutateAsync(lead.id);
      toast.success(t('pipeline.aiRecommendationFetched'));
      await updateLead.mutateAsync({ id: lead.id, data: { ai_recommendation: res.next_action } });
    } catch {
      toast.error(t('pipeline.aiRecommendationError'));
    }
  };

  const handleMarkDone = async () => {
    try {
      await updateLead.mutateAsync({ id: lead.id, data: { ai_recommendation: null } });
      toast.success(t('pipeline.markedDone'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleConvertToDeal = async () => {
    try {
      // Atomic server-side conversion (convert_lead_to_deal RPC) — creates
      // the linked customer (deduped by normalized email/phone) and the
      // deal together in one transaction, instead of two separate calls
      // that could leave a deal with no customer_id if the second call
      // failed or the tab closed between them.
      await convertToDeal.mutateAsync({
        leadId: lead.id,
        dealName: `Deal: ${lead.name}`,
        value: lead.value || 0,
      });
      toast.success(locale === 'da' ? 'Deal oprettet!' : 'Deal created!');
      onClose();
      navigate(`/${routeLocale}/app/crm/deals`);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleCreateTask = async () => {
    try {
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      await createTask.mutateAsync({
        title: `Follow up: ${lead.name}`,
        description: locale === 'da'
          ? `Opfølgning på lead ${lead.name} (${lead.email})`
          : `Follow up on lead ${lead.name} (${lead.email})`,
        due_date: dueDate,
        priority: 'medium',
        lead_id: lead.id,
      });
      toast.success(locale === 'da' ? 'Opgave oprettet!' : 'Task created!');
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto p-0">
        {/* Header with close button */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <SheetHeader className="p-0">
                <SheetTitle className="text-xl font-bold truncate pr-4">
                  {lead.name}
                </SheetTitle>
              </SheetHeader>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="text-xs px-3 py-1" style={{ backgroundColor: stageInfo?.color, color: '#fff' }}>
                  {getStageLabel(lead.status, locale)}
                </Badge>
                {lead.company_name && (
                  <span className="text-sm text-muted-foreground truncate">
                    <Building2 className="h-3.5 w-3.5 inline mr-1" />
                    {lead.company_name}
                  </span>
                )}
                {isStale && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {`${touched}d`}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ===== PRIMARY ACTIONS ===== */}
          <div className="space-y-2">
            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11 text-sm"
              disabled={convertToDeal.isPending}
              onClick={handleConvertToDeal}
            >
              <Briefcase className="h-4 w-4" />
              {locale === 'da' ? 'Konverter til Deal' : 'Convert to Deal'}
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9"
                disabled={createTask.isPending}
                onClick={handleCreateTask}
              >
                <ListTodo className="h-3.5 w-3.5" />
                {locale === 'da' ? 'Opret opgave' : 'Create Task'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9" asChild>
                <a href={`mailto:${lead.email}`}>
                  <Send className="h-3.5 w-3.5" />
                  {locale === 'da' ? 'Send email' : 'Send Email'}
                </a>
              </Button>
              {lead.phone && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9" asChild>
                  <a href={`tel:${lead.phone}`}>
                    <PhoneCall className="h-3.5 w-3.5" />
                    {locale === 'da' ? 'Ring op' : 'Call'}
                  </a>
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* ===== CONTACT INFO ===== */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              {locale === 'da' ? 'Kontaktoplysninger' : 'Contact Info'}
            </h3>
            <div className="space-y-1.5 text-sm">
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline truncate">{lead.email}</a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${lead.phone}`} className="text-primary hover:underline">{lead.phone}</a>
                </div>
              )}
              {lead.company_name && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{lead.company_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* ===== DEAL DETAILS ===== */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              {locale === 'da' ? 'Lead detaljer' : 'Lead Details'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">{t('pipeline.value')}</span>
                <p className="font-semibold">
                  {lead.value ? formatCurrency(lead.value, (lead.currency as 'DKK' | 'USD') || 'DKK') : (
                    <span className="text-muted-foreground italic text-xs">
                      {locale === 'da' ? 'Ikke sat – klik Rediger' : 'Not set – click Edit'}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {locale === 'da' ? 'Lead score' : 'Lead Score'}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${(lead.score ?? 0) >= star ? 'fill-yellow-500 text-yellow-500' : 'text-muted'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium">
                    {scoreLabels[lead.score ?? 0] || (locale === 'da' ? 'Ingen' : 'None')}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('pipeline.lastTouched')}
                </span>
                <p className="text-sm">
                  {lead.last_touched_at
                    ? format(new Date(lead.last_touched_at), 'dd. MMM yyyy', { locale: dateFnsLocale })
                    : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('pipeline.nextFollowup')}
                </span>
                <p className="text-sm">
                  {lead.next_followup_at
                    ? format(new Date(lead.next_followup_at), 'dd. MMM yyyy', { locale: dateFnsLocale })
                    : (
                      <span className="text-muted-foreground italic text-xs">
                        {locale === 'da' ? 'Ikke planlagt' : 'Not scheduled'}
                      </span>
                    )}
                </p>
              </div>
            </div>
          </div>

          {/* ===== NOTES ===== */}
          {lead.notes && !editMode && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                {t('pipeline.notes')}
              </h3>
              <div
                className={`text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3 ${
                  !notesExpanded ? 'max-h-24 overflow-hidden relative' : ''
                }`}
              >
                {lead.notes}
                {!notesExpanded && lead.notes.length > 120 && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/30 to-transparent" />
                )}
              </div>
              {lead.notes.length > 120 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setNotesExpanded(!notesExpanded)}
                >
                  {notesExpanded
                    ? (locale === 'da' ? 'Vis mindre' : 'Show less')
                    : (locale === 'da' ? 'Vis mere' : 'Show more')}
                </Button>
              )}
            </div>
          )}

          <Separator />

          {/* ===== AI RECOMMENDATION ===== */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('pipeline.aiRecommendation')}
            </div>
            {lead.ai_recommendation ? (
              <div className="space-y-2">
                <p className="text-sm">{lead.ai_recommendation}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleMarkDone}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    {t('pipeline.done')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleAiRecommend} disabled={aiRecommend.isPending}>
                    {t('pipeline.newRecommendation')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" onClick={handleAiRecommend} disabled={aiRecommend.isPending}>
                {aiRecommend.isPending ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {t('pipeline.getAiRecommendation')}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* ===== AI EMAIL WRITER ===== */}
          <Button variant="outline" className="w-full gap-2" onClick={() => setAiEmailOpen(true)}>
            <PenLine className="h-4 w-4" /> AI Email Writer
          </Button>

          <Separator />

          {/* ===== ASSOCIATED DEALS ===== */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" />
              {locale === 'da' ? 'Tilknyttede deals' : 'Associated Deals'}
            </h3>
            {associatedDeals.length > 0 ? (
              <div className="space-y-1.5">
                {associatedDeals.map(deal => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      onClose();
                      navigate(`/${routeLocale}/app/crm/deals`);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{deal.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{deal.stage}</Badge>
                      <span className="text-sm font-semibold">{formatCurrency(Number(deal.value) || 0, 'DKK')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {locale === 'da'
                  ? 'Ingen deals tilknyttet. Klik "Konverter til Deal" for at oprette.'
                  : 'No deals linked. Click "Convert to Deal" to create one.'}
              </p>
            )}
          </div>

          {/* ===== ACTIVITY TIMELINE ===== */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {locale === 'da' ? 'Aktivitetshistorik' : 'Activity History'}
            </h3>
            <div className="space-y-0">
              {/* Always show created_at as first timeline entry */}
              <div className="flex gap-3 py-2">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-2">
                  <p className="text-xs font-medium">
                    {locale === 'da' ? 'Lead oprettet' : 'Lead created'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), 'dd. MMM yyyy HH:mm', { locale: dateFnsLocale })}
                  </p>
                </div>
              </div>
              {lead.last_touched_at && lead.last_touched_at !== lead.created_at && (
                <div className="flex gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5" />
                    <div className="w-px flex-1 bg-border" />
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-medium">
                      {locale === 'da' ? 'Sidst opdateret' : 'Last updated'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(lead.last_touched_at), 'dd. MMM yyyy HH:mm', { locale: dateFnsLocale })}
                    </p>
                  </div>
                </div>
              )}
              {leadActivity.map(activity => (
                <div key={activity.id} className="flex gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40 mt-1.5" />
                    <div className="w-px flex-1 bg-border" />
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-medium">{activity.action_type}</p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[280px]">{activity.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(activity.created_at), 'dd. MMM yyyy HH:mm', { locale: dateFnsLocale })}
                    </p>
                  </div>
                </div>
              ))}
              {lead.status !== 'new' && (
                <div className="flex gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-green-500 mt-1.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">
                      {locale === 'da' ? `Status ændret til "${getStageLabel(lead.status, locale)}"` : `Status changed to "${getStageLabel(lead.status, locale)}"`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ===== EDIT MODE ===== */}
          {editMode ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>{t('pipeline.stage')}</Label>
                <Select defaultValue={lead.status} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{getStageLabel(s.key, locale)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('pipeline.value')}</Label>
                <Input
                  type="number"
                  defaultValue={lead.value || 0}
                  placeholder={locale === 'da' ? 'Estimeret værdi i DKK' : 'Estimated value'}
                  onChange={e => setEditData(d => ({ ...d, value: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('pipeline.notes')}</Label>
                <Textarea
                  defaultValue={lead.notes || ''}
                  className="min-h-[120px]"
                  placeholder={locale === 'da' ? 'Tilføj noter om denne lead...' : 'Add notes about this lead...'}
                  onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updateLead.isPending}>{t('common.save')}</Button>
                <Button variant="ghost" onClick={() => { setEditMode(false); setEditData({}); }}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setEditMode(true)} className="w-full">
              <PenLine className="h-4 w-4 mr-2" />
              {t('pipeline.editLead')}
            </Button>
          )}
        </div>
      </SheetContent>

      <AIEmailWriter
        open={aiEmailOpen}
        onOpenChange={setAiEmailOpen}
        leadId={lead.id}
        leadName={lead.name}
        leadEmail={lead.email}
      />
    </Sheet>
  );
}
