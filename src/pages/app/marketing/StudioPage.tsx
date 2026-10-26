import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clapperboard, Wand2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import VideoStudioPage from './VideoStudioPage';
import AiMediaPage from '@/pages/app/ai/AiMediaPage';

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
    return <VideoStudioPage showHeader={false} onEditorOpenChange={setEditorOpen} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('nav.marketing') || 'Marketing'}
        title={t('nav.studios') || 'Studios'}
        description={t('studio.pageDescription') || 'Edit and generate video and image content without leaving the platform.'}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as StudioTab)}>
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5">
            <Clapperboard className="h-3.5 w-3.5" />
            {t('studio.editorTab') || 'Editor'}
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            {t('studio.generateTab') || 'AI Generate'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-6">
          <VideoStudioPage showHeader={false} onEditorOpenChange={setEditorOpen} />
        </TabsContent>

        <TabsContent value="generate" className="mt-6">
          <AiMediaPage showHeader={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
