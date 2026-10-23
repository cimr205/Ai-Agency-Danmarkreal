import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clapperboard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import { useVideoProjects, useCreateVideoProject, useDeleteVideoProject } from '@/hooks/api/useVideoStudio';
import { BrowserSupportBanner, detectVideoStudioSupport } from '@/components/video-studio/BrowserSupportBanner';
import { VideoEditorWorkspace } from '@/components/video-studio/VideoEditorWorkspace';

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  exporting: 'default',
  exported: 'default',
  failed: 'destructive',
};

export default function VideoStudioPage() {
  const { t } = useI18n();
  const support = useMemo(() => detectVideoStudioSupport(), []);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useVideoProjects();
  const createMutation = useCreateVideoProject();
  const deleteMutation = useDeleteVideoProject();

  if (!support.supported) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t('nav.videoStudio') || 'Video Studio'} title={t('nav.videoStudio') || 'Video Studio'} />
        <BrowserSupportBanner missing={support.missing} />
      </div>
    );
  }

  if (openProjectId) {
    return <VideoEditorWorkspace projectId={openProjectId} onBack={() => setOpenProjectId(null)} />;
  }

  const handleCreate = async () => {
    try {
      const project = await createMutation.mutateAsync({
        name: t('videoStudio.untitled') || 'Untitled video',
        project_json: {},
      });
      setOpenProjectId(project.id);
    } catch (err) {
      toast.error(getErrorMessage(err) || t('videoStudio.createError') || 'Could not create project');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteMutation.mutateAsync(id);
      toast.success(t('videoStudio.deleted') || 'Video deleted');
    } catch (err) {
      toast.error(getErrorMessage(err) || t('common.error') || 'Something went wrong');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('nav.marketing') || 'Marketing'}
        title={t('nav.videoStudio') || 'Video Studio'}
        description={t('videoStudio.pageDescription') || 'Produce videos and ads without leaving the platform.'}
        actions={
          <Button className="gap-1.5" onClick={handleCreate} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4" />
            {t('videoStudio.newVideo') || 'New video'}
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={Clapperboard}
          title={t('videoStudio.emptyTitle') || 'No videos yet'}
          hint={t('videoStudio.emptyHint') || 'Create your first video project.'}
          action={{ label: t('videoStudio.newVideo') || 'New video', onClick: handleCreate, icon: Plus }}
        />
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setOpenProjectId(p.id)}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDelete(p.id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Badge variant={STATUS_TONE[p.status] ?? 'secondary'} className="text-[10px] uppercase">
                  {t(`videoStudio.status.${p.status}`) || p.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
