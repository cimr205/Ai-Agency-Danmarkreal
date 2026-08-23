import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import { AIEmailWriter } from '@/components/leads/AIEmailWriter';
import { LeadAiSummaryPanel } from '@/components/leads/LeadAiSummaryPanel';
import { useLeads, useCreateLead, useUpdateLeadScore, useDeleteLead, useUpdateLead, useConvertLeadToCustomer, useSavedLeadFilters, useCreateSavedFilter, useDeleteSavedFilter, useAllLeadTags, useLeadFolders, useCreateLeadFolder, useDeleteLeadFolder, useMoveLeadToFolder, useBulkDeleteLeads, useBulkUpdateLeads, type LeadWithOwner } from '@/hooks/api/useLeads';
import { useDeals } from '@/hooks/api/useDeals';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared/EmptyState';
import { Plus, Search, Mail, Star, Upload, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, Phone, Building2, ArrowLeft, Save, Briefcase, Sparkles, X, Tag, BookmarkPlus, Filter, FolderPlus, Folder, FolderOpen, Download, CheckSquare } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CsvImportWizard } from '@/components/import/CsvImportWizard';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/lib/errors';

type Lead = LeadWithOwner;
type SavedFilter = Tables<'saved_lead_filters'>;
type LeadFolder = Tables<'lead_folders'>;
type Deal = Tables<'deals'>;

const statusColors: Record<string, string> = {
  new: 'bg-primary/15 text-primary',
  contacted: 'bg-warning/15 text-warning',
  qualified: 'bg-success/15 text-success',
  unqualified: 'bg-muted text-muted-foreground',
  customer: 'bg-emerald-500/15 text-emerald-600',
};

const INDUSTRY_OPTIONS = [
  { value: 'craftsman', labelKey: 'industryHandwerk' },
  { value: 'marketing', labelKey: 'industryMarketing' },
  { value: 'it_software', labelKey: 'industryIT' },
  { value: 'retail', labelKey: 'industryRetail' },
  { value: 'restaurant', labelKey: 'industryRestaurant' },
  { value: 'legal_accounting', labelKey: 'industryLegal' },
  { value: 'other', labelKey: 'industryOther' },
];

