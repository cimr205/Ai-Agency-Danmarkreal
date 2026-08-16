import { useState, useCallback, useRef } from 'react';
import { useLeads, useCreateLead, useUpdateLeadScore, useDeleteLead, useUpdateLead } from '@/hooks/api/useLeads';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Lead = Tables<'leads'>;
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Mail, Phone, Star, Upload, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, Download, Building2, Calendar, LayoutGrid, List, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { CsvImportWizard } from '@/components/import/CsvImportWizard';
import { useI18n } from '@/lib/i18n';
import React from 'react';

const statusColors: Record<string, string> = {
  new: 'bg-primary/15 text-primary',
  contacted: 'bg-warning/15 text-warning',
  qualified: 'bg-success/15 text-success',
  customer: 'bg-emerald-500/15 text-emerald-500',
  unqualified: 'bg-muted text-muted-foreground',
};

type SortField = 'created_at' | 'name' | 'status' | 'score';
type SortDir = 'asc' | 'desc';

export default function LeadsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', company_name: '' });
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout>();
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => { setDebouncedSearch(value); setPage(0); }, 300);
    setSearchTimeout(timeout);
  }, [searchTimeout]);

  const { data: result, isLoading, error } = useLeads({
    status: statusFilter !== 'all' ? statusFilter as Enums<'lead_status'> : undefined,
    page,
    search: debouncedSearch || undefined,
  });
  const createLead = useCreateLead();
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const updateScore = useUpdateLeadScore();

  const leads = result?.data ?? [];
  const totalCount = result?.count ?? 0;
  const pageSize = result?.pageSize ?? 50;
  const totalPages = Math.ceil(totalCount / pageSize);

  const statusLabels: Record<string, string> = {
    new: t('pages.leads.statusNew'),
    contacted: t('pages.leads.statusContacted'),
    qualified: t('pages.leads.statusQualified'),
    customer: t('pages.leads.statusCustomer'),
    unqualified: t('pages.leads.statusUnqualified'),
  };

  // Sort leads client-side
  const sortedLeads = [...leads].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'name') return dir * (a.name || '').localeCompare(b.name || '');
    if (sortField === 'status') return dir * (a.status || '').localeCompare(b.status || '');
    if (sortField === 'score') return dir * ((a.score ?? 0) - (b.score ?? 0));
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const handleCreate = async () => {
    if (!newLead.name || !newLead.email) { toast.error(t('pages.leads.nameRequired')); return; }
    try {
      await createLead.mutateAsync(newLead);
      toast.success(t('pages.leads.created_success'));
      setNewLead({ name: '', email: '', phone: '', company_name: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('pages.leads.created_error')); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateLead.mutateAsync({ id, data: { status } });
      toast.success(t('common.saved'));
      if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, status });
    } catch { toast.error(t('common.error')); }
  };

  const handleScoreClick = async (id: string, score: number) => {
    try {
      await updateScore.mutateAsync({ id, score });
      toast.success(t('pages.leads.scoreUpdated'));
      if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, score });
    } catch { toast.error(t('pages.leads.scoreError')); }
  };

  const handleSaveNotes = async () => {
    if (!selectedLead) return;
    try {
      await updateLead.mutateAsync({ id: selectedLead.id, data: { notes: editNotes, status: editStatus } });
      toast.success(t('common.saved'));
      setSelectedLead({ ...selectedLead, notes: editNotes, status: editStatus });
    } catch { toast.error(t('common.error')); }
  };

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setEditNotes(lead.notes || '');
    setEditStatus(lead.status);
  };

  // CSV Export
  const exportCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Score', 'Created'];
    const rows = leads.map(l => [l.name, l.email, l.phone || '', l.company_name || '', l.status, l.score ?? 0, l.created_at?.split('T')[0] || '']);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t('pages.leads.exported'));
  };

  // Drag-and-drop CSV handling
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt') || file.type.includes('csv') || file.type.includes('text'))) {
      setIsImportOpen(true);
      setTimeout(() => { window.dispatchEvent(new CustomEvent('csv-file-drop', { detail: file })); }, 200);
    } else if (file) { toast.error(t('pages.leads.csvOnly')); }
  }, [t]);

  const counts = { total: totalCount, qualified: leads.filter(l => l.status === 'qualified').length, customer: leads.filter(l => l.status === 'customer').length };
  const conversionRate = counts.total ? Math.round(((counts.qualified + counts.customer) / counts.total) * 100) : 0;

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{t('common.error')}: {error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 text-center shadow-xl">
            <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-primary" />
            <p className="text-xl font-bold text-foreground">{t('pages.leads.dropCSV')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('pages.leads.title')}</h1>
          <p className="text-sm text-muted-foreground">{totalCount} {t('pages.leads.total')} · {conversionRate}% {t('pages.leads.conversionRate').toLowerCase()}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={leads.length === 0} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> {t('pages.leads.export')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> {t('pages.leads.import')}
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> {t('pages.leads.addLead')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('pages.leads.addLead')}</DialogTitle>
                <DialogDescription>{t('pages.leads.addLeadDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div><Label>{t('common.name')} *</Label><Input value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} required /></div>
                <div><Label>{t('common.email')} *</Label><Input type="email" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} required /></div>
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

      {/* Filters + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t('pages.leads.search')} className="pl-10" value={search} onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
          <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('table')}><List className="h-3.5 w-3.5" /></Button>
          <Button variant={viewMode === 'cards' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('cards')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : leads.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center space-y-3">
            <Search className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">{t('pages.leads.noLeads')}</p>
            <p className="text-sm text-muted-foreground">{t('pages.leads.emptyHint')}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> {t('pages.leads.import')}
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> {t('pages.leads.addLead')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="rounded-2xl">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                    {t('common.name')} <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />
                  </TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('pages.leads.company')}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    {t('pages.leads.status')} <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('score')}>
                    {t('pages.leads.score')} <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('created_at')}>
                    {t('pages.leads.created')} <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />
                  </TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLeads.map(lead => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(lead)}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[180px]">{lead.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.company_name || '–'}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[lead.status] || 'bg-muted text-muted-foreground'}>
                        {statusLabels[lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star
                            key={s}
                            className={`h-3 w-3 cursor-pointer transition-colors ${(lead.score ?? 0) >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30 hover:text-warning/50'}`}
                            onClick={(e) => { e.stopPropagation(); handleScoreClick(lead.id, s); }}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={e => e.stopPropagation()}>
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
          </CardContent>
        </Card>
      ) : (
        /* Card grid view */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedLeads.map(lead => {
            const cfg = statusLabels[lead.status] || lead.status;
            return (
              <Card key={lead.id} className="rounded-xl cursor-pointer hover:shadow-md transition-all" onClick={() => openDetail(lead)}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{lead.name}</h3>
                      {lead.company_name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{lead.company_name}</span>
                        </div>
                      )}
                    </div>
                    <Badge className={`${statusColors[lead.status] || 'bg-muted text-muted-foreground'} shrink-0 text-[10px]`}>{cfg}</Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground truncate"><Mail className="h-3 w-3 shrink-0" />{lead.email}</div>
                    {lead.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />{lead.phone}</div>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`h-3 w-3 cursor-pointer ${(lead.score ?? 0) >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
                          onClick={(e) => { e.stopPropagation(); handleScoreClick(lead.id, s); }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{new Date(lead.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('common.page')} {page + 1} / {totalPages} ({totalCount} {t('common.results')})</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => { if (!open) setSelectedLead(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl">{selectedLead.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Contact info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={`mailto:${selectedLead.email}`} className="text-primary hover:underline truncate">{selectedLead.email}</a>
                  </div>
                  {selectedLead.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${selectedLead.phone}`} className="hover:underline">{selectedLead.phone}</a>
                    </div>
                  )}
                  {selectedLead.company_name && (
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{selectedLead.company_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{t('pages.leads.created')}: {new Date(selectedLead.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Score */}
                <div className="space-y-2">
                  <Label>{t('pages.leads.score')}</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        className={`h-5 w-5 cursor-pointer transition-colors ${(selectedLead.score ?? 0) >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30 hover:text-warning/50'}`}
                        onClick={() => handleScoreClick(selectedLead.id, s)}
                      />
                    ))}
                    <span className="text-sm text-muted-foreground ml-2">{selectedLead.score ?? 0}/5</span>
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label>{t('pages.leads.status')}</Label>
                  <Select value={editStatus} onValueChange={(v) => { setEditStatus(v); handleStatusChange(selectedLead.id, v); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Value */}
                {selectedLead.value != null && selectedLead.value > 0 && (
                  <div className="space-y-1">
                    <Label>{t('pages.deals.value')}</Label>
                    <p className="text-lg font-bold text-primary">{selectedLead.value.toLocaleString()} kr</p>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t('pages.leads.notes')}</Label>
                  <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4} placeholder={t('pages.leads.notesPlaceholder')} />
                  <Button size="sm" onClick={handleSaveNotes}>{t('common.save')}</Button>
                </div>

                {/* Delete */}
                <div className="pt-4 border-t border-border/50">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-1.5"><Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('common.confirmDeleteDesc')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { deleteLead.mutate(selectedLead.id); setSelectedLead(null); }} className="bg-destructive text-destructive-foreground">
                          {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* CSV Import */}
      <CsvImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
  );
}
