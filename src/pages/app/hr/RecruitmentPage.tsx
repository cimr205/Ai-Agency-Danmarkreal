import { useState } from 'react';
import { useRecruitment, useCreateRecruitment, useUpdateRecruitmentStatus } from '@/hooks/api/useEmployees';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, UserPlus, Briefcase, Users, CheckCircle } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

const statusColors: Record<string, string> = {
  open: 'bg-success/15 text-success',
  interviewing: 'bg-primary/15 text-primary',
  closed: 'bg-muted text-muted-foreground',
  filled: 'bg-accent/15 text-accent-foreground',
};

export default function RecruitmentPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPosition, setNewPosition] = useState({ position: '' });

  const statusLabels: Record<string, string> = {
    open: t('hr.statusOpen'), interviewing: t('hr.statusInterviewing'),
    closed: t('hr.statusClosed'), filled: t('hr.statusFilled'),
  };

  const { data, isLoading, error } = useRecruitment();
  const createRecruitment = useCreateRecruitment();
  const updateStatus = useUpdateRecruitmentStatus();

  const handleCreate = async () => {
    if (!newPosition.position) { toast.error(t('hr.positionRequired')); return; }
    try {
      await createRecruitment.mutateAsync(newPosition);
      toast.success(t('hr.positionCreated'));
      setNewPosition({ position: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('hr.positionCreateError')); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.success(t('hr.statusUpdated'));
    } catch { toast.error(t('hr.statusUpdateError')); }
  };

  const recs = data ?? [];
  const filteredRecruitment = recs.filter(rec => rec.position.toLowerCase().includes(search.toLowerCase()));
  const openPositions = recs.filter(r => r.status === 'open').length;
  const interviewingPositions = recs.filter(r => r.status === 'interviewing').length;
  const filledPositions = recs.filter(r => r.status === 'filled').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('hr.recruitmentTitle')}</h1>
          <p className="text-muted-foreground">{t('hr.recruitmentSubtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('hr.newPosition')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('hr.createPosition')}</DialogTitle><DialogDescription>{t('hr.createPositionDesc')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>{t('hr.positionLabel')} *</Label><Input value={newPosition.position} onChange={(e) => setNewPosition({ position: e.target.value })} placeholder={t('hr.positionPlaceholder')} /></div>
              <Button onClick={handleCreate} disabled={createRecruitment.isPending} className="w-full">{createRecruitment.isPending ? t('hr.creating') : t('hr.createPosition')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><Briefcase className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">{t('hr.openPositions')}</p><p className="text-2xl font-bold text-success">{openPositions}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.interviewing')}</p><p className="text-2xl font-bold">{interviewingPositions}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center"><CheckCircle className="h-6 w-6 text-accent-foreground" /></div><div><p className="text-sm text-muted-foreground">{t('hr.filled')}</p><p className="text-2xl font-bold">{filledPositions}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><UserPlus className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.total')}</p><p className="text-2xl font-bold">{recs.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchPositionPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('hr.positionLabel')}</TableHead><TableHead>{t('hr.statusLabel')}</TableHead><TableHead>{t('hr.action')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-40" /></TableCell><TableCell><Skeleton className="h-6 w-20" /></TableCell><TableCell><Skeleton className="h-8 w-32" /></TableCell></TableRow>))
            : filteredRecruitment.length === 0 ? (<TableRow><TableCell colSpan={3}>
                <EmptyState
                  bare
                  icon={UserPlus}
                  title={error ? t('hr.fetchRecruitmentError') : t('hr.noPositions')}
                  hint={t('hr.recruitmentGuide') || 'Track open positions and hiring progress. Click "New Position" to start recruiting for a role.'}
                  action={!error ? { label: t('hr.newPosition'), onClick: () => setIsCreateOpen(true), icon: Plus } : undefined}
                />
              </TableCell></TableRow>)
            : filteredRecruitment.map((rec) => (
              <TableRow key={rec.id}>
                <TableCell className="font-medium">{rec.position}</TableCell>
                <TableCell><Badge className={statusColors[rec.status]}>{statusLabels[rec.status]}</Badge></TableCell>
                <TableCell>
                  <Select value={rec.status} onValueChange={(value) => handleStatusChange(rec.id, value)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">{t('hr.statusOpen')}</SelectItem>
                      <SelectItem value="interviewing">{t('hr.statusInterviewing')}</SelectItem>
                      <SelectItem value="filled">{t('hr.statusFilled')}</SelectItem>
                      <SelectItem value="closed">{t('hr.statusClosed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