const TAG_COLORS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  'bg-green-500/15 text-green-700 dark:text-green-400',
  'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  'bg-pink-500/15 text-pink-700 dark:text-pink-400',
  'bg-teal-500/15 text-teal-700 dark:text-teal-400',
  'bg-red-500/15 text-red-700 dark:text-red-400',
  'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function LeadsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLogic, setTagLogic] = useState<'and' | 'or'>('or');
  const [page, setPage] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);
  const [autoImportProgress, setAutoImportProgress] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editIndustry, setEditIndustry] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newFilterTagInput, setNewFilterTagInput] = useState('');
  const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', company_name: '' });
  const [createErrors, setCreateErrors] = useState<{ name?: string; email?: string }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [aiEmailOpen, setAiEmailOpen] = useState(false);
  const [aiEmailLead, setAiEmailLead] = useState<{ id: string; name: string; email: string } | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [saveListOpen, setSaveListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout>();
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }: { col: string }) => sortCol === col ? <span className="ml-1 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  // Open create dialog if navigated with ?create=true
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Open a specific lead's detail sheet if navigated with ?leadId=... (e.g. from the dashboard follow-up feed)
  useEffect(() => {
    const deepLinkId = searchParams.get('leadId');
    if (!deepLinkId) return;
    (async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', deepLinkId).eq('record_type', 'lead').single();
      if (data) openLeadDetail(data as Lead);
      searchParams.delete('leadId');
      setSearchParams(searchParams, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    setSearchTimeout(timeout);
  }, [searchTimeout]);

  const { data: result, isLoading, error } = useLeads({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    industry: industryFilter !== 'all' ? industryFilter : undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    tagLogic,
    page,
    search: debouncedSearch || undefined,
    folderId: activeFolderId !== null ? activeFolderId : undefined,
  });
  const createLead = useCreateLead();
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const convertToCustomer = useConvertLeadToCustomer();
  const updateScore = useUpdateLeadScore();
  const { data: allDeals } = useDeals();
  const { data: allTags } = useAllLeadTags();
  const { data: savedFilters } = useSavedLeadFilters();
  const createSavedFilter = useCreateSavedFilter();
  const deleteSavedFilter = useDeleteSavedFilter();
  const { data: folders } = useLeadFolders();
  const createFolder = useCreateLeadFolder();
  const deleteFolder = useDeleteLeadFolder();
  const moveToFolder = useMoveLeadToFolder();
  const bulkDelete = useBulkDeleteLeads();
  const bulkUpdate = useBulkUpdateLeads();
  const allLeads = result?.data ?? [];
  const leads = useMemo(() => {
    const sorted = [...allLeads];
    sorted.sort((a: Lead, b: Lead) => {
      let aVal: unknown = a[sortCol as keyof Lead] ?? '';
      let bVal: unknown = b[sortCol as keyof Lead] ?? '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [allLeads, sortCol, sortDir]);
  const totalCount = result?.count ?? 0;
  const pageSize = result?.pageSize ?? 100;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const statusLabels: Record<string, string> = {
    new: t('pages.leads.statusNew'), contacted: t('pages.leads.statusContacted'),
    qualified: t('pages.leads.statusQualified'), unqualified: t('pages.leads.statusUnqualified'),
    customer: t('pages.leads.statusCustomer') || 'Customer',
  };

  const relatedDeals = selectedLead ? (allDeals ?? []).filter((d: Deal) => d.customer_id === selectedLead.id || d.notes?.includes(selectedLead.name)) : [];

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setEditNotes(lead.notes || '');
    setEditPhone(lead.phone || '');
    setEditCompany(lead.company_name || '');
    setEditTags(lead.tags || []);
    setEditIndustry(lead.industry || '');
  };

  const handleSaveLead = async () => {
    if (!selectedLead) return;
    try {
      await updateLead.mutateAsync({ id: selectedLead.id, data: { notes: editNotes, phone: editPhone, company_name: editCompany, tags: editTags, industry: editIndustry || null } });
      setSelectedLead({ ...selectedLead, notes: editNotes, phone: editPhone, company_name: editCompany, tags: editTags, industry: editIndustry });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  const handleScoreChange = async (leadId: string, score: number) => {
    try {
      await updateScore.mutateAsync({ id: leadId, score });
      if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, score });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  const handleCreate = async () => {
    const errors: { name?: string; email?: string } = {};
    if (!newLead.name.trim()) errors.name = t('pages.leads.nameRequired');
    if (!newLead.email.trim()) errors.email = t('pages.leads.emailRequired') || 'Email is required';
    else if (!/^[^@]+@[^@]+\.[^@]+$/.test(newLead.email)) errors.email = t('pages.leads.emailInvalid') || 'Invalid email';
    if (Object.keys(errors).length > 0) { setCreateErrors(errors); return; }
    setCreateErrors({});
    try {
      await createLead.mutateAsync(newLead);
      toast.success(t('pages.leads.created_success'));
      setNewLead({ name: '', email: '', phone: '', company_name: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('pages.leads.created_error')); }
  };

  const handleStatusChange = async (id: string, status: Enums<'lead_status'>) => {
    try {
      await updateLead.mutateAsync({ id, data: { status } });
      if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, status });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setNewTagInput('');
  };

  const removeTag = (tag: string) => setEditTags(editTags.filter(t => t !== tag));

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setPage(0);
  };

  const handleSaveList = async () => {
    if (!newListName.trim()) return;
    try {
      await createSavedFilter.mutateAsync({
        name: newListName.trim(),
        filters: { status: statusFilter, industry: industryFilter, tags: selectedTags, tagLogic, search: debouncedSearch },
      });
      toast.success(t('pages.leads.listSaved'));
      setNewListName('');
      setSaveListOpen(false);
    } catch { toast.error(t('common.error')); }
  };

  const applyList = (filter: SavedFilter) => {
    const f = filter.filters as { status?: string; industry?: string; tags?: string[]; tagLogic?: 'and' | 'or'; search?: string };
    setStatusFilter(f.status || 'all');
    setIndustryFilter(f.industry || 'all');
    setSelectedTags(f.tags || []);
    setTagLogic(f.tagLogic || 'or');
    setSearch(f.search || '');
    setDebouncedSearch(f.search || '');
    setActiveListId(filter.id);
    setPage(0);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragging(false); }, []);
  const autoImportCsv = useCallback(async (file: File) => {
    setAutoImporting(true);
    setAutoImportProgress(t('pages.leads.parsingCsv') || 'Parser CSV...');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV filen skal have mindst én header og én data-række'); return; }

      const firstLine = lines[0];
      const semicolons = (firstLine.match(/;/g) || []).length;
      const commas = (firstLine.match(/,/g) || []).length;
      const delimiter = semicolons > commas ? ';' : ',';

      const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = vals[i] || ''; });
        return row;
      }).filter(r => Object.values(r).some(v => v));

      // Auto-map columns
      const aliases: Record<string, string[]> = {
        name: ['name', 'navn', 'full_name', 'kontakt', 'contact', 'lead'],
        email: ['email', 'e-mail', 'mail', 'e_mail'],
        phone: ['phone', 'telefon', 'tel', 'mobil', 'mobile'],
        company_name: ['company', 'firma', 'virksomhed', 'company_name', 'organization'],
        value: ['value', 'værdi', 'amount', 'beløb', 'deal_value'],
        currency: ['currency', 'valuta'],
        notes: ['notes', 'noter', 'comment', 'kommentar', 'description', 'beskrivelse'],
        score: ['score', 'rating', 'priority', 'prioritet'],
        industry: ['industry', 'branche', 'kategori', 'category', 'sector', 'sektor'],
        tags: ['tags', 'labels', 'etiketter', 'tag'],
      };
      const autoMap: Record<string, string> = {};
      for (const h of headers) {
        const lower = h.toLowerCase();
        for (const [field, keys] of Object.entries(aliases)) {
          if (keys.some(k => lower.includes(k)) && !Object.values(autoMap).includes(field)) {
            autoMap[h] = field;
            break;
          }
        }
      }

      const mappedFields = Object.values(autoMap).filter(Boolean);
      if (!mappedFields.includes('name') || !mappedFields.includes('email')) {
        toast.error(t('pages.leads.csvMissingFields') || 'CSV mangler name/email kolonner — brug manuel import');
        setIsImportOpen(true);
        return;
      }

      // Step 1: Verify emails via Reacher
      const emailField = Object.entries(autoMap).find(([, v]) => v === 'email')?.[0];
      const allEmails = emailField ? rows.map(r => r[emailField]).filter(Boolean) : [];

      let validEmails: Set<string> | null = null;
      if (allEmails.length > 0) {
        setAutoImportProgress(`Verificerer ${allEmails.length} emails (maks 60s)...`);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60000);
          const { data: verifyData } = await supabase.functions.invoke('verify-emails', {
            body: { emails: allEmails },
          });
          clearTimeout(timeout);
          if (verifyData?.results) {
            validEmails = new Set(
              (verifyData.results as { valid: boolean; email: string }[]).filter((r) => r.valid).map((r) => r.email)
            );
            const invalidCount = allEmails.length - validEmails.size;
            if (invalidCount > 0) {
              toast.info(`📧 ${validEmails.size} gyldige · ${invalidCount} ugyldige emails fjernet`, { duration: 4000 });
            }
          }
        } catch (verifyErr) {
          if (verifyErr instanceof Error && verifyErr.name === 'AbortError') {
            toast.warning('Email-verificering tog for lang tid — fortsætter uden', { duration: 3000 });
          }
          console.warn('Email verification fejlede, fortsætter uden:', verifyErr);
        }
      }

      // Step 2: Filter out invalid emails
      const filteredRows = validEmails && emailField
        ? rows.filter(r => validEmails!.has(r[emailField]))
        : rows;

      if (filteredRows.length === 0) {
        toast.error('Ingen gyldige emails fundet — import afbrudt');
        return;
      }

      setAutoImportProgress(`Importerer ${filteredRows.length} leads med AI-klassificering...`);

      const { data, error } = await supabase.functions.invoke('csv-import-leads', {
        body: { rows: filteredRows, mapping: autoMap, useAi: true },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      const result = data;
      const removedCount = rows.length - filteredRows.length;
      toast.success(
        `✅ ${result.imported} leads importeret${removedCount > 0 ? ` · ${removedCount} ugyldige emails fjernet` : ''}${result.duplicates > 0 ? ` · ${result.duplicates} dubletter` : ''}${result.ai_classified ? ' · AI-klassificeret' : ''}`,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Auto-import fejlede');
    } finally {
      setAutoImporting(false);
      setAutoImportProgress('');
    }
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.type.includes('csv') || file.type.includes('text'))) {
      autoImportCsv(file);
    } else if (file) { toast.error(t('pages.leads.csvOnly') || 'Only CSV files supported'); }
  }, [autoImportCsv, t]);

  const exportCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Industry', 'Status', 'Score', 'Tags', 'Created'];
    const rows = leads.map((l: Lead) => [
      l.name, l.email, l.phone || '', l.company_name || '', l.industry || '',
      l.status, l.score ?? '', (l.tags || []).join('; '), l.created_at?.split('T')[0] || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const folderName = activeFolderId ? (folders ?? []).find((f: LeadFolder) => f.id === activeFolderId)?.name : null;
    const fileName = folderName
      ? `leads-${folderName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
      : `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    toast.success(t('pages.leads.exported') || 'Exported!');
  };

  const hasActiveFilters = statusFilter !== 'all' || industryFilter !== 'all' || selectedTags.length > 0;

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{t('common.error')}: {error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 text-center shadow-xl">
            <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-primary" />
            <p className="text-xl font-bold text-foreground">{t('pages.leads.dropCsv') || 'Drop CSV here'}</p>
          </div>
        </div>
      )}
      {autoImporting && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border rounded-2xl p-12 text-center shadow-xl space-y-4">
            <div className="animate-spin h-10 w-10 border-3 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-lg font-semibold text-foreground">{autoImportProgress}</p>
            <p className="text-sm text-muted-foreground">{t('pages.leads.aiClassifying')}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('pages.leads.title')}</h1>
          <p className="text-sm text-muted-foreground">{totalCount} {t('pages.leads.total')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={leads.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> {t('pages.leads.export') || 'Export'}
          </Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> {t('pages.leads.import')}
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> {t('pages.leads.addLead')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('pages.leads.addLead')}</DialogTitle>
                <DialogDescription>{t('pages.leads.addLeadDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t('common.name')} *</Label>
                  <Input value={newLead.name} onChange={e => { setNewLead(p => ({ ...p, name: e.target.value })); setCreateErrors(prev => ({ ...prev, name: undefined })); }} className={createErrors.name ? 'border-destructive' : ''} />
                  {createErrors.name && <p className="text-xs text-destructive mt-1">{createErrors.name}</p>}
                </div>
                <div>
                  <Label>{t('common.email')} *</Label>
                  <Input type="email" value={newLead.email} onChange={e => { setNewLead(p => ({ ...p, email: e.target.value })); setCreateErrors(prev => ({ ...prev, email: undefined })); }} className={createErrors.email ? 'border-destructive' : ''} />
                  {createErrors.email && <p className="text-xs text-destructive mt-1">{createErrors.email}</p>}
                </div>
                <div><Label>{t('common.phone')}</Label><Input value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><Label>{t('pages.leads.company')}</Label><Input value={newLead.company_name} onChange={e => setNewLead(p => ({ ...p, company_name: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={createLead.isPending} className="w-full">
                  {createLead.isPending ? t('common.saving') : t('pages.leads.addLead')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Smart list tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => { setActiveListId(null); setStatusFilter('all'); setIndustryFilter('all'); setSelectedTags([]); setSearch(''); setDebouncedSearch(''); setPage(0); }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${!activeListId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          {t('pages.leads.allLeads')}
        </button>
        {(savedFilters ?? []).map((sf: SavedFilter) => (
          <div key={sf.id} className="flex items-center gap-0.5 group">
            <button
              onClick={() => applyList(sf)}
              className={`px-3 py-1.5 rounded-l-full text-sm font-medium whitespace-nowrap transition-colors ${activeListId === sf.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {sf.name}
            </button>
            <button
              onClick={() => { deleteSavedFilter.mutate(sf.id); if (activeListId === sf.id) setActiveListId(null); toast.success(t('pages.leads.listDeleted')); }}
              className={`px-1.5 py-1.5 rounded-r-full text-xs opacity-0 group-hover:opacity-100 transition-opacity ${activeListId === sf.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground'}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Folders */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <button
          onClick={() => { setActiveFolderId(null); setPage(0); }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${!activeFolderId ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          {t('pages.leads.allLeads')}
        </button>
        {(folders ?? []).map((folder: LeadFolder) => (
          <div key={folder.id} className="flex items-center gap-0.5 group">
            <button
              onClick={() => { setActiveFolderId(activeFolderId === folder.id ? null : folder.id); setPage(0); }}
              className={`px-3 py-1.5 rounded-l-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeFolderId === folder.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              <FolderOpen className="h-3.5 w-3.5" style={{ color: folder.color }} />
              {folder.name}
            </button>
            <button
              onClick={() => { deleteFolder.mutate(folder.id); if (activeFolderId === folder.id) setActiveFolderId(null); toast.success(t('pages.leads.folderDeleted')); }}
              className="px-1.5 py-1.5 rounded-r-full text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {showNewFolderInput ? (
          <div className="flex items-center gap-1">
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder={t('pages.leads.folderNamePlaceholder')}
              className="h-7 w-32 text-xs"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && newFolderName.trim().length >= 2) {
                  createFolder.mutate({ name: newFolderName.trim() }, {
                    onSuccess: () => { setNewFolderName(''); setShowNewFolderInput(false); toast.success(t('pages.leads.folderCreated')); },
                    onError: (err) => toast.error(err.message),
                  });
                } else if (e.key === 'Enter' && newFolderName.trim().length < 2) {
                  toast.error('Folder name must be at least 2 characters');
                }
                if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setShowNewFolderInput(true)}>
            <FolderPlus className="h-3.5 w-3.5" /> {t('pages.leads.newFolder')}
          </Button>
        )}
      </div>

      {/* Search & status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('pages.leads.search')} className="pl-10" value={search} onChange={e => handleSearchChange(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pages.leads.statusLabel')}</Label>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('pages.leads.industry')}</Label>
          <Select value={industryFilter} onValueChange={v => { setIndustryFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('pages.leads.industry')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {INDUSTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{t(`pages.leads.${o.labelKey}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tag filter bar - always visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tag className="h-4 w-4 text-muted-foreground" />
        {(allTags ?? []).map(tag => (
          <button
            key={tag}
            onClick={() => toggleTagFilter(tag)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              selectedTags.includes(tag)
                ? 'ring-2 ring-primary ring-offset-1 ring-offset-background ' + getTagColor(tag)
                : getTagColor(tag) + ' opacity-70 hover:opacity-100'
            }`}
          >
            {tag}
          </button>
        ))}
        {selectedTags.length > 1 && (
          <button
            onClick={() => setTagLogic(prev => prev === 'or' ? 'and' : 'or')}
            className="px-2 py-1 rounded-md text-xs font-bold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            {t(`pages.leads.tagLogic${tagLogic === 'and' ? 'And' : 'Or'}`)}
          </button>
        )}
        {selectedTags.length > 0 && (
          <button onClick={() => { setSelectedTags([]); setPage(0); }} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center gap-1 ml-1">
          <Input
            value={newFilterTagInput}
            onChange={e => setNewFilterTagInput(e.target.value)}
            placeholder={t('pages.leads.createTag') || 'New tag…'}
            className="h-7 w-28 text-xs"
            onKeyDown={e => {
              if (e.key === 'Enter' && newFilterTagInput.trim()) {
                const tag = newFilterTagInput.trim();
                if (!(allTags ?? []).includes(tag)) {
                  toggleTagFilter(tag);
                }
                setNewFilterTagInput('');
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!newFilterTagInput.trim()}
            onClick={() => {
              const tag = newFilterTagInput.trim();
              if (tag && !(allTags ?? []).includes(tag)) {
                toggleTagFilter(tag);
              }
              setNewFilterTagInput('');
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {(allTags ?? []).length === 0 && !newFilterTagInput && (
          <span className="text-xs text-muted-foreground italic">{t('pages.leads.noTagsYet') || 'No tags yet – create one or add tags to leads'}</span>
        )}
      </div>

      {/* Save as list button */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          {!saveListOpen ? (
            <Button variant="outline" size="sm" onClick={() => setSaveListOpen(true)} className="gap-1.5">
              <BookmarkPlus className="h-3.5 w-3.5" /> {t('pages.leads.saveAsList')}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder={t('pages.leads.listNamePlaceholder')}
                className="h-8 w-48 text-sm"
                onKeyDown={e => { if (e.key === 'Enter') handleSaveList(); if (e.key === 'Escape') setSaveListOpen(false); }}
                autoFocus
              />
              <Button size="sm" className="h-8" onClick={handleSaveList} disabled={!newListName.trim() || createSavedFilter.isPending}>
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setSaveListOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <span className="text-sm font-medium">{selectedIds.size} {t('pages.leads.selected')}</span>
          <Select onValueChange={v => {
            bulkUpdate.mutate({ ids: Array.from(selectedIds), data: { status: v } }, {
              onSuccess: () => { toast.success(t('pages.leads.bulkStatusUpdated')); setSelectedIds(new Set()); },
              onError: () => toast.error(t('common.error')),
            });
          }}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder={t('pages.leads.bulkSetStatus')} /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={v => {
            const folderId = v === '__none__' ? null : v;
            bulkUpdate.mutate({ ids: Array.from(selectedIds), data: { folder_id: folderId } }, {
              onSuccess: () => { toast.success(t('pages.leads.bulkMoved')); setSelectedIds(new Set()); },
              onError: () => toast.error(t('common.error')),
            });
          }}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder={t('pages.leads.bulkMoveFolder')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('pages.leads.noFolder')}</SelectItem>
              {(folders ?? []).map((f: LeadFolder) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> {t('pages.leads.bulkDelete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
                <AlertDialogDescription>{`${t('pages.leads.bulkDeleteDesc')} (${selectedIds.size})`}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDelete.mutate(Array.from(selectedIds), {
                    onSuccess: () => { toast.success(t('pages.leads.bulkDeleted')); setSelectedIds(new Set()); },
                    onError: () => toast.error(t('common.error')),
                  })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : leads.length === 0 ? (
            <EmptyState
              bare
              icon={Search}
              title={t('pages.leads.noLeads')}
              action={{ label: t('pages.leads.addLead'), onClick: () => setIsCreateOpen(true), icon: Plus }}
              secondaryAction={{ label: t('pages.leads.import'), onClick: () => setIsImportOpen(true), icon: Upload }}
            />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onCheckedChange={checked => {
                        if (checked) {
                          setSelectedIds(new Set(leads.map((l: Lead) => l.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>{t('common.name')}<SortIcon col="name" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('email')}>{t('common.email')}<SortIcon col="email" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('phone')}>{t('common.phone')}<SortIcon col="phone" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('company_name')}>{t('pages.leads.company')}<SortIcon col="company_name" /></TableHead>
                  <TableHead>{t('pages.leads.status')}</TableHead>
                  <TableHead>{t('pages.leads.owner')}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('score')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center">{t('pages.leads.score')}<SortIcon col="score" /></span>
                      </TooltipTrigger>
                      <TooltipContent>{t('pages.leads.scoreManualHint')}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('value')}>{t('pages.leads.value')}<SortIcon col="value" /></TableHead>
                  <TableHead>{t('pages.leads.lastTouched')}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map(lead => (
                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openLeadDetail(lead)}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={checked => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(lead.id); else next.delete(lead.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{lead.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{lead.phone}</span>
                        </div>
                      ) : '–'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.company_name || '–'}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select value={lead.status} onValueChange={(v: Enums<'lead_status'>) => handleStatusChange(lead.id, v)}>
                        <SelectTrigger className="h-7 w-auto border-0 p-0">
                          <Badge className={statusColors[lead.status] || 'bg-muted text-muted-foreground'}>
                            {statusLabels[lead.status] || lead.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.owner?.full_name || lead.owner?.email || '–'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5" title={t('pages.leads.scoreManualHint')}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} onClick={e => { e.stopPropagation(); handleScoreChange(lead.id, s); }} className="p-0">
                            <Star className={`h-3.5 w-3.5 ${s <= (lead.score ?? 0) ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
                          </button>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.value ? `${lead.value.toLocaleString()} kr.` : '–'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.last_touched_at ? new Date(lead.last_touched_at).toLocaleDateString() : '–'}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('common.confirmDeleteDesc')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteLead.mutate(lead.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              {t('common.delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} {t('common.of') || 'of'} {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={open => { if (!open) setSelectedLead(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl">{selectedLead.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span>{selectedLead.email}</span></div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('common.phone')}</Label>
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder={t('common.phone')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('pages.leads.company')}</Label>
                    <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder={t('pages.leads.company')} />
                  </div>
                </div>

                {/* Industry */}
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.leads.industry')}</Label>
                  <Select value={editIndustry || 'none'} onValueChange={v => setEditIndustry(v === 'none' ? '' : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={t('pages.leads.selectIndustry')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {INDUSTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{t(`pages.leads.${o.labelKey}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Folder */}
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.leads.folder')}</Label>
                  <Select
                    value={selectedLead.folder_id || 'none'}
                    onValueChange={v => {
                      const folderId = v === 'none' ? null : v;
                      moveToFolder.mutate({ leadId: selectedLead.id, folderId }, {
                        onSuccess: () => {
                          setSelectedLead({ ...selectedLead, folder_id: folderId });
                          toast.success(t('pages.leads.leadMoved'));
                        },
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder={t('pages.leads.selectFolder')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('pages.leads.noFolder')}</SelectItem>
                      {(folders ?? []).map((f: LeadFolder) => (
                        <SelectItem key={f.id} value={f.id}>
                          <span className="flex items-center gap-1.5">
                            <FolderOpen className="h-3.5 w-3.5" style={{ color: f.color }} />
                            {f.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tags */}
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.leads.tags')}</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {editTags.map(tag => (
                      <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}>
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      placeholder={t('pages.leads.tagsPlaceholder')}
                      className="h-8 text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTagInput); } }}
                    />
                    <Button variant="outline" size="sm" className="h-8" onClick={() => addTag(newTagInput)} disabled={!newTagInput.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Suggested tags from existing */}
                  {(allTags ?? []).filter(t => !editTags.includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(allTags ?? []).filter(t => !editTags.includes(t)).slice(0, 8).map(tag => (
                        <button key={tag} onClick={() => setEditTags([...editTags, tag])} className={`px-2 py-0.5 rounded-full text-[10px] font-medium opacity-50 hover:opacity-100 transition-opacity ${getTagColor(tag)}`}>
                          + {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status & Score */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.leads.status')}</Label>
                    <Select value={selectedLead.status} onValueChange={(v: Enums<'lead_status'>) => handleStatusChange(selectedLead.id, v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.leads.score')}</Label>
                    <div className="flex items-center gap-1 mt-2">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} onClick={() => handleScoreChange(selectedLead.id, s)}>
                          <Star className={`h-5 w-5 ${s <= (selectedLead.score ?? 0) ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Value */}
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    {t('pages.leads.estimatedValue') || 'Estimated Deal Value'}
                  </Label>
                  <p className="text-lg font-semibold">{selectedLead.value ? `${Number(selectedLead.value).toLocaleString()} ${selectedLead.currency || 'DKK'}` : '–'}</p>
                </div>

                {/* AI Relationship Summary */}
                <LeadAiSummaryPanel leadId={selectedLead.id} />

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('pages.leads.notes') || 'Notes'}</Label>
                  <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder={t('pages.leads.notesPlaceholder') || 'Add notes...'} rows={4} />
                </div>

                {/* Related Deals */}
                {relatedDeals.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('pages.deals.title')}</Label>
                    {relatedDeals.map((d: Deal) => (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{d.title}</span>
                        <Badge variant="outline" className="ml-auto text-xs">{d.stage}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{t('common.created')}: {new Date(selectedLead.created_at).toLocaleDateString()}</p>
                  {selectedLead.last_touched_at && <p>{t('pages.leads.lastTouched') || 'Last activity'}: {new Date(selectedLead.last_touched_at).toLocaleDateString()}</p>}
                </div>

                {/* Convert to Deal — creates a real linked customer record first,
                    not just a pre-filled name/value on an orphan deal */}
                <Button
                  variant="default"
                  className="w-full gap-2"
                  disabled={convertToCustomer.isPending}
                  onClick={async () => {
                    const locale = isLocale(params.locale) ? params.locale : 'en';
                    try {
                      const customer = await convertToCustomer.mutateAsync({
                        id: selectedLead.id,
                        name: selectedLead.name,
                        email: selectedLead.email,
                        phone: selectedLead.phone,
                        company_name: selectedLead.company_name,
                        address: selectedLead.address,
                        city: selectedLead.city,
                        company_id: selectedLead.company_id,
                        created_by: selectedLead.created_by,
                      });
                      navigate(`/${locale}/app/crm/deals?create=true&leadName=${encodeURIComponent(selectedLead.name)}&leadValue=${selectedLead.value || 0}&customer=${customer.id}`);
                    } catch {
                      toast.error(t('common.error'));
                    }
                  }}
                >
                  <Briefcase className="h-4 w-4" /> {t('pages.leads.convertToDeal') || 'Convert to Deal →'}
                </Button>

                {/* AI Email Writer button */}
                <Button variant="outline" className="w-full gap-2" onClick={() => { setAiEmailLead({ id: selectedLead.id, name: selectedLead.name, email: selectedLead.email }); setAiEmailOpen(true); }}>
                  <Sparkles className="h-4 w-4" /> AI Email Writer
                </Button>

                {/* Save */}
                <Button onClick={handleSaveLead} disabled={updateLead.isPending} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {updateLead.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CsvImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} />

      {/* AI Email Writer */}
      {aiEmailLead && (
        <AIEmailWriter
          open={aiEmailOpen}
          onOpenChange={setAiEmailOpen}
          leadId={aiEmailLead.id}
          leadName={aiEmailLead.name}
          leadEmail={aiEmailLead.email}
        />
      )}
    </div>
  );
}
