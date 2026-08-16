import { useState } from 'react';
import { useTasks, useCreateTask, useUpdateTask, useTeamProfiles } from '@/hooks/api/useTasks';
import { useLeads } from '@/hooks/api/useLeads';
import { useDeals } from '@/hooks/api/useDeals';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Clock, CheckCircle, AlertCircle, User } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

type Task = { id: string; title: string; description?: string | null; status: string; due_date?: string | null; priority?: string | null; assigned_to?: string | null; completed_at?: string | null; created_at: string; assigned_profile?: { full_name: string | null; email: string } | null; };

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;

export default function TasksPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', priority: 'medium', assigned_to: '', lead_id: '', deal_id: '' });

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-primary/15 text-primary',
    high: 'bg-warning/15 text-warning',
    urgent: 'bg-destructive/15 text-destructive',
  };
  const priorityLabels: Record<string, string> = {
    low: t('pages.tasks.priorityLow'),
    medium: t('pages.tasks.priorityMedium'),
    high: t('pages.tasks.priorityHigh'),
    urgent: t('pages.tasks.priorityUrgent'),
  };
  const statusColors: Record<string, string> = {
    pending: 'bg-warning/15 text-warning',
    in_progress: 'bg-primary/15 text-primary',
    completed: 'bg-success/15 text-success',
  };
  const statusLabels: Record<string, string> = {
    pending: t('pages.tasks.pending'),
    in_progress: t('pages.tasks.inProgress'),
    completed: t('pages.tasks.completed'),
  };

  const { data: leadsData } = useLeads({ page: 0 });
  const { data: dealsData } = useDeals();
  const { data: teamProfiles } = useTeamProfiles();
  const { data, isLoading, error } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const filteredTasks = (data ?? []).filter(task => task.title.toLowerCase().includes(search.toLowerCase()));
  const pendingTasks = filteredTasks.filter(t => t.status === 'pending');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');

  const handleCreate = async () => {
    if (!newTask.title) { toast.error(t('pages.tasks.titleRequired')); return; }
    try {
      await createTask.mutateAsync({
        ...newTask,
        assigned_to: newTask.assigned_to || undefined,
        lead_id: newTask.lead_id || undefined,
        deal_id: newTask.deal_id || undefined,
      });
      toast.success(t('pages.tasks.created_success'));
      setNewTask({ title: '', description: '', due_date: '', priority: 'medium', assigned_to: '', lead_id: '', deal_id: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('pages.tasks.created_error')); }
  };

  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTask.mutateAsync({ id: task.id, data: { status: newStatus } });
      toast.success(newStatus === 'completed' ? t('pages.tasks.taskCompleted') : t('pages.tasks.taskReopened'));
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    try {
      await updateTask.mutateAsync({ id: task.id, data: { status: newStatus } });
      toast.success(t('pages.tasks.created_success'));
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
    const assigneeName = task.assigned_profile?.full_name;
    return (
      <Card className={`transition-all ${task.status === 'completed' ? 'opacity-60' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox checked={task.status === 'completed'} onCheckedChange={() => handleToggleComplete(task)} className="mt-1" aria-label={`${t('pages.tasks.completed')}: ${task.title}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                <Badge className={statusColors[task.status]} variant="secondary">{statusLabels[task.status]}</Badge>
                {task.priority && task.priority !== 'medium' && (
                  <Badge className={priorityColors[task.priority] || ''} variant="secondary">{priorityLabels[task.priority] || task.priority}</Badge>
                )}
              </div>
              {task.description && <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {assigneeName && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {assigneeName}
                  </div>
                )}
                {task.due_date && (
                  <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {new Date(task.due_date).toLocaleDateString()}
                  </div>
                )}
                {task.status !== 'completed' && (
                  <Select value={task.status} onValueChange={(v) => handleStatusChange(task, v)}>
                    <SelectTrigger className="h-6 text-xs w-auto min-w-[100px] border-dashed">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t('pages.tasks.pending')}</SelectItem>
                      <SelectItem value="in_progress">{t('pages.tasks.inProgress')}</SelectItem>
                      <SelectItem value="completed">{t('pages.tasks.completed')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.tasks.title')}</h1>
          <p className="text-muted-foreground">{t('pages.tasks.subtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('pages.tasks.newTask')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('pages.tasks.createTitle')}</DialogTitle>
              <DialogDescription>{t('pages.tasks.createSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="title">{t('pages.tasks.titleLabel')} *</Label><Input id="title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder={t('pages.tasks.titlePlaceholder')} /></div>
              <div className="space-y-2"><Label htmlFor="description">{t('pages.tasks.descriptionLabel')}</Label><Input id="description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder={t('pages.tasks.descriptionPlaceholder')} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">{t('pages.tasks.priorityLabel')}</Label>
                  <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map(p => (
                        <SelectItem key={p} value={p}>{priorityLabels[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="due_date">{t('pages.tasks.deadline')}</Label><Input id="due_date" type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} /></div>
              </div>
              {/* Assigned to */}
              <div className="space-y-2">
                <Label>{t('pages.tasks.assignedTo') || 'Tildelt til'}</Label>
                <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={t('pages.tasks.selectAssignee') || 'Vælg medarbejder'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(teamProfiles ?? []).map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('nav.leads')}</Label>
                  <Select value={newTask.lead_id} onValueChange={(v) => setNewTask({ ...newTask, lead_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(leadsData?.data || []).slice(0, 50).map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('nav.deals')}</Label>
                  <Select value={newTask.deal_id} onValueChange={(v) => setNewTask({ ...newTask, deal_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(dealsData || []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createTask.isPending} className="w-full">{createTask.isPending ? t('pages.tasks.creating') : t('pages.tasks.createCta')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="h-6 w-6 text-warning" /></div><div><p className="text-sm text-muted-foreground">{t('pages.tasks.pending')}</p><p className="text-2xl font-bold">{pendingTasks.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('pages.tasks.inProgress')}</p><p className="text-2xl font-bold">{inProgressTasks.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">{t('pages.tasks.completed')}</p><p className="text-2xl font-bold">{completedTasks.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('pages.tasks.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Card key={i}><CardContent className="p-4"><div className="flex items-start gap-3"><Skeleton className="h-4 w-4 mt-1" /><div className="flex-1"><Skeleton className="h-5 w-48 mb-2" /><Skeleton className="h-4 w-32" /></div></div></CardContent></Card>))}</div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('pages.tasks.fetchError')}</CardContent></Card>
      ) : filteredTasks.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('pages.tasks.empty')}</CardContent></Card>
      ) : (
        <div className="space-y-3">{filteredTasks.map((task) => (<TaskCard key={task.id} task={task} />))}</div>
      )}
    </div>
  );
}