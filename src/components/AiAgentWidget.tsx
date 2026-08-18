import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { streamChat, type ChatMsg, type ChatContentPart } from '@/lib/streamChat';
import { UserRound, X, Send, Sparkles, GripVertical, Paperclip, FileText, Image as ImageIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type UIMessage = { id: string; role: 'user' | 'assistant'; content: string; files?: { name: string; type: string; preview?: string }[] };

const CONTEXT_LABELS: Record<string, string> = {
  'meta-ads': 'Meta Ads',
  leads: 'Leads',
  deals: 'Deals',
  pipeline: 'Pipeline',
  customers: 'Kunder',
  invoices: 'Fakturaer',
  payments: 'Betalinger',
  employees: 'Medarbejdere',
  attendance: 'Fremmøde',
  leave: 'Fravær',
  payroll: 'Løn',
  recruitment: 'Rekruttering',
  tasks: 'Opgaver',
  calendar: 'Kalender',
  inbox: 'Indbakke',
  emails: 'Emails',
  todos: 'To-dos',
  settings: 'Indstillinger',
  dashboard: 'Dashboard',
};

function detectPageContext(pathname: string): string {
  if (pathname.includes('meta-ads')) return 'meta-ads';
  if (pathname.includes('leads')) return 'leads';
  if (pathname.includes('deals')) return 'deals';
  if (pathname.includes('pipeline')) return 'pipeline';
  if (pathname.includes('customers')) return 'customers';
  if (pathname.includes('invoices')) return 'invoices';
  if (pathname.includes('payments')) return 'payments';
  if (pathname.includes('employees')) return 'employees';
  if (pathname.includes('attendance')) return 'attendance';
  if (pathname.includes('leave')) return 'leave';
  if (pathname.includes('payroll')) return 'payroll';
  if (pathname.includes('recruitment')) return 'recruitment';
  if (pathname.includes('tasks')) return 'tasks';
  if (pathname.includes('calendar')) return 'calendar';
  if (pathname.includes('inbox')) return 'inbox';
  if (pathname.includes('emails')) return 'emails';
  if (pathname.includes('todos')) return 'todos';
  if (pathname.includes('settings')) return 'settings';
  return 'dashboard';
}

/** Scrape visible page content for contextual AI awareness */
function scanPageContent(): string {
  try {
    const mainEl = document.querySelector('main') || document.querySelector('[role="main"]') || document.getElementById('root');
    if (!mainEl) return '';

    // Get all visible text content from main area (exclude the PA widget itself)
    const elements = mainEl.querySelectorAll('h1, h2, h3, h4, p, span, td, th, li, label, [data-value], .stat-value, .card-title');
    const textParts: string[] = [];
    const seen = new Set<string>();

    elements.forEach(el => {
      // Skip if inside the PA widget
      if (el.closest('.ai-agent-widget')) return;

      const text = (el.textContent || '').trim();
      if (text && text.length > 1 && text.length < 500 && !seen.has(text)) {
        seen.add(text);
        textParts.push(text);
      }
    });

    // Get table data if present
    const tables = mainEl.querySelectorAll('table');
    tables.forEach(table => {
      if (table.closest('.ai-agent-widget')) return;
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, ri) => {
        if (ri > 20) return; // Limit rows
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => (c.textContent || '').trim()).filter(Boolean);
        if (cells.length) textParts.push(`| ${cells.join(' | ')} |`);
      });
    });

    // Get KPI/stat cards
    const statCards = mainEl.querySelectorAll('[class*="stat"], [class*="kpi"], [class*="card"]');
    statCards.forEach(card => {
      if (card.closest('.ai-agent-widget')) return;
      const text = (card.textContent || '').trim();
      if (text && text.length < 200 && !seen.has(text)) {
        seen.add(text);
        textParts.push(text);
      }
    });

    // Get form values
    const inputs = mainEl.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.closest('.ai-agent-widget')) return;
      const el = input as HTMLInputElement;
      const label = el.closest('label')?.textContent || el.getAttribute('placeholder') || el.name || '';
      const value = el.value;
      if (value && label) textParts.push(`${label}: ${value}`);
    });

    // Truncate to prevent token overflow
    return textParts.slice(0, 150).join('\n').slice(0, 4000);
  } catch {
    return '';
  }
}

