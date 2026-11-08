import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clapperboard, Plus, Trash2, Download, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import { useVideoProjects, useCreateVideoProject, useDeleteVideoProject, signVideoAssetUrl } from '@/hooks/api/useVideoStudio';
import { BrowserSupportBanner, detectVideoStudioSupport } from '@/components/video-studio/BrowserSupportBanner';
import { VideoEditorWorkspace } from '@/components/video-studio/VideoEditorWorkspace';

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  exporting: 'default',
  exported: 'default',
  failed: 'destructive',
};

interface PlatformPreset {
  id: '9:16' | '1:1' | '16:9' | '4:5';
  label: string;
  width: number;
  height: number;
}

const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: '9:16', label: '9:16 — Reels / TikTok / Stories', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 — Feed (square)', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 — Feed (portrait)', width: 1080, height: 1350 },
  { id: '16:9', label: '16:9 — YouTube / landscape', width: 1920, height: 1080 },
];

interface VideoStudioPageProps {
  /** false when embedded under the unified Studio page, which renders its own PageHeader. */
  showHeader?: boolean;
  /** Lets a parent (StudioPage) know when the full-bleed editor is open, so it can drop its own chrome. */
  onEditorOpenChange?: (open: boolean) => void;
}

export default function VideoStudioPage({ showHeader = true, onEditorOpenChange }: VideoStudioPageProps) {
  const { t } = useI18n();
  const support = useMemo(() => detectVideoStudioSupport(), []);
  const [openProjectId, setOpenProjectIdState] = useState<string | null>(null);
  const setOpenProjectId = (id: string | null) => {
    setOpenProjectIdState(id);
    onEditorOpenChange?.(id !== null);
  };
  // Only set right after creating a brand-new project, so EditorProvider seeds the right
  // stage size before the first save bakes it into project_json. Reopening an existing
  // project must NOT reuse a stale preset — its own saved stage takes over on load.
  const [pendingStage, setPendingStage] = useState<{ width: number; height: number } | undefined>();

  const { data: projects = [], isLoading, error: projectsError } = useVideoProjects();
  // PGRST205 = the video_projects table isn't deployed in this database yet.
  const studioNotDeployed = /video_projects|PGRST205|schema cache/i.test(getErrorMessage(projectsError) || '');
  const createMutation = useCreateVideoProject();
  const deleteMutation = useDeleteVideoProject();

  if (!support.supported) {
    return (
      <div className="space-y-6">
        {showHeader && <PageHeader eyebrow={t('nav.videoStudio') || 'Video Studio'} title={t('nav.videoStudio') || 'Video Studio'} />}
        <BrowserSupportBanner missing={support.missing} />
      </div>
    );
  }

  if (openProjectId) {
    return (
      <VideoEditorWorkspace
        projectId={openProjectId}
        initialStage={pendingStage}
        onBack={() => setOpenProjectId(null)}
      />
    );
  }

  const handleCreate = async (preset: PlatformPreset) => {
    try {
      const project = await createMutation.mutateAsync({
        name: t('videoStudio.untitled') || 'Untitled video',
        project_json: {},
      });
      setPendingStage({ width: preset.width, height: preset.height });
      setOpenProjectId(project.id);
    } catch (err) {
      const msg = getErrorMessage(err) || '';
      toast.error(/video_projects|PGRST205|schema cache/i.test(msg) ? t('videoStudio.notDeployedHint') : (msg || t('videoStudio.createError') || 'Could not create project'));
    }
  };

  const handleOpenExisting = (id: string) => {
    setPendingStage(undefined);
    setOpenProjectId(id);
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

  // Exported videos were previously unreachable after the fact — re-sign the stored
  // export and open it, same recovery path as resignProjectMedia uses for timeline media.
  const handleDownloadExport = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = await signVideoAssetUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(getErrorMessage(err) || t('common.error') || 'Something went wrong');
    }
  };

  const newVideoAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5" disabled={createMutation.isPending}>
          <Plus className="h-4 w-4" />
          {t('videoStudio.newVideo') || 'New video'}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PLATFORM_PRESETS.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => handleCreate(preset)}>
            {t(`videoStudio.preset.${preset.id}`) || preset.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow={t('nav.marketing') || 'Marketing'}
          title={t('nav.videoStudio') || 'Video Studio'}
          description={t('videoStudio.pageDescription') || 'Produce videos and ads without leaving the platform.'}
          actions={newVideoAction}
        />
      ) : (
        <div className="flex items-center justify-end">{newVideoAction}</div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && projectsError && (
        <EmptyState
          icon={Clapperboard}
          title={studioNotDeployed ? t('videoStudio.notDeployedTitle') : (t('common.error') || 'Something went wrong')}
          hint={studioNotDeployed ? t('videoStudio.notDeployedHint') : (getErrorMessage(projectsError) || '')}
        />
      )}

      {!isLoading && !projectsError && projects.length === 0 && (
        <EmptyState
          icon={Clapperboard}
          title={t('videoStudio.emptyTitle') || 'No videos yet'}
          hint={t('videoStudio.emptyHint') || 'Create your first video project.'}
          action={{ label: t('videoStudio.newVideo') || 'New video', onClick: () => handleCreate(PLATFORM_PRESETS[0]), icon: Plus }}
        />
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleOpenExisting(p.id)}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.status === 'exported' && p.exported_video_path && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        title={t('videoStudio.downloadExport') || 'Download last export'}
                        onClick={(e) => handleDownloadExport(p.exported_video_path!, e)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(p.id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
