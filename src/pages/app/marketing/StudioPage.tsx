import { lazy, Suspense, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/lib/i18n';
import { SegmentedControl } from '@/components/workspace/SegmentedControl';

// Lazy per-tab: the video editor and the AI generator are each substantial
// (canvas/video-processing deps) — bundling both into StudioPage directly
// pushed a single chunk over 900kB. Code-splitting them means visiting one
// tab doesn't pull in the other's dependencies until it's actually opened.
const VideoStudioPage = lazy(() => import('./VideoStudioPage'));
const AiMediaPage = lazy(() => import('@/pages/app/ai/AiMediaPage'));

const TAB_LOADER = (
  <div className="space-y-4">
    <Skeleton className="h-10 w-48" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
    </div>
  </div>
);

type StudioTab = 'editor' | 'generate';

/** Unified entry point for Video Studio (editing) and the AI image/video
 * generator — previously two separate sidebar items. The video editor
 * itself (VideoEditorWorkspace) is full-bleed (h-[calc(100vh-4rem)]), so
 * while it's open we drop our own header/tabs chrome entirely rather than
 * squeeze it under extra padding. */
export default function StudioPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<StudioTab>('editor');
  const [editorOpen, setEditorOpen] = useState(false);

  if (editorOpen) {
    return (
      <Suspense fallback={TAB_LOADER}>
        <VideoStudioPage showHeader={false} onEditorOpenChange={setEditorOpen} />
      </Suspense>
    );
  }

  return (
    <div className="workspace-theme space-y-6">
      <PageHeader
        eyebrow={t('nav.marketing') || 'Marketing'}
        title={t('nav.studio') || 'Studio'}
        description={t('studio.pageDescription') || 'Edit and generate video and image content without leaving the platform.'}
      />

      <SegmentedControl<StudioTab>
        layoutId="studioTabPill"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'editor', label: t('studio.editorTab') || 'Editor' },
          { value: 'generate', label: t('studio.generateTab') || 'AI Generate' },
        ]}
      />

      <div className="mt-6">
        {tab === 'editor' ? (
          <Suspense fallback={TAB_LOADER}>
            <VideoStudioPage showHeader={false} onEditorOpenChange={setEditorOpen} />
          </Suspense>
        ) : (
          <Suspense fallback={TAB_LOADER}>
            <AiMediaPage showHeader={false} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
