import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { useConnectVoiceTelephony, useVoiceTelephonyAccount } from '@/hooks/api/useVoiceTelephony';
import { useAIStatus } from '@/hooks/api/useAIConnection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Bot, Phone, CheckCircle2, XCircle, ExternalLink, Plus, Play, Mic, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getErrorMessage } from '@/lib/errors';

interface TwilioAccount { account_sid: string; }
interface VoiceAgent { id: string; name: string; voice: string; language: string; system_prompt: string; greeting: string; is_active: boolean; }
interface VoiceCall { id: string; status: string; to_number: string; from_number: string | null; duration_seconds: number; recording_url: string | null; summary: string | null; started_at: string | null; agent_id: string | null; }
interface VoiceCallEvent { id: string; call_id: string; event_type: string; speaker: string | null; content: string | null; created_at: string; }

const VOICES = ['alloy', 'echo', 'shimmer', 'nova', 'onyx', 'fable'];
const LANGUAGES = [{ v: 'da', l: 'Dansk' }, { v: 'en', l: 'English' }, { v: 'de', l: 'Deutsch' }];

export default function VoiceAgentPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: twilioInfo, isLoading: twilioInfoLoading, refetch: refetchTwilio } = useVoiceTelephonyAccount();
  const connectVoiceProvider = useConnectVoiceTelephony();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [events, setEvents] = useState<VoiceCallEvent[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  // Twilio belongs to the AI Voice Agent only. The Device Power Dialer never reads this state.
  const twilioConnected = twilioInfo?.connected === true;
  const twilioPhoneNumbers = twilioInfo?.phoneNumbers || [];
  const hasTwilioNumber = twilioPhoneNumbers.length > 0;
  const twilio: TwilioAccount | null = twilioConnected
    ? { account_sid: twilioInfo?.account?.sid || 'connected' }
    : null;

  // Last logged status transition (shown in header)
  const [lastStatusChange, setLastStatusChange] = useState<{ status: string; at: string } | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Auto-refresh: on focus + every 10s while tab is visible
  useEffect(() => {
    const onFocus = () => refetchTwilio();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refetchTwilio();
    }, 10000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [refetchTwilio]);

  // Load most recent Twilio status transition from audit log
  const loadLastStatusChange = async (cid: string) => {
    const { data } = await supabase
      .from('activity_logs')
      .select('metadata, created_at')
      .eq('company_id', cid)
      .eq('action_type', 'twilio_status_changed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const status = (data.metadata as { new_status?: string } | null)?.new_status || 'unknown';
      setLastStatusChange({ status, at: data.created_at });
    }
  };

  // Detect transitions and log them to activity_logs
  useEffect(() => {
    if (!companyId || !user || twilioInfo === undefined) return;
    const current = !twilioConnected
      ? 'not_connected'
      : hasTwilioNumber
        ? 'connected'
        : 'connected_no_number';

    // Initialize baseline on first load (no log entry)
    if (prevStatusRef.current === null) {
      prevStatusRef.current = current;
      return;
    }
    if (prevStatusRef.current === current) return;

    const prev = prevStatusRef.current;
    prevStatusRef.current = current;

    const labels: Record<string, string> = {
      connected: 'Twilio fully connected',
      connected_no_number: 'Twilio connected — no phone number',
      not_connected: 'Twilio disconnected',
    };

    supabase.from('activity_logs').insert({
      user_id: user.id,
      company_id: companyId,
      action_type: 'twilio_status_changed',
      entity_type: 'voice_agent',
      description: `${labels[prev]} → ${labels[current]}`,
      metadata: { prev_status: prev, new_status: current, source: 'voice_agent' },
    }).then(({ error }) => {
      if (!error) setLastStatusChange({ status: current, at: new Date().toISOString() });
    });
  }, [twilioConnected, hasTwilioNumber, companyId, user, twilioInfo]);


  // New agent dialog
  const [agentDialog, setAgentDialog] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentVoice, setAgentVoice] = useState('alloy');
  const [agentLanguage, setAgentLanguage] = useState('da');
  const [agentPrompt, setAgentPrompt] = useState('You are a friendly sales assistant calling on behalf of our company. Be polite, brief, and helpful.');
  const [agentGreeting, setAgentGreeting] = useState('Hej, det er en AI-assistent fra os. Har du to minutter til en kort snak?');

  // Call dialog
  const [callDialog, setCallDialog] = useState(false);
  const [callAgentId, setCallAgentId] = useState('');
  const [callTo, setCallTo] = useState('');
  const [calling, setCalling] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) { setLoading(false); return; }
      setCompanyId(profile.company_id);

      const [ag, cl] = await Promise.all([
        supabase.from('voice_agents').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false }),
        supabase.from('voice_calls').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(50),
      ]);
      setAgents(ag.data || []);
      setCalls(cl.data || []);
      loadLastStatusChange(profile.company_id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [user?.id]);

  // Realtime subscription for calls + events
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`voice-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_calls', filter: `company_id=eq.${companyId}` }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_call_events', filter: `company_id=eq.${companyId}` }, (payload) => {
        const ev = payload.new as VoiceCallEvent;
        if (ev.call_id === selectedCallId) setEvents(prev => [...prev, ev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, selectedCallId]);

  // Load events when call selected
  useEffect(() => {
    if (!selectedCallId) { setEvents([]); return; }
    supabase.from('voice_call_events').select('*').eq('call_id', selectedCallId).order('created_at').then(({ data }) => setEvents(data || []));
  }, [selectedCallId]);

  // Helper: invoke edge function and surface real error from response body
  const invokeWithError = async (fn: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      // FunctionsHttpError -> read body for real message
      let msg = error.message;
      try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }>; text?: () => Promise<string> } }).context;
        if (ctx && typeof ctx.json === 'function') {
          const parsed = await ctx.json();
          if (parsed?.error) msg = parsed.error;
        } else if (ctx && typeof ctx.text === 'function') {
          const txt = await ctx.text();
          if (txt) msg = txt;
        }
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const createAgent = async () => {
    if (!agentName.trim() || !companyId) return;
    const { error } = await supabase.from('voice_agents').insert({
      company_id: companyId,
      name: agentName.trim(),
      voice: agentVoice,
      language: agentLanguage,
      system_prompt: agentPrompt,
      greeting: agentGreeting,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t('voiceAgent.agentCreated'));
    setAgentDialog(false);
    setAgentName('');
    loadAll();
  };

  const startCall = async () => {
    if (!callAgentId || !callTo) return;
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-agent-call', { body: { agentId: callAgentId, toNumber: callTo } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(t('voiceAgent.callInitiated'));
      setCallDialog(false);
      setCallTo('');
      setSelectedCallId(data.callId);
      loadAll();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Call failed');
    } finally {
      setCalling(false);
    }
  };

  // Twilio connection alone is enough to manage agents; a phone number is required to actually place a call.
  // AI availability is checked separately (real health check below), not assumed.
  const isReady = !!twilio;
  const { data: aiStatus, isLoading: aiStatusLoading } = useAIStatus();
  const canCall = isReady && hasTwilioNumber;

  const connectVoiceTelephony = async () => {
    try {
      await connectVoiceProvider.mutateAsync();
      toast.success(t('voiceAgent.connectionSaved'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            {t('voiceAgent.title') || 'Voice Agent'}
          </h1>
          <p className="text-muted-foreground mt-1">{t('voiceAgent.subtitle') || 'AI-powered phone calls — every step recorded and transcribed.'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {twilioInfoLoading ? (
              // Live-verified bug (2026-09-05): before this query resolved,
              // twilioInfo was undefined, twilioConnected defaulted to
              // false, and this banner rendered a decisive "Twilio not
              // connected" for a real, already-connected account — a
              // flash-of-wrong-status on every page load.
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('common.loading') || 'Loading…'}
              </Badge>
            ) : canCall ? (
              <Badge variant="default" className="gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('voiceAgent.twilioConnected')} · {twilioPhoneNumbers.length} {twilioPhoneNumbers.length === 1 ? t('voiceAgent.numberSingular') : t('voiceAgent.numberPlural')} {t('voiceAgent.readySuffix')}
              </Badge>
            ) : isReady ? (
              <Badge variant="outline" className="gap-1.5 border-amber-500/40 text-amber-300 bg-amber-500/10">
                <AlertCircle className="h-3.5 w-3.5" />
                {t('voiceAgent.twilioConnectedNoNumber')}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive bg-destructive/10">
                <XCircle className="h-3.5 w-3.5" />
                {t('voiceAgent.twilioNotConnected')}
              </Badge>
            )}
            {!isReady && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5"
                onClick={connectVoiceTelephony}
                disabled={connectVoiceProvider.isPending}
              >
                {connectVoiceProvider.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {t('voiceAgent.connectVoiceTelephony')}
              </Button>
            )}
            {isReady && !hasTwilioNumber && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                <a href="https://console.twilio.com/" target="_blank" rel="noreferrer">
                  {t('voiceAgent.manageNumbers')} <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {lastStatusChange && (
              <span className="text-xs text-muted-foreground">
                {t('voiceAgent.lastChange')} {formatDistanceToNow(new Date(lastStatusChange.at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        {canCall && agents.length > 0 && (
          <Button onClick={() => setCallDialog(true)} className="gap-2">
            <Phone className="h-4 w-4" /> {t('voiceAgent.startCall') || 'Start AI Call'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections">{t('voiceAgent.tabs.connections') || 'Connections'}</TabsTrigger>
          <TabsTrigger value="agents" disabled={!isReady}>{t('voiceAgent.tabs.agents') || 'Agents'}</TabsTrigger>
          <TabsTrigger value="live">{t('voiceAgent.tabs.live') || 'Live & Timeline'}</TabsTrigger>
          <TabsTrigger value="history">{t('voiceAgent.tabs.history') || 'History'}</TabsTrigger>
        </TabsList>

        {/* CONNECTIONS */}
        <TabsContent value="connections" className="space-y-4">
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Twilio card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Twilio</CardTitle>
                    {twilio ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('voiceAgent.connected')}</Badge>
                            : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{t('voiceAgent.notConnected')}</Badge>}
                  </div>
                  <CardDescription>{t('voiceAgent.twilioCardDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {twilio ? (
                    <div className="text-sm space-y-2">
                      <div className="text-muted-foreground">{t('voiceAgent.accountSid')}</div>
                      <code className="text-xs">{twilio.account_sid.slice(0, 12)}…{twilio.account_sid.slice(-4)}</code>
                      {!hasTwilioNumber && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                          {t('voiceAgent.numberMissingHelp')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={connectVoiceTelephony}
                      disabled={connectVoiceProvider.isPending}
                    >
                      {connectVoiceProvider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                      {t('voiceAgent.connectVoiceTelephony')}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* AI model — one shared, platform-wide provider (currently
                  Groq). No per-company connection needed. Status below is a
                  real health check (useAIStatus), never a static badge —
                  this card used to hardcode "Ollama (selv-hostet) ✓ Online"
                  regardless of actual reachability. */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI-model</CardTitle>
                    {aiStatusLoading ? (
                      <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Tjekker…</Badge>
                    ) : aiStatus?.online ? (
                      <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Online</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><XCircle className="h-3 w-3" /> Ikke tilgængelig</Badge>
                    )}
                  </div>
                  <CardDescription>
                    {aiStatus?.online
                      ? 'Samtalens svar genereres af en delt AI-model — ingen opsætning nødvendig.'
                      : (aiStatus?.detail || 'AI-modellen svarer ikke lige nu — dette kræver ingen handling fra jer.')}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          )}

          {!isReady && !loading && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('voiceAgent.voiceSetupHelp')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AGENTS */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAgentDialog(true)} className="gap-2"><Plus className="h-4 w-4" /> {t('voiceAgent.newAgent')}</Button>
          </div>
          {agents.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">{t('voiceAgent.noAgentsYet')}</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map(a => (
                <Card key={a.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    <CardDescription>{t('voiceAgent.voiceLabel')}: {a.voice} · {a.language.toUpperCase()}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground line-clamp-3">{a.greeting}</p>
                    <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => { setCallAgentId(a.id); setCallDialog(true); }}>
                      <Play className="h-3 w-3" /> {t('voiceAgent.testCall')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* LIVE */}
        <TabsContent value="live" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle className="text-base">{t('voiceAgent.recentCalls')}</CardTitle></CardHeader>
              <CardContent className="space-y-1 max-h-96 overflow-y-auto">
                {calls.length === 0 ? <p className="text-sm text-muted-foreground">{t('voiceAgent.noCallsYet')}</p> : calls.slice(0, 20).map(c => (
                  <button key={c.id} onClick={() => setSelectedCallId(c.id)}
                    className={`w-full text-left p-2 rounded text-sm hover:bg-muted ${selectedCallId === c.id ? 'bg-muted' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.to_number}</span>
                      <Badge variant={c.status === 'completed' ? 'default' : c.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">{c.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{c.started_at ? formatDistanceToNow(new Date(c.started_at), { addSuffix: true }) : '—'}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4" /> {t('voiceAgent.callTimeline')}</CardTitle></CardHeader>
              <CardContent>
                {!selectedCallId ? <p className="text-sm text-muted-foreground">{t('voiceAgent.selectCallPrompt')}</p> : (
                  <div className="space-y-3">
                    {(() => { const c = calls.find(x => x.id === selectedCallId); return c?.recording_url ? (
                      <div className="rounded-lg border p-3 bg-muted/30">
                        <div className="text-xs font-medium mb-2">{t('voiceAgent.recording')}</div>
                        <audio controls className="w-full" src={c.recording_url} />
                      </div>
                    ) : null; })()}
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {events.length === 0 ? <p className="text-sm text-muted-foreground">{t('voiceAgent.waitingForEvents')}</p> : events.map(e => (
                        <div key={e.id} className="flex gap-3 text-sm border-l-2 border-border pl-3 py-1">
                          <div className="text-xs text-muted-foreground min-w-20">{new Date(e.created_at).toLocaleTimeString()}</div>
                          <div className="flex-1">
                            <Badge variant="outline" className="text-xs mr-2">{e.speaker || t('voiceAgent.systemLabel')}</Badge>
                            <span className="text-muted-foreground text-xs mr-2">{e.event_type}</span>
                            {e.content && <div className="mt-1">{e.content}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              {calls.length === 0 ? <p className="text-sm text-muted-foreground">{t('voiceAgent.noCallsYet')}</p> : (
                <div className="space-y-2">
                  {calls.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{c.to_number}</div>
                        <div className="text-xs text-muted-foreground">{c.started_at ? new Date(c.started_at).toLocaleString() : '—'} · {c.duration_seconds}s</div>
                        {c.summary && <div className="text-xs mt-1 line-clamp-2 max-w-2xl">{c.summary}</div>}
                      </div>
                      <Badge variant={c.status === 'completed' ? 'default' : 'secondary'}>{c.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Agent Dialog */}
      <Dialog open={agentDialog} onOpenChange={setAgentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('voiceAgent.newVoiceAgentTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('voiceAgent.nameLabel')}</Label><Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Sales Agent NL" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('voiceAgent.voiceLabel')}</Label>
                <Select value={agentVoice} onValueChange={setAgentVoice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VOICES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t('voiceAgent.languageLabel')}</Label>
                <Select value={agentLanguage} onValueChange={setAgentLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>{t('voiceAgent.greetingLabel')}</Label>
              <Textarea value={agentGreeting} onChange={e => setAgentGreeting(e.target.value)} rows={2} />
            </div>
            <div><Label>{t('voiceAgent.systemPromptLabel')}</Label>
              <Textarea value={agentPrompt} onChange={e => setAgentPrompt(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialog(false)}>{t('voiceAgent.cancel')}</Button>
            <Button onClick={createAgent} disabled={!agentName.trim()}>{t('voiceAgent.createCta')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Dialog */}
      <Dialog open={callDialog} onOpenChange={setCallDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('voiceAgent.startAiCallTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('voiceAgent.agentLabel')}</Label>
              <Select value={callAgentId} onValueChange={setCallAgentId}>
                <SelectTrigger><SelectValue placeholder={t('voiceAgent.selectAgent')} /></SelectTrigger>
                <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('voiceAgent.phoneNumberLabel')}</Label>
              <Input value={callTo} onChange={e => setCallTo(e.target.value)} placeholder="+45..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallDialog(false)}>{t('voiceAgent.cancel')}</Button>
            <Button onClick={startCall} disabled={calling || !callAgentId || !callTo}>{calling ? t('voiceAgent.callingLabel') : t('voiceAgent.callCta')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
