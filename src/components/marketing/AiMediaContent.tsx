import { useState, useRef } from 'react';
import { useAiGenerations, useAiGenerate, useDeleteAiGeneration } from '@/hooks/api/useAiMedia';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Sparkles, Image as ImageIcon, Video, Megaphone,
  Loader2, Download, Trash2, Clock, CheckCircle2,
  XCircle, Eye, Wand2, Upload, Paintbrush, X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';

export default function AiMediaContent() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState<string>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('generate');

  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: generations = [], isLoading } = useAiGenerations();
  const generateMutation = useAiGenerate();
  const deleteMutation = useDeleteAiGeneration();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('aiMedia.onlyImageFiles'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t('aiMedia.fileTooLarge'));
      return;
    }
    setReferenceFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('aiMedia.enterDescription'));
      return;
    }
    if (genType === 'video') {
      toast.info(t('aiMedia.videoRequiresGpu'));
      return;
    }
    try {
      const result = await generateMutation.mutateAsync({
        prompt: prompt.trim(),
        generation_type: referenceImage ? 'image_edit' : genType,
        ...(referenceImage ? { reference_image: referenceImage } : {}),
      });
      toast.success(t('aiMedia.generatedIn').replace('{time}', ((result.duration_ms || 0) / 1000).toFixed(1)));
      setPrompt('');
      setReferenceImage(null);
      setReferenceFileName(null);
      setActiveTab('gallery');
    } catch (err) {
      toast.error((getErrorMessage(err) || t('common.error')));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success(t('aiMedia.imageDeleted'));
    } catch {
      toast.error(t('aiMedia.couldNotDelete'));
    }
  };

  const completedGenerations = generations.filter(g => g.status === 'completed');
  const pendingGenerations = generations.filter(g => g.status === 'processing' || g.status === 'pending');

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case 'processing': case 'pending': return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const promptSuggestions = referenceImage ? [
    'Make the image sharper and more professional',
    'Remove the background and replace with white',
    'Add a warm color tone and increase contrast',
    'Turn it into an ad with text overlay',
    'Convert to black and white with high contrast',
  ] : [
    'Professional Facebook ad for a coffee shop with modern design',
    'Instagram post for a tech startup with blue and white palette',
    'LinkedIn banner for a consulting firm with corporate style',
    'E-commerce product image of a luxury bag on white background',
    'Social media campaign image for Black Friday sale',
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t('aiMedia.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('aiMedia.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{completedGenerations.length} {t('aiMedia.generated')}</Badge>
          {pendingGenerations.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pendingGenerations.length} {t('aiMedia.inProgress')}
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="liquid-glass-card border-0">
          <TabsTrigger value="generate"><Wand2 className="h-3.5 w-3.5 mr-1.5" />{t('aiMedia.generateTab')}</TabsTrigger>
          <TabsTrigger value="gallery"><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{t('aiMedia.galleryTab')} ({completedGenerations.length})</TabsTrigger>
          <TabsTrigger value="history"><Clock className="h-3.5 w-3.5 mr-1.5" />{t('aiMedia.historyTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="liquid-glass-card border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {referenceImage ? <Paintbrush className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {referenceImage ? t('aiMedia.editImageWithAi') : t('aiMedia.describeImage')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-primary/30 bg-muted/30">
                      <img src={referenceImage} alt="Reference" className="w-full max-h-48 object-contain" />
                      <div className="absolute top-2 right-2 flex gap-1.5">
                        <Badge variant="secondary" className="text-xs">{referenceFileName}</Badge>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setReferenceImage(null); setReferenceFileName(null); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="absolute bottom-2 left-2">
                        <Badge className="bg-primary/90 text-primary-foreground text-xs gap-1">
                          <Paintbrush className="h-3 w-3" /> {t('aiMedia.editMode')}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Select value={genType} onValueChange={setGenType}>
                        <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">
                            <span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> {t('aiMedia.imageType')}</span>
                          </SelectItem>
                          <SelectItem value="ad_creative">
                            <span className="flex items-center gap-2"><Megaphone className="h-3.5 w-3.5" /> {t('aiMedia.adCreative')}</span>
                          </SelectItem>
                          <SelectItem value="video" disabled>
                            <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5" /> {t('aiMedia.videoGpu')}</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {t('aiMedia.uploadForEditing')}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>
                  )}

                  <Textarea
                    placeholder={referenceImage ? t('aiMedia.describeChanges') : t('aiMedia.describeGenerate')}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {generateMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {t('aiMedia.generating')}</>
                    ) : referenceImage ? (
                      <><Paintbrush className="h-4 w-4" /> {t('aiMedia.editImageBtn')}</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> {genType === 'ad_creative' ? t('aiMedia.generateAd') : t('aiMedia.generateImage')}</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="liquid-glass-card border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  {referenceImage ? t('aiMedia.editSuggestions') : t('aiMedia.promptSuggestions')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {promptSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(suggestion)}
                    className="w-full text-left text-sm p-3 rounded-lg border border-border/50 hover:bg-muted/50 hover:border-primary/30 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gallery">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
            </div>
          ) : completedGenerations.length === 0 ? (
            <Card className="liquid-glass-card border-0">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">{t('aiMedia.noImagesYet')}</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab('generate')}>
                  {t('aiMedia.generateFirst')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {completedGenerations.map(gen => (
                <Card key={gen.id} className="group overflow-hidden liquid-glass-card border-0 shadow-sm">
                  <div className="relative aspect-square">
                    <img src={gen.output_url || ''} alt={gen.prompt} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setPreviewUrl(gen.output_url)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="secondary" className="h-8 w-8" asChild>
                        <a href={gen.output_url || ''} download target="_blank" rel="noopener"><Download className="h-4 w-4" /></a>
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8"
                        onClick={() => {
                          setReferenceImage(gen.output_url);
                          setReferenceFileName('AI generated');
                          setActiveTab('generate');
                          toast.info(t('aiMedia.selectedForEditing'));
                        }}
                      >
                        <Paintbrush className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(gen.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground line-clamp-2">{gen.prompt}</p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline" className="text-[10px]">{gen.generation_type}</Badge>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(gen.created_at), 'dd/MM HH:mm')}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card className="liquid-glass-card border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{t('aiMedia.generationHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : generations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('aiMedia.noGenerationsYet')}</p>
              ) : (
                <div className="space-y-2">
                  {generations.map(gen => (
                    <div key={gen.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                      {gen.output_url && gen.status === 'completed' ? (
                        <img src={gen.output_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          {statusIcon(gen.status)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{gen.prompt}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">{gen.generation_type}</Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {statusIcon(gen.status)} {gen.status}
                          </span>
                          {gen.duration_ms && (
                            <span className="text-xs text-muted-foreground">{(gen.duration_ms / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(gen.created_at), 'dd/MM HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('aiMedia.previewTitle')}</DialogTitle>
          </DialogHeader>
          {previewUrl && <img src={previewUrl} alt="AI Generated" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
