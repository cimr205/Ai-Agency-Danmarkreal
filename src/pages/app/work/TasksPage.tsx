import { useMemo, useState } from 'react';
import { useTasks, useCreateTask, useUpdateTask, useTeamProfiles, useBulkUpdateTasks, useBulkDeleteTasks, useDeleteTask } from '@/hooks/api/useTasks';
import { useAuth } from '@/hooks/useAuth';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Clock, CheckCircle, AlertCircle, User, MoreHorizontal, Archive, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

type Task = {
  id: string; title: string; description?: string | null; status: string;
  due_date?: string | null; priority?: string | null; assigned_to?: string | null;
  completed_at?: string | null; created_at: string; archived: boolean;
  assigned_profile?: { full_name: string | null; email: string } | null;
};

type ViewKey = 'today' | 'upcoming' | 'overdue' | 'mine' | 'all' | 'completed' | 'archived';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function TasksPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewKey>('today');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  const { data, isLoading, error } = useTasks({ archived: view === 'archived' });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const bulkUpdate = useBulkUpdateTasks();
  const bulkDelete = useBulkDeleteTasks();

  const allTasks = (data ?? []) as Task[];

  const viewFiltered = useMemo(() => {
    const now = new Date();
    return allTasks.filter(task => {
      if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (assigneeFilter !== 'all' && task.assigned_to !== assigneeFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

      switch (view) {
        case 'archived': return true;
        case 'completed': return task.status === 'completed';
        case 'mine': return task.assigned_to === profile?.user_id && task.status !== 'completed';
        case 'today': {
          if (task.status === 'completed' || !task.due_date) return false;
          return isSameDay(new Date(task.due_date), now);
        }
        case 'overdue': {
          if (task.status === 'completed' || !task.due_date) return false;
          return new Date(task.due_date) < now && !isSameDay(new Date(task.due_date), now);
        }
        case 'upcoming': {
          if (task.status === 'completed' || !task.due_date) return false;
          return new Date(task.due_date) > now && !isSameDay(new Date(task.due_date), now);
        }
        case 'all':
        default:
          return task.status !== 'completed';
      }
    });
  }, [allTasks, search, assigneeFilter, priorityFilter, view, profile?.user_id]);

  const counts = useMemo(() => {
    const now = new Date();
    const active = allTasks.filter(t => t.status !== 'completed');
    return {
      today: active.filter(t => t.due_date && isSameDay(new Date(t.due_date), now)).length,
      overdue: active.filter(t => t.due_date && new Date(t.due_date) < now && !isSameDay(new Date(t.due_date), now)).length,
      upcoming: active.filter(t => t.due_date && new Date(t.due_date) > now && !isSameDay(new Date(t.due_date), now)).length,
      mine: active.filter(t => t.assigned_to === profile?.user_id).length,
      all: active.length,
      completed: allTasks.filter(t => t.status === 'completed').length,
    };
  }, [allTasks, profile?.user_id]);

  const handleCreate = async () => {
    if (!newTask.title) { toast.error(t('pages.tasks.titleRequired')); return; }
    try {
      await createTask.mutateAsync({
        ...newTask,
        due_date: newTask.due_date || undefined,
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(prev => prev.size === viewFiltered.length ? new Set() : new Set(viewFiltered.map(t => t.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkComplete = async () => {
    try {
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), data: { status: 'completed', completed_at: new Date().toISOString() } });
      toast.success(t('pages.tasks.taskCompleted'));
      clearSelection();
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const handleBulkArchive = async () => {
    try {
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), data: { archived: view !== 'archived' } });
      toast.success('Opdateret');
      clearSelection();
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const handleBulkReassign = async (userId: string) => {
    try {
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), data: { assigned_to: userId } });
      toast.success('Opdateret');
      clearSelection();
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Slet ${selectedIds.size} opgave(r)? Dette kan ikke fortrydes.`)) return;
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      toast.success('Slettet');
      clearSelection();
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Slet denne opgave? Dette kan ikke fortrydes.')) return;
    try {
      await deleteTask.mutateAsync(id);
      toast.success('Slettet');
    } catch { toast.error(t('pages.tasks.updateError')); }
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
    const assigneeName = task.assigned_profile?.full_name;
    return (
      <Card className={`transition-all ${task.status === 'completed' ? 'opacity-60' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox checked={selectedIds.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} className="mt-1" aria-label={`Vælg: ${task.title}`} />
            <Checkbox checked={task.status === 'completed'} onCheckedChange={() => handleToggleComplete(task)} className="mt-1" aria-label={`${t('pages.tasks.completed')}: ${task.title}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                <Badge className={statusColors[task.status]} variant="secondary">{statusLabels[task.status]}</Badge>
                {task.priority && task.priority !== 'medium' && (
                  <Badge className={priorityColors[task.priority] || ''} variant="secondary">{priorityLabels[task.priority] || task.priority}</Badge>
                )}
                {task.archived && <Badge variant="outline">Arkiveret</Badge>}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => updateTask.mutate({ id: task.id, data: { archived: !task.archived } })}>
                  <Archive className="h-3.5 w-3.5 mr-2" />{task.archived ? 'Fjern fra arkiv' : 'Arkivér'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(task.id)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Slet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      <Tabs value={view} onValueChange={(v) => { setView(v as ViewKey); clearSelection(); }}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="today">I dag {counts.today > 0 && `(${counts.today})`}</TabsTrigger>
          <TabsTrigger value="overdue">Forfaldne {counts.overdue > 0 && `(${counts.overdue})`}</TabsTrigger>
          <TabsTrigger value="upcoming">Kommende {counts.upcoming > 0 && `(${counts.upcoming})`}</TabsTrigger>
          <TabsTrigger value="mine">Mine {counts.mine > 0 && `(${counts.mine})`}</TabsTrigger>
          <TabsTrigger value="all">Alle aktive ({counts.all})</TabsTrigger>
          <TabsTrigger value="completed">Fuldførte ({counts.completed})</TabsTrigger>
          <TabsTrigger value="archived">Arkiverede</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('pages.tasks.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Ansvarlig" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ansvarlige</SelectItem>
            {(teamProfiles ?? []).map(p => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Prioritet" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle prioriteter</SelectItem>
            {PRIORITY_OPTIONS.map(p => (
              <SelectItem key={p} value={p}>{priorityLabels[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {viewFiltered.length > 0 && (
        <div className="flex items-center gap-3">
          <Checkbox checked={selectedIds.size > 0 && selectedIds.size === viewFiltered.length} onCheckedChange={selectAllVisible} aria-label="Vælg alle" />
          <span className="text-xs text-muted-foreground">Vælg alle synlige ({viewFiltered.length})</span>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selectedIds.size} valgt</span>
              <Button size="sm" variant="outline" onClick={handleBulkComplete}>Fuldfør</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline">Tildel til</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(teamProfiles ?? []).map(p => (
                    <DropdownMenuItem key={p.user_id} onClick={() => handleBulkReassign(p.user_id)}>{p.full_name || p.email}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" onClick={handleBulkArchive}>{view === 'archived' ? 'Fjern fra arkiv' : 'Arkivér'}</Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>Slet</Button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Card key={i}><CardContent className="p-4"><div className="flex items-start gap-3"><Skeleton className="h-4 w-4 mt-1" /><div className="flex-1"><Skeleton className="h-5 w-48 mb-2" /><Skeleton className="h-4 w-32" /></div></div></CardContent></Card>))}</div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('pages.tasks.fetchError')}</CardContent></Card>
      ) : viewFiltered.length === 0 ? (
        <EmptyState icon={CheckCircle} title={t('pages.tasks.empty')} action={{ label: t('pages.tasks.newTask'), onClick: () => setIsCreateOpen(true), icon: Plus }} />
      ) : (
        <div className="space-y-3">{viewFiltered.map((task) => (<TaskCard key={task.id} task={task} />))}</div>
      )}
    </div>
  );
}
