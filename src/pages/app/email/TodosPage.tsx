/**
 * Todos Page - Connected to tasks table
 * Shows tasks and allows creating/completing/editing/deleting them
 */
import { useState } from 'react';
import { CheckCircle2, Circle, Calendar, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/api';
import type { Tables } from '@/integrations/supabase/types';

type Task = Tables<'tasks'>;

export default function TodosPage() {
  const { data: tasks, isLoading } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  // Edit state
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState('medium');

  const pendingTasks = (tasks || []).filter((t: Task) => t.status !== 'completed');
  const completedTasks = (tasks || []).filter((t: Task) => t.status === 'completed');

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await createTask.mutateAsync({
        title,
        description: description || undefined,
        priority,
        due_date: dueDate || undefined,
      });
      toast.success('Opgave oprettet');
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('medium');
      setIsOpen(false);
    } catch {
      toast.error('Kunne ikke oprette opgave');
    }
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditDueDate(task.due_date || '');
    setEditPriority(task.priority || 'medium');
  };

  const handleEdit = async () => {
    if (!editTask || !editTitle.trim()) return;
    try {
      await updateTask.mutateAsync({
        id: editTask.id,
        data: {
          title: editTitle,
          description: editDescription || null,
          due_date: editDueDate || null,
          priority: editPriority,
        },
      });
      toast.success('Opgave opdateret');
      setEditTask(null);
    } catch {
      toast.error('Kunne ikke opdatere opgave');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await updateTask.mutateAsync({ id, data: { status: 'completed', completed_at: new Date().toISOString() } });
      toast.success('Opgave fuldført');
    } catch {
      toast.error('Kunne ikke opdatere opgave');
    }
  };

  const handleUncomplete = async (id: string) => {
    try {
      await updateTask.mutateAsync({ id, data: { status: 'pending', completed_at: null } });
      toast.success('Opgave genåbnet');
    } catch {
      toast.error('Kunne ikke opdatere opgave');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTask.mutateAsync(id);
      toast.success('Opgave slettet');
    } catch {
      toast.error('Kunne ikke slette opgave');
    }
  };

  const priorityColors: Record<string, string> = {
    high: 'text-destructive',
    medium: 'text-orange-500',
    low: 'text-muted-foreground',
  };
  const priorityLabels: Record<string, string> = { high: 'Høj', medium: 'Medium', low: 'Lav' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dagens To-dos</h1>
          <p className="text-muted-foreground">Dine opgaver og to-dos</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Ny opgave</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Opret ny opgave</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Titel *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hvad skal gøres?" />
              </div>
              <div className="space-y-2">
                <Label>Beskrivelse</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Yderligere detaljer..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Forfaldsdato</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prioritet</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Høj</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Lav</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createTask.isPending || !title.trim()} className="w-full">
                {createTask.isPending ? 'Opretter...' : 'Opret'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={(open) => { if (!open) setEditTask(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rediger opgave</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titel *</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forfaldsdato</Label>
                <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Prioritet</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Høj</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Lav</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleEdit} disabled={updateTask.isPending || !editTitle.trim()} className="w-full">
              {updateTask.isPending ? 'Gemmer...' : 'Gem ændringer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Afventer</p><p className="text-2xl font-bold text-orange-600">{pendingTasks.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Fuldført</p><p className="text-2xl font-bold text-green-600">{completedTasks.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{(tasks || []).length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opgaver</CardTitle>
          <CardDescription>Klik på cirklen for at markere som færdig</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Indlæser...</div>
            ) : (tasks || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Ingen opgaver endnu.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTasks.map((task: Task) => (
                  <div key={task.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors group">
                    <button onClick={() => handleComplete(task.id)} className="mt-0.5 text-muted-foreground hover:text-primary transition-colors">
                      <Circle className="h-5 w-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{task.title}</p>
                      {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {task.due_date && (
                          <Badge variant="outline" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" />{new Date(task.due_date).toLocaleDateString('da-DK')}
                          </Badge>
                        )}
                        {task.priority && (
                          <Badge variant="outline" className={`text-xs ${priorityColors[task.priority] || ''}`}>
                            {priorityLabels[task.priority] || task.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => openEdit(task)} className="text-muted-foreground hover:text-primary transition-colors" title="Rediger">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(task.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Slet">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {completedTasks.length > 0 && (
                  <>
                    <div className="py-2 text-sm font-medium text-muted-foreground">Fuldført ({completedTasks.length})</div>
                    {completedTasks.map((task: Task) => (
                      <div key={task.id} className="flex items-start gap-4 p-4 border rounded-lg opacity-60 group">
                        <button onClick={() => handleUncomplete(task.id)} className="mt-0.5" title="Genåbn opgave">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </button>
                        <p className="font-medium line-through flex-1">{task.title}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handleDelete(task.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Slet">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
