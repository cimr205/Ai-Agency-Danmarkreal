import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Send, Sparkles, Trash2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { streamChat, type ChatMsg, type ChatContentPart } from '@/lib/streamChat';
import ReactMarkdown from 'react-markdown';
import { useI18n } from '@/lib/i18n';

type ImageAttachment = { base64: string; mimeType: string; preview: string };
type UIMessage = { id: string; role: 'user' | 'assistant'; content: string; images?: ImageAttachment[] };

const STORAGE_KEY = 'clowdbot-history';

function loadHistory(): UIMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(msgs: UIMessage[]) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50))); } catch {}
}

export default function ClowdBotPage() {
  const { t } = useI18n();
  const location = useLocation();
  const [messages, setMessages] = useState<UIMessage[]>(loadHistory);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const suggestions = [
    t('pa.suggestion1'),
    t('pa.suggestion2'),
    t('pa.suggestion3'),
    t('pa.suggestion4'),
    t('pa.suggestion5'),
    t('pa.suggestion6'),
  ];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 20 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        setPendingImages(prev => [...prev, { base64, mimeType: file.type, preview: dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePendingImage = (idx: number) => setPendingImages(prev => prev.filter((_, i) => i !== idx));

  const sendMessage = async (prompt: string) => {
    if ((!prompt.trim() && pendingImages.length === 0) || isLoading) return;
    const images = [...pendingImages];
    const userMsg: UIMessage = { id: `${Date.now()}-u`, role: 'user', content: prompt, images: images.length ? images : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setPendingImages([]);
    setIsLoading(true);

    let assistantSoFar = '';
    const chatMessages: ChatMsg[] = newMessages.map(m => {
      if (m.images?.length) {
        const content: ChatContentPart[] = [];
        m.images.forEach(img => { content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }); });
        if (m.content) content.push({ type: 'text', text: m.content });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });

    try {
      await streamChat({
        messages: chatMessages,
        pageContext: location.pathname,
        pageSnapshot: '',
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.id.endsWith('-stream')) {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { id: `${Date.now()}-stream`, role: 'assistant', content: assistantSoFar }];
          });
        },
        onDone: () => setIsLoading(false),
      });
    } catch (error) {
      const errMsg = (error as Error).message || 'Unknown error';
      console.error('PA chat error:', error);
      setMessages(prev => [...prev, { id: `${Date.now()}-err`, role: 'assistant', content: `❌ ${t('pa.error')}: ${errMsg}` }]);
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> {t('pa.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('pa.subtitle')}</p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-1" /> {t('pa.newConversation')}
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                <h2 className="text-lg font-medium mb-2">{t('pa.emptyTitle')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('pa.emptyDesc')}</p>
                <div className="grid gap-2 sm:grid-cols-2 max-w-lg mx-auto">
                  {suggestions.map(s => (
                    <Button key={s} variant="outline" className="text-left h-auto py-3 px-4 text-sm whitespace-normal" onClick={() => sendMessage(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-xl px-4 py-3 text-sm max-w-[80%] ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground prose prose-sm dark:prose-invert max-w-none'
                }`}>
                  {m.images?.length ? (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {m.images.map((img, i) => (
                        <img key={i} src={img.preview} alt="" className="rounded-lg max-h-40 max-w-[200px] object-cover" />
                      ))}
                    </div>
                  ) : null}
                  {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-4 py-3 text-sm text-muted-foreground">
                  <span className="animate-pulse">● ● ●</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4 shrink-0">
          {pendingImages.length > 0 && (
            <div className="flex gap-2 mb-2 max-w-3xl mx-auto flex-wrap">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.preview} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" />
                  <button onClick={() => removePendingImage(i)} className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => imageInputRef.current?.click()} disabled={isLoading}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
            <Input
              placeholder={t('pa.inputPlaceholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={() => sendMessage(input)} disabled={isLoading || (!input.trim() && pendingImages.length === 0)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
