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
import { ArrowLeft, Save, Download, Loader2, Check, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import { MediaLibraryPanel } from './MediaLibraryPanel';
import {
  useVideoProject,
  useSaveVideoProject,
  useUploadExportedVideo,
  useSetVideoProjectStatus,
  resignProjectMedia,
  type VideoProject,
} from '@/hooks/api/useVideoStudio';
import './elah-theme.css';

const demuxerFactory = createDefaultDemuxerFactory();
const INITIAL_TRACKS = [
  { kind: 'video' as const, name: 'Video / Billede' },
  { kind: 'audio' as const, name: 'Lyd' },
  { kind: 'elements' as const, name: 'Tekst' },
];
const AUTOSAVE_DEBOUNCE_MS = 3_000;

type SaveState = 'saved' | 'unsaved' | 'saving';

interface Props {
  projectId: string;
  onBack: () => void;
  /** Platform-preset stage size for a brand-new project (ignored once a project has its own
   * saved stage — deserializeProject() overrides it on load). */
  initialStage?: { width: number; height: number };
}

/** Inner component — mounted inside EditorProvider so it can reach the timeline engine. */
function EditorInner({ project, onBack }: { project: VideoProject; onBack: () => void }) {
  const { t } = useI18n();
  const engine = useTimelineEngine();
  const [name, setName] = useState(project.name);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const saveMutation = useSaveVideoProject();
  const uploadExportMutation = useUploadExportedVideo();
  const setStatusMutation = useSetVideoProjectStatus();

  const nameRef = useRef(name);
  nameRef.current = name;
  const isLoadedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSaveRef = useRef<() => Promise<boolean>>(async () => false);
  performSaveRef.current = async () => {
    setSaveState('saving');
    try {
      const json = JSON.parse(serializeProject(engine)) as Json;
      await saveMutation.mutateAsync({
        id: project.id,
        project_json: json,
        name: nameRef.current,
        duration_frames: engine.getTotalFrames(),
      });
      setSaveState('saved');
      return true;
    } catch (err) {
      setSaveState('unsaved');
      toast.error(getErrorMessage(err) || t('videoStudio.saveError') || 'Could not save project');
      return false;
    }
  };

  const scheduleAutosave = () => {
    if (!isLoadedRef.current) return; // ignore the load effect's own engine mutations
    setSaveState('unsaved');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void performSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // Load the saved project JSON into the engine once per project id (not on every render —
  // deserializeProject mutates the engine, calling it again would wipe in-progress edits).
  useEffect(() => {
    if (loadedProjectId === project.id) return;
    const raw = project.project_json;
    setLoadedProjectId(project.id);
    isLoadedRef.current = false;
    (async () => {
      if (raw && typeof raw === 'object' && Object.keys(raw as object).length > 0) {
        try {
          // Clip.src holds a signed URL that expires after 24h — re-sign before loading
          // so a project opened more than a day after it was saved doesn't lose its media.
          const { project: resigned } = await resignProjectMedia(raw);
          deserializeProject(engine, JSON.stringify(resigned));
        } catch (err) {
          toast.error(getErrorMessage(err) || t('videoStudio.loadError') || 'Could not load project');
        }
      }
      // Only start reacting to engine changes once the load itself (which also mutates
      // the engine) has finished — otherwise loading a project would immediately flag it
      // as having unsaved changes.
      isLoadedRef.current = true;
    })();
    // engine is a stable ref from EditorProvider's context for this mount; project.id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Any timeline mutation (clip added/moved/trimmed, transition changed, etc.) marks the
  // project dirty and (re)schedules a debounced autosave.
  useEffect(() => {
    engine.on('change', scheduleAutosave);
    return () => {
      engine.off('change', scheduleAutosave);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [engine]);

  // Renaming the project is also a change worth saving, but doesn't go through the engine.
  const handleNameChange = (value: string) => {
    setName(value);
    scheduleAutosave();
  };

  // Warn on a hard page close/reload with unsaved changes still pending.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === 'saved') return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  const handleBack = () => {
    if (saveState !== 'saved' && !window.confirm(t('videoStudio.leaveConfirm') || 'You have unsaved changes. Leave anyway?')) {
      return;
    }
    onBack();
  };

  const handleSave = async () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const ok = await performSaveRef.current();
    if (ok) toast.success(t('videoStudio.saved') || 'Project saved');
  };

  const handleExport = async () => {
    setExportProgress({ frame: 0, totalFrames: engine.getTotalFrames() || 1 });
    try {
      await setStatusMutation.mutateAsync({ id: project.id, status: 'exporting' });
      const snapshot = engine.getProject();
      // Despite the name, elah's `outputHeight` is the target SHORT edge — it scales both
      // stage dimensions uniformly (computeExportDimensions: scale = outputHeight /
      // min(stageWidth, stageHeight)). Every platform preset already has a 1080px short
      // edge natively, so 1080 here means "native resolution" for all of them — 1920x1080,
      // 1080x1080, 1080x1350, and 1080x1920 all fall out of this one constant correctly.
      const blob = await exportVideo(snapshot, {
        videoCodec: 'avc',
        audioCodec: 'aac',
        videoBitrate: 8_000_000,
        audioBitrate: 192_000,
        outputHeight: 1080,
        onProgress: setExportProgress,
      });
      await uploadExportMutation.mutateAsync({ projectId: project.id, blob }); // sets status 'exported'
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'video'}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('videoStudio.exported') || 'Video exported');
    } catch (err) {
      toast.error(getErrorMessage(err) || t('videoStudio.exportError') || 'Export failed');
      await setStatusMutation.mutateAsync({ id: project.id, status: 'failed' }).catch(() => {});
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
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="h-8 max-w-xs text-sm font-medium"
          placeholder={t('videoStudio.untitled') || 'Untitled video'}
        />
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="video-studio-save-state">
          {saveState === 'saving' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('videoStudio.autosaving') || 'Saving…'}
            </>
          )}
          {saveState === 'unsaved' && (
            <>
              <CloudUpload className="h-3 w-3" />
              {t('videoStudio.unsavedChanges') || 'Unsaved changes'}
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check className="h-3 w-3" />
              {t('videoStudio.autosaved') || 'All changes saved'}
            </>
          )}
        </span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSave} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
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

export function VideoEditorWorkspace({ projectId, onBack, initialStage }: Props) {
  const { data: project, isLoading, error } = useVideoProject(projectId);
  const { t } = useI18n();

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-muted-foreground">{t('common.loading') || 'Loading...'}</div>;
  }
  if (error || !project) {
    return <div className="flex h-96 items-center justify-center text-destructive">{t('videoStudio.loadError') || 'Could not load project'}</div>;
  }

  return (
    <EditorProvider fps={30} stage={initialStage} initialTracks={INITIAL_TRACKS}>
      <EditorInner project={project} onBack={onBack} />
    </EditorProvider>
  );
}
