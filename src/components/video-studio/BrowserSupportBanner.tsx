import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function detectVideoStudioSupport(): { supported: boolean; missing: string[] } {
  if (typeof window === 'undefined') return { supported: false, missing: ['window'] };
  const missing: string[] = [];
  if (typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') missing.push('WebCodecs');
  if (typeof OffscreenCanvas === 'undefined') missing.push('OffscreenCanvas');
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) missing.push('WebGL2');
  } catch {
    missing.push('WebGL2');
  }
  return { supported: missing.length === 0, missing };
}

/** Shown instead of mounting the editor when the browser lacks WebCodecs/WebGL2/OffscreenCanvas
 * (elah's hard requirements). Never silently fail — the mission requires an honest status. */
export function BrowserSupportBanner({ missing }: { missing: string[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">
        {t('videoStudio.unsupportedTitle') || 'Din browser understøtter ikke Video Studio'}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {(t('videoStudio.unsupportedBody') as string | undefined) ||
          'Video Studio kræver WebCodecs, WebGL2 og OffscreenCanvas. Brug den nyeste version af Chrome eller Edge (Chromium 108+).'}
      </p>
      <p className="text-xs text-muted-foreground/70">{t('videoStudio.unsupportedMissing') || 'Mangler'}: {missing.join(', ')}</p>
    </div>
  );
}
