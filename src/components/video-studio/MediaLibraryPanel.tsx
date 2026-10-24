import { useRef, useState } from 'react';
import { useMediaLibrary, useTimelineEngine, insertMediaAsset } from '@elah/editor';
import { Button } from '@/components/ui/button';
import { Upload, Film, Music, Image as ImageIcon, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import {
  useUploadVideoAsset,
  useVideoAssetList,
  signVideoAssetUrl,
  VideoAssetValidationError,
} from '@/hooks/api/useVideoStudio';

function iconFor(mimeType: string | null) {
  if (mimeType?.startsWith('video/')) return Film;
  if (mimeType?.startsWith('audio/')) return Music;
  return ImageIcon;
}

/** Real media library: uploads persist to the tenant's Supabase Storage bucket
 * (survive across sessions), then "Add" imports a signed URL into elah's
 * in-project media library via useMediaLibrary().importUrl(). */
export function MediaLibraryPanel() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addingPath, setAddingPath] = useState<string | null>(null);
  const { data: assets = [], isLoading } = useVideoAssetList();
  const uploadMutation = useUploadVideoAsset();
  const { importUrl } = useMediaLibrary();
  const engine = useTimelineEngine();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await uploadMutation.mutateAsync(file);
      } catch (err) {
        if (err instanceof VideoAssetValidationError) {
          toast.error(err.message);
        } else {
          toast.error(getErrorMessage(err) || t('videoStudio.uploadError') || 'Upload failed');
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddToTimeline = async (path: string, name: string) => {
    setAddingPath(path);
    try {
      const url = await signVideoAssetUrl(path);
      // importUrl() only registers the asset in elah's in-memory media library —
      // it does NOT place a clip on a track. insertMediaAsset() does that; without
      // it, the project has no clips and exportVideo() fails with
      // "ExportWorker: project has no clips" (found via live E2E testing).
      const asset = await importUrl(url, { name });
      const result = await insertMediaAsset(engine, asset.id);
      if (!result.ok) {
        const reason = "reason" in result ? result.reason : "unknown";
        throw new Error(`Could not place on timeline: ${reason}`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err) || t('videoStudio.addToTimelineError') || 'Could not add to timeline');
    } finally {
      setAddingPath(null);
    }
  };

  return (
    <div className="flex h-full w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card p-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={uploadMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {t('videoStudio.upload') || 'Upload media'}
      </Button>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading') || 'Loading...'}</p>}
      {!isLoading && assets.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('videoStudio.noMedia') || 'No media uploaded yet.'}</p>
      )}

      <div className="flex flex-col gap-1.5">
        {assets.map((asset) => {
          const Icon = iconFor(asset.mimeType);
          return (
            <div
              key={asset.path}
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={asset.name}>
                {asset.name}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                disabled={addingPath === asset.path}
                onClick={() => handleAddToTimeline(asset.path, asset.name)}
                title={t('videoStudio.addToTimeline') || 'Add to timeline'}
              >
                {addingPath === asset.path ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
