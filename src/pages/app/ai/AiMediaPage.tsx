import { useState } from 'react';
import { useAiGenerations, useAiGenerate, useDeleteAiGeneration } from '@/hooks/api/useAiMedia';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  XCircle, Eye, Wand2,
} from 'lucide-react';

export default function AiMediaPage() {
  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState<string>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('generate');

  const { data: generations = [], isLoading } = useAiGenerations();
  const generateMutation = useAiGenerate();
  const deleteMutation = useDeleteAiGeneration();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Indtast en beskrivelse af det billede du vil generere');
      return;
    }
    if (genType === 'video') {
      toast.info('Video-generering kræver en dedikeret GPU-server. Kontakt din administrator.');
      return;
    }
    try {
      const result = await generateMutation.mutateAsync({
        prompt: prompt.trim(),
        generation_type: genType,
      });
      toast.success(`Billede genereret på ${((result.duration_ms || 0) / 1000).toFixed(1)}s!`);
      setPrompt('');
      setActiveTab('gallery');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : 'Generering fejlede'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Billede slettet');
    } catch {
      toast.error('Kunne ikke slette');
    }
  };

  const completedGenerations = generations.filter(g => g.status === 'completed');
  const pendingGenerations = generations.filter(g => g.status === 'processing' || g.status === 'pending');
  const failedGenerations = generations.filter(g => g.status === 'failed');

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'processing': case 'pending': return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const promptSuggestions = [
    'Professionel Facebook-annonce for en dansk kaffebutik med moderne design',
    'Instagram-opslag til en dansk tech-startup med blå og hvid farvepalette',
    'LinkedIn banner til en dansk konsulentvirksomhed med corporate stil',
    'E-commerce produktbillede af en luksus taske på hvid baggrund',
    'Social media kampagnebillede til Black Friday udsalg i dansk detailhandel',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">AI Media Studio</h1>
            <p className="text-sm text-muted-foreground">Generer billeder og annoncer med AI direkte i dit workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{completedGenerations.length} genereret</Badge>
          {pendingGenerations.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pendingGenerations.length} i gang
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="generate"><Wand2 className="h-3.5 w-3.5 mr-1.5" />Generer</TabsTrigger>
          <TabsTrigger value="gallery"><ImageIcon className="h-3.5 w-3.5 mr-1.5" />Galleri ({completedGenerations.length})</TabsTrigger>
          <TabsTrigger value="history"><Clock className="h-3.5 w-3.5 mr-1.5" />Historik</TabsTrigger>
        </TabsList>

        {/* Generate Tab */}
        <TabsContent value="generate" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Prompt area */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Beskriv dit billede
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Select value={genType} onValueChange={setGenType}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">
                          <span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> Billede</span>
                        </SelectItem>
                        <SelectItem value="ad_creative">
                          <span className="flex items-center gap-2"><Megaphone className="h-3.5 w-3.5" /> Annonce-kreativ</span>
                        </SelectItem>
                        <SelectItem value="video" disabled>
                          <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5" /> Video (kræver GPU)</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Textarea
                    placeholder="Beskriv det billede du vil generere... f.eks. 'Professionel Facebook-annonce for en dansk restaurant med moderne design'"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />

                  <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending || !prompt.trim()}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {generateMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Genererer...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Generer {genType === 'ad_creative' ? 'annonce' : 'billede'}</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Suggestions */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Prompt-forslag</CardTitle>
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
          </div>
        </TabsContent>

        {/* Gallery Tab */}
        <TabsContent value="gallery">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
            </div>
          ) : completedGenerations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Ingen genererede billeder endnu</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab('generate')}>
                  Generer dit første billede
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {completedGenerations.map(gen => (
                <Card key={gen.id} className="group overflow-hidden">
                  <div className="relative aspect-square">
                    <img
                      src={gen.output_url || ''}
                      alt={gen.prompt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8"
                        onClick={() => setPreviewUrl(gen.output_url)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8"
                        asChild
                      >
                        <a href={gen.output_url || ''} download target="_blank" rel="noopener">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDelete(gen.id)}
                      >
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

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Genererings-historik</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : generations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Ingen genereringer endnu</p>
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
                          {gen.error_message && (
                            <span className="text-xs text-destructive truncate">{gen.error_message}</span>
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

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Forhåndsvisning</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img src={previewUrl} alt="AI Generated" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
