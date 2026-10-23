import { useEffect, useRef, useState } from 'react';
import {
  EditorProvider,
  Preview,
  Timeline,
  createDefaultDemuxerFactory,
  useTimelineEngine,
  exportVideo,
  serializeProject,
  deserializeProject,
  type ExportProgress,
} from '@elah/editor';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import { MediaLibraryPanel } from './MediaLibraryPanel';
import {
  useVideoProject,
  useSaveVideoProject,
  useUploadExportedVideo,
  type VideoProject,
} from '@/hooks/api/useVideoStudio';
import './elah-theme.css';

const demuxerFactory = createDefaultDemuxerFactory();
const INITIAL_TRACKS = [
  { kind: 'video' as const, name: 'Video / Billede' },
  { kind: 'audio' as const, name: 'Lyd' },
  { kind: 'elements' as const, name: 'Tekst' },
];

interface Props {
  projectId: string;
  onBack: () => void;
}

/** Inner component — mounted inside EditorProvider so it can reach the timeline engine. */
function EditorInner({ project, onBack }: { project: VideoProject; onBack: () => void }) {
  const { t } = useI18n();
  const engine = useTimelineEngine();
  const [name, setName] = useState(project.name);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const saveMutation = useSaveVideoProject();
  const uploadExportMutation = useUploadExportedVideo();

  // Load the saved project JSON into the engine once per project id (not on every render —
  // deserializeProject mutates the engine, calling it again would wipe in-progress edits).
  useEffect(() => {
    if (loadedProjectId === project.id) return;
    const raw = project.project_json;
    if (raw && typeof raw === 'object' && Object.keys(raw as object).length > 0) {
      try {
        deserializeProject(engine, JSON.stringify(raw));
      } catch (err) {
        toast.error(getErrorMessage(err) || t('videoStudio.loadError') || 'Could not load project');
      }
    }
    setLoadedProjectId(project.id);
    // engine is a stable ref from EditorProvider's context for this mount; project.id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const handleSave = async () => {
    try {
      const json = JSON.parse(serializeProject(engine)) as Json;
      await saveMutation.mutateAsync({ id: project.id, project_json: json, name, duration_frames: engine.getTotalFrames() });
      toast.success(t('videoStudio.saved') || 'Project saved');
    } catch (err) {
      toast.error(getErrorMessage(err) || t('videoStudio.saveError') || 'Could not save project');
    }
  };

  const handleExport = async () => {
    setExportProgress({ frame: 0, totalFrames: engine.getTotalFrames() || 1 });
    try {
      const snapshot = engine.getProject();
      const blob = await exportVideo(snapshot, {
        videoCodec: 'avc',
        audioCodec: 'aac',
        videoBitrate: 8_000_000,
        audioBitrate: 192_000,
        outputHeight: 1080,
        onProgress: setExportProgress,
      });
      await uploadExportMutation.mutateAsync({ projectId: project.id, blob });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'video'}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('videoStudio.exported') || 'Video exported');
    } catch (err) {
      toast.error(getErrorMessage(err) || t('videoStudio.exportError') || 'Export failed');
    } finally {
      setExportProgress(null);
    }
  };

  const exportPercent = exportProgress
    ? Math.round((exportProgress.frame / Math.max(1, exportProgress.totalFrames)) * 100)
    : 0;

  return (
    <div className="elah-root flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 max-w-xs text-sm font-medium"
          placeholder={t('videoStudio.untitled') || 'Untitled video'}
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t('videoStudio.save') || 'Save'}
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={!!exportProgress}>
          {exportProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exportProgress ? `${t('videoStudio.exporting') || 'Exporting'} ${exportPercent}%` : t('videoStudio.export') || 'Export MP4'}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <MediaLibraryPanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <Preview demuxerFactory={demuxerFactory} enableAudio style={{ flex: 1, minHeight: 0 }} />
          <Timeline style={{ height: 220 }} />
        </div>
      </div>
    </div>
  );
}

export function VideoEditorWorkspace({ projectId, onBack }: Props) {
  const { data: project, isLoading, error } = useVideoProject(projectId);
  const { t } = useI18n();

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-muted-foreground">{t('common.loading') || 'Loading...'}</div>;
  }
  if (error || !project) {
    return <div className="flex h-96 items-center justify-center text-destructive">{t('videoStudio.loadError') || 'Could not load project'}</div>;
  }

  return (
    <EditorProvider fps={30} initialTracks={INITIAL_TRACKS}>
      <EditorInner project={project} onBack={onBack} />
    </EditorProvider>
  );
}
