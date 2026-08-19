import { useState } from 'react';
import { useLeaveRequests, useRequestLeave, useApproveLeave, useRejectLeave, useEmployees } from '@/hooks/api/useEmployees';
import type { Enums } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Calendar, Check, X, Clock } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

const statusColors: Record<string, string> = { pending: 'bg-warning/15 text-warning', approved: 'bg-success/15 text-success', rejected: 'bg-destructive/15 text-destructive' };

export default function LeavePage() {
  const { t, locale } = useI18n();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLeave, setNewLeave] = useState<{ employee_profile_id: string; type: Enums<'leave_type'>; start_date: string; end_date: string }>({ employee_profile_id: '', type: 'vacation', start_date: '', end_date: '' });

  const statusLabels: Record<string, string> = { pending: t('hr.pending'), approved: t('hr.approved'), rejected: t('hr.rejected') };
  const typeLabels: Record<string, string> = { vacation: t('hr.typeVacation'), sick: t('hr.typeSick'), personal: t('hr.typePersonal'), other: t('hr.typeOther') };

  const { data, isLoading, error } = useLeaveRequests();
  const requestLeave = useRequestLeave();
  const approveLeave = useApproveLeave();
  const rejectLeave = useRejectLeave();
  const { data: employees } = useEmployees();

  const leaves = data ?? [];
  const filteredLeave = leaves.filter(leave => (leave.employee_profiles?.full_name || '').toLowerCase().includes(search.toLowerCase()));
  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;

  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  const handleCreate = async () => {
    if (!newLeave.employee_profile_id || !newLeave.start_date || !newLeave.end_date) { toast.error(t('hr.allFieldsRequired')); return; }
    try {
      await requestLeave.mutateAsync(newLeave);
      toast.success(t('hr.requestCreated'));
      setNewLeave({ employee_profile_id: '', type: 'vacation', start_date: '', end_date: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('hr.requestCreateError')); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{t('hr.leaveTitle')}</h1><p className="text-muted-foreground">{t('hr.leaveSubtitle')}</p></div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('hr.newRequest')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('hr.createLeaveRequest')}</DialogTitle><DialogDescription>{t('hr.createLeaveRequestDesc')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('hr.employee')}</Label>
                <Select value={newLeave.employee_profile_id} onValueChange={v => setNewLeave({ ...newLeave, employee_profile_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t('hr.selectEmployee')} /></SelectTrigger>
                  <SelectContent>
                    {(employees ?? []).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position || e.department || e.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('hr.typeLabel')}</Label>
                <Select value={newLeave.type} onValueChange={(value: Enums<'leave_type'>) => setNewLeave({ ...newLeave, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="vacation">{t('hr.typeVacation')}</SelectItem><SelectItem value="sick">{t('hr.typeSick')}</SelectItem><SelectItem value="personal">{t('hr.typePersonal')}</SelectItem><SelectItem value="other">{t('hr.typeOther')}</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t('hr.fromDate')}</Label><Input type="date" value={newLeave.start_date} onChange={(e) => setNewLeave({ ...newLeave, start_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t('hr.toDate')}</Label><Input type="date" value={newLeave.end_date} onChange={(e) => setNewLeave({ ...newLeave, end_date: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} disabled={requestLeave.isPending} className="w-full">{requestLeave.isPending ? t('hr.creatingRequest') : t('hr.createRequest')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="h-6 w-6 text-warning" /></div><div><p className="text-sm text-muted-foreground">{t('hr.awaitingApproval')}</p><p className="text-2xl font-bold">{pendingCount}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><Check className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">{t('hr.approved')}</p><p className="text-2xl font-bold text-success">{approvedCount}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Calendar className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.totalRequests')}</p><p className="text-2xl font-bold">{leaves.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('hr.employee')}</TableHead><TableHead>{t('hr.typeLabel')}</TableHead><TableHead>{t('hr.fromDate').replace(' *', '')}</TableHead><TableHead>{t('hr.toDate').replace(' *', '')}</TableHead><TableHead>{t('hr.statusLabel')}</TableHead>{isAdmin && <TableHead>{t('hr.action')}</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-6 w-20" /></TableCell>{isAdmin && <TableCell><Skeleton className="h-8 w-24" /></TableCell>}</TableRow>))
            : filteredLeave.length === 0 ? (<TableRow><TableCell colSpan={isAdmin ? 6 : 5}>
                <EmptyState
                  bare
                  icon={Calendar}
                  title={error ? t('hr.fetchLeaveError') : t('hr.noRequests')}
                  hint={t('hr.leaveGuide') || 'Manage vacation, sick days, and personal leave. Click "New Request" to submit a leave request for approval.'}
                  action={!error ? { label: t('hr.newRequest'), onClick: () => setIsCreateOpen(true), icon: Plus } : undefined}
                />
              </TableCell></TableRow>)
            : filteredLeave.map((leave) => (
              <TableRow key={leave.id}>
                <TableCell className="font-medium">{leave.employee_profiles?.full_name || t('hr.unknown')}</TableCell>
                <TableCell>{typeLabels[leave.type]}</TableCell>
                <TableCell>{new Date(leave.start_date).toLocaleDateString(dateLocale)}</TableCell>
                <TableCell>{new Date(leave.end_date).toLocaleDateString(dateLocale)}</TableCell>
                <TableCell><Badge className={statusColors[leave.status]}>{statusLabels[leave.status]}</Badge></TableCell>
                {isAdmin && <TableCell>{leave.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-success" onClick={() => approveLeave.mutateAsync(leave.id)}><Check className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => rejectLeave.mutateAsync(leave.id)}><X className="h-4 w-4" /></Button>
                  </div>
                )}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