export default function AiAgentWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string; dataUrl: string; preview?: string }[]>([]);
  const [pageSnapshot, setPageSnapshot] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  // Dragging state
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const pageContext = detectPageContext(location.pathname);
  const contextLabel = CONTEXT_LABELS[pageContext] || 'Dashboard';

  // Reset messages when context changes
  useEffect(() => {
    setMessages([]);
    setPageSnapshot('');
  }, [pageContext]);

  // Always scan page content — regardless of open/closed state
  useEffect(() => {
    setIsScanning(true);
    const snapshot = scanPageContent();
    setPageSnapshot(snapshot);
    setIsScanning(false);

    const interval = setInterval(() => {
      const fresh = scanPageContent();
      setPageSnapshot(fresh);
    }, 10000);

    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 20 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const isImage = file.type.startsWith('image/');
        setAttachedFiles(prev => [...prev, { name: file.name, type: file.type, dataUrl, preview: isImage ? dataUrl : undefined }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (prompt: string) => {
    if ((!prompt.trim() && attachedFiles.length === 0) || thinking) return;

    const filesMeta = attachedFiles.map(f => ({ name: f.name, type: f.type, preview: f.preview }));
    const userMessage: UIMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: prompt,
      files: filesMeta.length > 0 ? filesMeta : undefined,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');

    // Build chat messages with page context included
    const chatMessages: ChatMsg[] = newMessages.map(m => {
      if (m.role === 'user' && m.files?.length) {
        const fileDescriptions = m.files.map(f => `[Vedhæftet fil: ${f.name} (${f.type})]`).join('\n');
        return { role: m.role, content: m.content ? `${m.content}\n\n${fileDescriptions}` : fileDescriptions };
      }
      return { role: m.role, content: m.content };
    });

    // If current message has image files, send as multimodal
    if (attachedFiles.some(f => f.type.startsWith('image/'))) {
      const lastIdx = chatMessages.length - 1;
      const imageFiles = attachedFiles.filter(f => f.type.startsWith('image/'));
      const contentParts: ChatContentPart[] = [
        { type: "text", text: prompt || "Analysér dette billede" },
        ...imageFiles.map(f => ({ type: "image_url" as const, image_url: { url: f.dataUrl } })),
      ];
      chatMessages[lastIdx] = { role: 'user', content: contentParts };
    }

    setAttachedFiles([]);
    setThinking(true);

    // Re-scan page right before sending for freshest context
    const freshSnapshot = scanPageContent();

    let assistantSoFar = '';
    try {
      await streamChat({
        messages: chatMessages,
        pageContext: location.pathname,
        pageSnapshot: freshSnapshot,
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
        onDone: () => setThinking(false),
      });
    } catch (error) {
      setMessages(prev => [...prev, { id: `${Date.now()}-err`, role: 'assistant', content: (error as Error).message || 'AI fejlede.' }]);
      setThinking(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const lastMessages = useMemo(() => messages.slice(-30), [messages]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessages]);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      const dx = dragStart.current.x - e.clientX;
      const dy = dragStart.current.y - e.clientY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragStart.current.posX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 80, dragStart.current.posY + dy)),
      });
    };
    const onMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [dragging]);

  const quickActions = [
    { label: '📋 Lav to-do liste', prompt: 'Lav en prioriteret to-do liste baseret på mine kommende deadlines fra hele systemet.' },
    { label: `💡 Tip til ${contextLabel}`, prompt: `Giv mig 3 konkrete handlinger jeg bør tage lige nu baseret på ${contextLabel}-data.` },
    { label: `👁️ Analysér denne side`, prompt: `Analysér alt hvad du kan se på denne side og giv mig konkrete anbefalinger og indsigter.` },
  ];

  return (
    <div className="fixed z-50 ai-agent-widget" style={{ bottom: `${position.y}px`, right: `${position.x}px` }}>
      {open && (
        <Card className="w-[400px] max-h-[75vh] flex flex-col shadow-2xl border-border bg-card/95 backdrop-blur-xl mb-2">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5 rounded-t-lg">
            <div className="flex items-center gap-2">
              <div onMouseDown={onMouseDown} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/50 transition-colors" title="Træk for at flytte">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              <UserRound className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Din PA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {contextLabel}
              </span>
              {/* Scanning indicator */}
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Eye className="h-3 w-3" />
                <span>Overvåger</span>
              </span>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} title="Luk – stopper overvågning">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3 min-h-[220px]">
            <div className="space-y-3">
              {lastMessages.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">Hej! Jeg er din personlige PA 👋</p>
                  <p className="text-xs mt-1">Jeg kan se alt på din {contextLabel}-side og hjælper dig proaktivt.</p>
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <Eye className="h-3 w-3" />
                    <span>Altid aktiv overvågning – jeg scanner løbende</span>
                  </div>
                </div>
              )}
              {lastMessages.map(m => (
                <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-muted text-foreground mr-4'}`}>
                  {m.files && m.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {m.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] bg-black/10 rounded px-1.5 py-0.5">
                          {f.preview ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                          {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              ))}
              {thinking && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="animate-pulse">●</span> AI tænker...
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs bg-background rounded-md px-2 py-1 border border-border">
                    {f.preview ? <img src={f.preview} alt={f.name} className="h-6 w-6 rounded object-cover" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <span className="max-w-[100px] truncate">{f.name}</span>
                    <button onClick={() => removeAttachedFile(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions + input */}
          <div className="px-4 py-3 border-t border-border space-y-2">
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {quickActions.map(a => (
                  <Button key={a.label} size="sm" variant="outline" onClick={() => sendMessage(a.prompt)} disabled={thinking} className="text-xs">
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={thinking} title="Vedhæft fil">
                <Paperclip className="h-4 w-4" />
              </Button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" className="hidden" onChange={handleFileAttach} />
              <Input
                placeholder={`Spørg om ${contextLabel}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                disabled={thinking}
                className="text-sm"
              />
              <Button size="icon" onClick={() => sendMessage(input)} disabled={thinking || (!input.trim() && attachedFiles.length === 0)}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
      {!open && (
        <div className="flex items-center gap-1.5">
          <div onMouseDown={onMouseDown} className="cursor-grab active:cursor-grabbing p-1.5 rounded-full bg-muted/80 hover:bg-muted shadow-md transition-colors" title="Træk for at flytte">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-0 bg-card/95 backdrop-blur-xl rounded-full shadow-lg border border-border overflow-hidden">
            <Button onClick={() => setOpen(true)} variant="ghost" className="rounded-full h-12 px-4 gap-2 hover:bg-primary/10">
              <UserRound className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium hidden sm:inline">PA</span>
              <span className="flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </span>
            </Button>
            <form
              className="flex items-center gap-1 pr-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) {
                  setOpen(true);
                  setTimeout(() => sendMessage(input), 100);
                }
              }}
            >
              <Input
                placeholder="Skriv til PA..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="h-9 w-[160px] sm:w-[200px] border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
              />
              <Button size="icon" type="submit" disabled={!input.trim()} className="h-8 w-8 rounded-full shrink-0">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
