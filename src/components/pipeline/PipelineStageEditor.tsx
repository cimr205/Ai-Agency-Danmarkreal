import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { usePipelineStages, useCreatePipelineStage, useUpdatePipelineStage, useDeletePipelineStage } from '@/hooks/api/usePipelineStages';
import { Settings2, Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

const DEFAULT_COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const DEFAULT_STAGES = [
  { name: 'Discovery', color: '#3B82F6', order_index: 0 },
  { name: 'Proposal', color: '#F59E0B', order_index: 1 },
  { name: 'Negotiation', color: '#8B5CF6', order_index: 2 },
  { name: 'Won', color: '#22C55E', order_index: 3 },
  { name: 'Lost', color: '#EF4444', order_index: 4 },
];

export default function PipelineStageEditor() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: stages = [], isLoading } = usePipelineStages();
  const createStage = useCreatePipelineStage();
  const updateStage = useUpdatePipelineStage();
  const deleteStage = useDeletePipelineStage();

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createStage.mutateAsync({ name: newName.trim(), color: newColor, order_index: stages.length });
      toast.success(t('pipeline.stageAdded'));
      setNewName('');
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStage.mutateAsync(id);
      toast.success(t('pipeline.stageDeleted'));
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await updateStage.mutateAsync({ id, data: { name: editName.trim() } });
      toast.success(t('common.saved'));
      setEditingId(null);
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const stageA = stages[index];
    const stageB = stages[index - 1];
    try {
      await Promise.all([
        updateStage.mutateAsync({ id: stageA.id, data: { order_index: index - 1 } }),
        updateStage.mutateAsync({ id: stageB.id, data: { order_index: index } }),
      ]);
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= stages.length - 1) return;
    const stageA = stages[index];
    const stageB = stages[index + 1];
    try {
      await Promise.all([
        updateStage.mutateAsync({ id: stageA.id, data: { order_index: index + 1 } }),
        updateStage.mutateAsync({ id: stageB.id, data: { order_index: index } }),
      ]);
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleColorChange = async (id: string, color: string) => {
    try {
      await updateStage.mutateAsync({ id, data: { color } });
    } catch { toast.error(t('pipeline.stageError')); }
  };

  const handleCreateDefaults = async () => {
    try {
      for (const stage of DEFAULT_STAGES) {
        await createStage.mutateAsync(stage);
      }
      toast.success(t('pipeline.defaultStagesCreated'));
    } catch { toast.error(t('pipeline.stageError')); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1.5" />
          {t('pipeline.stageEditor')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pipeline.stageEditor')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {stages.length === 0 && !isLoading ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">{t('pipeline.noStages')}</p>
              <Button variant="outline" onClick={handleCreateDefaults} disabled={createStage.isPending}>
                {t('pipeline.createDefaultStages')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => handleMoveUp(idx)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px]">▲</button>
                    <button onClick={() => handleMoveDown(idx)} disabled={idx === stages.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px]">▼</button>
                  </div>
                  <input
                    type="color"
                    value={stage.color || '#3B82F6'}
                    onChange={e => handleColorChange(stage.id, e.target.value)}
                    className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                  />
                  {editingId === stage.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleRename(stage.id); if (e.key === 'Escape') setEditingId(null); }} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRename(stage.id)}><Check className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{stage.name}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(stage.id); setEditName(stage.name); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(stage.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <Label className="text-sm font-medium">{t('pipeline.addStage')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('pipeline.stageName')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-10 w-10 rounded border border-border cursor-pointer"
              />
              <Button size="icon" onClick={handleAdd} disabled={createStage.isPending || !newName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
