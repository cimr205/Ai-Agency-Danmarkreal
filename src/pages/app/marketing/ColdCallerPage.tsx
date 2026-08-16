import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Phone, PhoneCall, PhoneOff, Mic, MicOff, Volume2, VolumeX,
  Users, Clock, Target, Play, Pause, SkipForward, ArrowRight,
  CheckCircle2, Wifi, WifiOff, BarChart3, History, Settings2,
  AlertCircle, Loader2, PhoneForwarded, Timer, FileText,
  ThumbsUp, ThumbsDown, RotateCcw, AlertTriangle,
  MessageSquare, Download, Hash, Delete, Import, Upload,
  Zap, ChevronRight, CircleDot, Radio, Sparkles, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useLeads } from "@/hooks/api/useLeads";
import { useTwilioAccount, useColdCallerUsage, useStartSession, useEndSession, useMakeCall, useSaveTwilioCredentials, useConnectDefaultTwilio, useDisconnectTwilio, useSearchNumbers, useBuyNumber, useReleaseNumber, type TwilioPhoneNumber, type NumberSearchResult } from "@/hooks/api/useColdCaller";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<'leads'>;

/* ─── Animated waveform ─── */
function Waveform({ active, size = "md" }: { active: boolean; size?: "sm" | "md" | "lg" }) {
  const [tick, setTick] = useState(0);
  const barCount = size === "lg" ? 32 : size === "md" ? 24 : 16;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-12">
      {Array.from({ length: barCount }).map((_, i) => {
        const h = active
          ? 6 + Math.abs(Math.sin((tick + i) * 0.4)) * 30 + Math.sin((tick + i * 1.7) * 0.3) * 12
          : 2;
        return (
          <div
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-75",
              active ? "bg-gradient-to-t from-emerald-500 to-cyan-400" : "bg-muted-foreground/10"
            )}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

/* ─── Pulsing caller ring ─── */
function CallerRing({ status }: { status: string }) {
  const isActive = status === "connected";
  const isDialing = status === "dialing";
  return (
    <div className="relative mx-auto w-fit">
      {isActive && (
        <>
          <div className="absolute -inset-5 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 blur-xl animate-pulse" />
          <div className="absolute -inset-3 rounded-full border border-emerald-500/20 animate-ping" style={{ animationDuration: "2s" }} />
        </>
      )}
      {isDialing && (
        <>
          <div className="absolute -inset-4 rounded-full border-2 border-amber-400/30 animate-ping" />
          <div className="absolute -inset-6 rounded-full border border-amber-400/10 animate-ping" style={{ animationDelay: "0.5s" }} />
        </>
      )}
      <div className={cn(
        "relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-700 border-2",
        isActive ? "bg-gradient-to-br from-emerald-500 to-cyan-600 border-emerald-400/50 shadow-[0_0_60px_rgba(16,185,129,0.5)]" :
        isDialing ? "bg-gradient-to-br from-amber-500/30 to-orange-500/30 border-amber-400/50 shadow-[0_0_40px_rgba(245,158,11,0.3)]" :
        "bg-muted/30 border-border/50"
      )}>
        {isDialing ? (
          <Loader2 className="h-10 w-10 text-amber-400 animate-spin" />
        ) : isActive ? (
          <PhoneCall className="h-10 w-10 text-white animate-pulse" />
        ) : (
          <Phone className="h-10 w-10 text-muted-foreground/40" />
        )}
      </div>
    </div>
  );
}

/* ─── Numpad Dialer ─── */
function Numpad({ value, onChange, onCall, disabled }: { value: string; onChange: (v: string) => void; onCall: () => void; disabled: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  const sub = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ", "", "+", ""];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="+45 00 00 00 00"
          className="text-center text-xl font-mono tracking-wider h-14 bg-muted/20 border-border/30"
        />
        {value && (
          <button
            onClick={() => onChange(value.slice(0, -1))}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Delete className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key, i) => (
          <button
            key={key}
            onClick={() => onChange(value + key)}
            className="h-14 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/20 hover:border-border/40 transition-all duration-150 active:scale-95 flex flex-col items-center justify-center gap-0"
          >
            <span className="text-lg font-semibold">{key}</span>
            {sub[i] && <span className="text-[9px] text-muted-foreground/60 tracking-[0.2em]">{sub[i]}</span>}
          </button>
        ))}
      </div>
      <Button
        onClick={onCall}
        disabled={disabled || !value}
        className="w-full h-14 rounded-xl text-lg gap-3 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.97]"
      >
        <Phone className="h-5 w-5" /> Ring op
      </Button>
    </div>
  );
}

/* ─── Format time ─── */
const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/* ─── Call Script Templates ─── */
const CALL_SCRIPTS = [
  { id: "intro", label: "Introduktion", content: "Hej [navn], mit navn er [dit navn] fra [firma]. Jeg ringer fordi vi har en løsning der kan hjælpe jer med [problem].\n\nHar du 2 minutter til at høre mere?" },
  { id: "followup", label: "Opfølgning", content: "Hej [navn], vi talte sidst om [emne]. Jeg ville lige følge op og høre om I har haft tid til at overveje vores tilbud?\n\nEr der noget jeg kan uddybe?" },
  { id: "meeting", label: "Book møde", content: "Hej [navn], jeg vil gerne foreslå et kort møde hvor vi kan gennemgå jeres behov.\n\nHvornår passer det bedst for jer - tirsdag eller torsdag i næste uge?" },
];

type CallDisposition = "interested" | "not_interested" | "callback" | "no_answer" | "wrong_number" | null;

export default function ColdCallerPage() {
  const { t, locale } = useI18n();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: twilioInfo, isLoading: twilioLoading } = useTwilioAccount();
  const { data: usageHistory } = useColdCallerUsage();
  const startSession = useStartSession();
  const endSession = useEndSession();
  const makeCall = useMakeCall();
  const saveCredentials = useSaveTwilioCredentials();
  const connectDefaultTwilio = useConnectDefaultTwilio();
  const disconnectTwilio = useDisconnectTwilio();
  const searchNumbers = useSearchNumbers();
  const buyNumber = useBuyNumber();
  const releaseNumber = useReleaseNumber();

  const [activeTab, setActiveTab] = useState("dialer");
  const [dialerMode, setDialerMode] = useState<"power" | "manual">("power");
  const [manualNumber, setManualNumber] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [currentLeadIdx, setCurrentLeadIdx] = useState(0);
  const [callStatus, setCallStatus] = useState<"idle" | "dialing" | "connected" | "ended">("idle");
  const [sessionStats, setSessionStats] = useState({ calls: 0, connected: 0, duration: 0 });
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [callDisposition, setCallDisposition] = useState<CallDisposition>(null);
  const [callNotes, setCallNotes] = useState("");
  const [selectedScript, setSelectedScript] = useState<string>("intro");
  const [dispositionHistory, setDispositionHistory] = useState<Array<{leadId: string; leadName: string; disposition: CallDisposition; notes: string; time: string; duration: number}>>([]);
  const [setupSid, setSetupSid] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [autoDialNext, setAutoDialNext] = useState(true);
  const [numberSearchCountry, setNumberSearchCountry] = useState("US");
  const [numberSearchArea, setNumberSearchArea] = useState("");
  const [numberSearchType, setNumberSearchType] = useState("local");
  const [searchResults, setSearchResults] = useState<NumberSearchResult[]>([]);
  const [showNumberSearch, setShowNumberSearch] = useState(false);
  const [buyingNumber, setBuyingNumber] = useState<string | null>(null);
  const [aiScript, setAiScript] = useState<string>("");
  const [aiScriptLoading, setAiScriptLoading] = useState(false);
  const [aiScriptLeadId, setAiScriptLeadId] = useState<string | null>(null);

  const isConnected = twilioInfo?.connected === true;
  const isTrial = twilioInfo?.account?.type === "Trial";
  const phoneNumbers = twilioInfo?.phoneNumbers || [];
  const leadsArray = Array.isArray(leads) ? leads : (leads?.data ?? []);
  const leadQueue = useMemo(() => leadsArray.filter((l: Lead) => l.phone).slice(0, 100), [leadsArray]);
  const currentLead = leadQueue[currentLeadIdx];

  const currencyFormatter = useCallback((amount: number) => {
    const cfg = locale === 'da' ? { currency: 'DKK', locale: 'da-DK' } : locale === 'de' ? { currency: 'EUR', locale: 'de-DE' } : { currency: 'EUR', locale: 'en-GB' };
    return new Intl.NumberFormat(cfg.locale, { style: 'currency', currency: cfg.currency }).format(amount);
  }, [locale]);

  useEffect(() => {
    if (phoneNumbers.length === 0) {
      if (selectedFromNumber) setSelectedFromNumber("");
      return;
    }

    const stillExists = phoneNumbers.some((n: TwilioPhoneNumber) => n.phone_number === selectedFromNumber);
    if (!selectedFromNumber || !stillExists) {
      setSelectedFromNumber(phoneNumbers[0].phone_number);
    }
  }, [phoneNumbers, selectedFromNumber]);

  useEffect(() => {
    if (callStatus === "connected") {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  const handleStartSession = useCallback(async () => {
    try {
      const session = await startSession.mutateAsync();
      setSessionId(session.id);
      setIsSessionActive(true);
      setSessionStats({ calls: 0, connected: 0, duration: 0 });
      setDispositionHistory([]);
      toast({ title: "Session startet", description: "Klar til at ringe!" });
    } catch (e) {
      toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }, [startSession]);

  const handleEndSession = useCallback(async () => {
    if (sessionId) {
      try { await endSession.mutateAsync({ sessionId, calls_made: sessionStats.calls, leads_created: 0, duration_seconds: sessionStats.duration }); } catch {}
    }
    setIsSessionActive(false);
    setSessionId(null);
    setCallStatus("idle");
    toast({ title: "Session afsluttet", description: `${sessionStats.calls} opkald · ${fmt(sessionStats.duration)} total tid` });
  }, [endSession, sessionId, sessionStats]);

  const handleStartCall = useCallback(async (phone?: string, leadId?: string, leadName?: string) => {
    const callTo = phone || (dialerMode === "manual" ? manualNumber : currentLead?.phone);
    if (!callTo || !selectedFromNumber) return;
    setCallStatus("dialing");
    setCallDuration(0);
    setCallDisposition(null);
    setCallNotes("");
    try {
      await makeCall.mutateAsync({ to: callTo, from: selectedFromNumber, leadId: leadId || currentLead?.id, leadName: leadName || currentLead?.name });
      setCallStatus("connected");
    } catch (e) {
      toast({ title: "Opkald fejlede", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setCallStatus("idle");
    }
  }, [currentLead, selectedFromNumber, makeCall, dialerMode, manualNumber]);

  const handleEndCall = useCallback(() => {
    const wasConnected = callDuration > 3;
    setCallStatus("ended");
    setSessionStats(prev => ({ calls: prev.calls + 1, connected: prev.connected + (wasConnected ? 1 : 0), duration: prev.duration + callDuration }));
  }, [callDuration]);

  const handleLogAndNext = useCallback(() => {
    if (currentLead && callDisposition) {
      setDispositionHistory(prev => [...prev, {
        leadId: currentLead.id, leadName: currentLead.name, disposition: callDisposition, notes: callNotes,
        time: new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }), duration: callDuration,
      }]);
    }
    setCallDisposition(null);
    setCallNotes("");
    setCallDuration(0);
    const nextIdx = (currentLeadIdx + 1) % Math.max(leadQueue.length, 1);
    setCurrentLeadIdx(nextIdx);
    setCallStatus("idle");
    // Auto-dial next
    if (autoDialNext && isSessionActive && leadQueue[nextIdx]?.phone) {
      setTimeout(() => handleStartCall(leadQueue[nextIdx].phone, leadQueue[nextIdx].id, leadQueue[nextIdx].name), 1200);
    }
  }, [currentLead, callDisposition, callNotes, callDuration, currentLeadIdx, leadQueue, autoDialNext, isSessionActive, handleStartCall]);

  const handleSkipLead = useCallback(() => {
    setCurrentLeadIdx(i => (i + 1) % Math.max(leadQueue.length, 1));
    setCallStatus("idle");
    setCallDuration(0);
    setCallDisposition(null);
    setCallNotes("");
  }, [leadQueue.length]);

  const handleExportSession = useCallback(() => {
    if (dispositionHistory.length === 0) return;
    const csv = ["Time,Lead,Disposition,Duration,Notes", ...dispositionHistory.map(d =>
      `${d.time},"${d.leadName}",${d.disposition},${fmt(d.duration)},"${d.notes.replace(/"/g, '""')}"`
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `power-dialer-session-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [dispositionHistory]);

  const handleGenerateAiScript = useCallback(async (lead: Lead | undefined, type: string = "intro") => {
    if (!lead) return;
    setAiScriptLoading(true);
    setAiScriptLeadId(lead.id);
    setAiScript("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-call-script", {
        body: {
          leadName: lead.name,
          companyName: lead.company_name,
          industry: lead.industry,
          phone: lead.phone,
          email: lead.email,
          notes: lead.notes,
          scriptType: type,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAiScript(data.script);
    } catch (e) {
      toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setAiScript("");
    } finally {
      setAiScriptLoading(false);
    }
  }, []);

  const totalCalls = usageHistory?.reduce((s: number, u) => s + (u.calls_made || 0), 0) ?? 0;
  const totalMinutes = Math.round((usageHistory?.reduce((s: number, u) => s + (u.duration_seconds || 0), 0) ?? 0) / 60);
  const totalSessions = usageHistory?.length ?? 0;
  const connectRate = sessionStats.calls > 0 ? Math.round((sessionStats.connected / sessionStats.calls) * 100) : 0;

  const dispositionLabels: Record<string, { label: string; icon: typeof ThumbsUp; color: string }> = {
    interested: { label: "Interesseret", icon: ThumbsUp, color: "text-emerald-400" },
    not_interested: { label: "Ikke interesseret", icon: ThumbsDown, color: "text-red-400" },
    callback: { label: "Ring igen", icon: RotateCcw, color: "text-amber-400" },
    no_answer: { label: "Ingen svar", icon: PhoneOff, color: "text-muted-foreground" },
    wrong_number: { label: "Forkert nr.", icon: AlertCircle, color: "text-red-300" },
  };

  if (twilioLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-fit">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center animate-pulse">
              <Phone className="h-7 w-7 text-emerald-400" />
            </div>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Ambient glows */}
      <div className="absolute -top-20 left-1/4 w-[500px] h-[300px] bg-gradient-to-b from-emerald-500/8 via-cyan-500/4 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -top-10 right-1/4 w-[400px] h-[250px] bg-gradient-to-b from-cyan-500/6 via-blue-500/3 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Trial warning */}
      {isConnected && isTrial && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-300">Trial-konto — begrænsede opkald</p>
              <p className="text-sm text-muted-foreground mt-1">Opgradér din Twilio-konto for ubegrænsede opkald.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl opacity-50 group-hover:opacity-75 blur transition-opacity" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600">
              <Zap className="h-6 w-6 text-white" />
            </div>
            {isSessionActive && <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 animate-pulse border-2 border-background" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Power Dialer
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-400 border-amber-500/30">
                Beta
              </Badge>
              {isConnected ? (
                <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  <Radio className="h-2.5 w-2.5" /> Live
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/30">
                  <WifiOff className="h-2.5 w-2.5" /> Offline
                </Badge>
              )}
              {isSessionActive && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse">
                  <CircleDot className="h-2.5 w-2.5" /> Session aktiv
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && phoneNumbers.length > 1 && (
            <Select value={selectedFromNumber} onValueChange={setSelectedFromNumber}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Vælg nummer" /></SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((n: TwilioPhoneNumber) => (
                  <SelectItem key={n.sid} value={n.phone_number}>{n.friendly_name || n.phone_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {dispositionHistory.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportSession} className="gap-2">
              <Download className="h-4 w-4" /> Eksportér
            </Button>
          )}

          <Button
            size="lg"
            onClick={isSessionActive ? handleEndSession : () => setConfirmStartOpen(true)}
              disabled={!isConnected || !selectedFromNumber || startSession.isPending}
            className={cn(
              "gap-2 rounded-xl px-6 transition-all duration-300",
              isSessionActive
                ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
                : "bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 shadow-lg shadow-emerald-500/20"
            )}
          >
            {startSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isSessionActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isSessionActive ? "Stop session" : "Start session"}
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmStartOpen} onOpenChange={setConfirmStartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-emerald-400" /> Start Power Dialer</DialogTitle>
            <DialogDescription>Start en opkaldssession med dine leads.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Leads med telefon</span>
                <span className="font-bold text-emerald-400">{leadQueue.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ring fra</span>
                <span className="font-mono text-xs">{selectedFromNumber || "Intet nummer"}</span>
              </div>
              {isTrial && (
                <div className="flex items-center gap-2 text-xs text-amber-400 mt-1">
                  <AlertTriangle className="h-3 w-3" /> Trial — begrænsede opkald
                </div>
              )}
            </div>
            <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 cursor-pointer">
              <input type="checkbox" checked={autoDialNext} onChange={e => setAutoDialNext(e.target.checked)} className="rounded" />
              <div>
                <p className="text-sm font-medium">Auto-dial næste lead</p>
                <p className="text-xs text-muted-foreground">Ring automatisk næste lead efter disposition</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStartOpen(false)}>Annullér</Button>
            <Button className="bg-gradient-to-r from-emerald-500 to-cyan-600 gap-2" onClick={() => { setConfirmStartOpen(false); handleStartSession(); }}>
              <Play className="h-4 w-4" /> Start session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live KPIs */}
      {isSessionActive && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Opkald", value: sessionStats.calls, icon: Phone, gradient: "from-cyan-500 to-blue-600" },
            { label: "Forbundet", value: sessionStats.connected, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-600" },
            { label: "Hit rate", value: `${connectRate}%`, icon: Target, gradient: "from-violet-500 to-purple-600" },
            { label: "Session tid", value: fmt(sessionStats.duration), icon: Timer, gradient: "from-amber-500 to-orange-600" },
            { label: "Kø", value: `${currentLeadIdx + 1}/${leadQueue.length}`, icon: Users, gradient: "from-pink-500 to-rose-600" },
          ].map((kpi, i) => (
            <Card key={i} className="liquid-glass-card p-3 relative overflow-hidden">
              <div className="flex items-center gap-2.5">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br shrink-0", kpi.gradient)}>
                  <kpi.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-none">{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Main content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="dialer" className="gap-2"><Phone className="h-4 w-4" /> Power Dialer</TabsTrigger>
          <TabsTrigger value="manual" className="gap-2"><Hash className="h-4 w-4" /> Manuel</TabsTrigger>
          <TabsTrigger value="script" className="gap-2"><FileText className="h-4 w-4" /> Scripts</TabsTrigger>
          <TabsTrigger value="usage" className="gap-2"><BarChart3 className="h-4 w-4" /> Statistik</TabsTrigger>
          <TabsTrigger value="account" className="gap-2"><Settings2 className="h-4 w-4" /> Konto</TabsTrigger>
        </TabsList>

        {/* ═══ POWER DIALER ═══ */}
        <TabsContent value="dialer" className="mt-4">
          {!isConnected ? (
            <Card className="liquid-glass-card overflow-hidden">
              {/* Hero banner */}
              <div className="relative p-8 pb-6 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-blue-500/10 border-b border-border/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="relative text-center space-y-4 max-w-lg mx-auto">
                  <div className="relative mx-auto w-fit">
                    <div className="absolute -inset-3 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
                      <Zap className="h-9 w-9 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Kom i gang med Power Dialer</h2>
                    <p className="text-muted-foreground mt-2">Ring op til dine leads direkte fra platformen. Sæt det op på 3 minutter.</p>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="p-6 space-y-4">
                <div className="grid gap-3">
                  {[
                    {
                      step: 1,
                      title: "Opret gratis Twilio-konto",
                      desc: "Twilio giver dig et telefonnummer til opkald. Gratis trial inkluderet.",
                      action: (
                        <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" className="gap-2 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700">
                            <Sparkles className="h-3.5 w-3.5" /> Opret konto gratis
                          </Button>
                        </a>
                      ),
                    },
                    {
                      step: 2,
                      title: "Kopiér Account SID & Auth Token",
                      desc: "Find dem på dit Twilio-dashboard under 'Account Info'.",
                      action: (
                        <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="gap-2">
                            <ArrowRight className="h-3.5 w-3.5" /> Åbn Twilio Console
                          </Button>
                        </a>
                      ),
                    },
                    {
                      step: 3,
                      title: "Indsæt dine oplysninger herunder",
                      desc: "Så er du klar til at ringe direkte fra platformen.",
                      action: null,
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex gap-4 p-4 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                      <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        {s.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                        {s.action && <div className="mt-2.5">{s.action}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Inline credential form */}
                <div className="p-5 rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/40 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Forbind din konto
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block text-muted-foreground">Account SID</label>
                      <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={setupSid} onChange={e => setSetupSid(e.target.value)} className="font-mono text-sm h-10" />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block text-muted-foreground">Auth Token</label>
                      <Input type="password" placeholder="Dit Auth Token" value={setupToken} onChange={e => setSetupToken(e.target.value)} className="font-mono text-sm h-10" />
                    </div>
                  </div>
                  <Button
                    className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-cyan-600 gap-2 shadow-lg shadow-emerald-500/20"
                    disabled={!setupSid.startsWith("AC") || setupToken.length < 10 || saveCredentials.isPending}
                    onClick={async () => {
                      try {
                        await saveCredentials.mutateAsync({ accountSid: setupSid, authToken: setupToken });
                        setSetupSid(""); setSetupToken("");
                        toast({ title: "Twilio forbundet!", description: "Din konto er nu aktiv. Du er klar til at ringe!" });
                      } catch (e) { toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
                    }}
                  >
                    {saveCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Forbind & kom i gang
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid lg:grid-cols-[1fr_380px] gap-5">
              {/* Main call panel */}
              <Card className={cn(
                "liquid-glass-card relative overflow-hidden transition-all duration-500",
                callStatus === "connected" && "ring-1 ring-emerald-500/30 shadow-[0_0_80px_rgba(16,185,129,0.12)]",
                callStatus === "dialing" && "ring-1 ring-amber-500/20 shadow-[0_0_60px_rgba(245,158,11,0.08)]",
              )}>
                {callStatus === "connected" && (
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500" style={{ backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />
                )}

                <div className="p-8 space-y-6">
                  {/* Lead info */}
                  <div className="text-center space-y-4">
                    <CallerRing status={callStatus} />
                    <div className="mt-4 space-y-1">
                      <h2 className="text-2xl font-bold">{currentLead?.name || "Ingen leads i kø"}</h2>
                      {currentLead?.company_name && (
                        <p className="text-sm text-muted-foreground">{currentLead.company_name}</p>
                      )}
                      {currentLead?.phone && (
                        <p className="text-lg font-mono text-muted-foreground/70 tracking-wider">{currentLead.phone}</p>
                      )}
                      {currentLead?.email && (
                        <p className="text-xs text-muted-foreground/50">{currentLead.email}</p>
                      )}
                    </div>

                    {/* Status badge */}
                    {callStatus !== "idle" && (
                      <div className="flex justify-center">
                        <Badge className={cn(
                          "text-sm px-5 py-1.5 rounded-full font-medium",
                          callStatus === "dialing" && "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse",
                          callStatus === "connected" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          callStatus === "ended" && "bg-muted text-muted-foreground",
                        )}>
                          {callStatus === "dialing" && "Ringer op..."}
                          {callStatus === "connected" && `🔴 Live · ${fmt(callDuration)}`}
                          {callStatus === "ended" && `Opkald afsluttet · ${fmt(callDuration)}`}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Waveform */}
                  <Waveform active={callStatus === "connected" && !isMuted} size="lg" />

                  {/* Call controls */}
                  <div className="flex items-center justify-center gap-5">
                    <Button
                      variant="outline" size="icon"
                      className={cn("rounded-full h-12 w-12 transition-all", isMuted && "bg-red-500/15 border-red-500/30 text-red-400")}
                      onClick={() => setIsMuted(!isMuted)}
                      disabled={callStatus !== "connected"}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>

                    {callStatus === "idle" || callStatus === "ended" ? (
                      <Button
                        onClick={() => handleStartCall()}
                        disabled={!currentLead?.phone || !isSessionActive || makeCall.isPending}
                        className="rounded-full h-16 w-16 bg-gradient-to-br from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 shadow-xl shadow-emerald-500/30 transition-all hover:scale-110 active:scale-95"
                      >
                        {makeCall.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Phone className="h-6 w-6" />}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleEndCall}
                        className="rounded-full h-16 w-16 bg-red-500 hover:bg-red-600 shadow-xl shadow-red-500/30 transition-all hover:scale-110 active:scale-95"
                      >
                        <PhoneOff className="h-6 w-6" />
                      </Button>
                    )}

                    <Button
                      variant="outline" size="icon"
                      className={cn("rounded-full h-12 w-12", !isSpeakerOn && "bg-muted")}
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      disabled={callStatus !== "connected"}
                    >
                      {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </Button>
                  </div>

                  {/* Quick actions */}
                  {callStatus === "idle" && isSessionActive && (
                    <div className="flex justify-center gap-3">
                      <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={handleSkipLead}>
                        <SkipForward className="h-4 w-4" /> Spring over
                      </Button>
                    </div>
                  )}

                  {/* Post-call disposition */}
                  {callStatus === "ended" && (
                    <div className="space-y-4 p-5 rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30">
                      <p className="text-sm font-semibold text-center flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Hvad skete der?
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {Object.entries(dispositionLabels).map(([key, val]) => {
                          const Icon = val.icon;
                          const isSelected = callDisposition === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setCallDisposition(key as CallDisposition)}
                              className={cn(
                                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs",
                                isSelected
                                  ? "bg-primary/10 border-primary/40 ring-2 ring-primary/30 scale-105"
                                  : "bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/50"
                              )}
                            >
                              <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : val.color)} />
                              <span className={cn("leading-tight text-center", isSelected && "font-medium")}>{val.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Textarea
                        placeholder="Tilføj noter..."
                        value={callNotes}
                        onChange={e => setCallNotes(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      <Button
                        onClick={handleLogAndNext}
                        disabled={!callDisposition}
                        className="w-full gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700"
                      >
                        <ChevronRight className="h-4 w-4" />
                        {autoDialNext ? "Log & ring næste" : "Log & fortsæt"}
                      </Button>
                    </div>
                  )}

                  {selectedFromNumber && (
                    <p className="text-center text-[10px] text-muted-foreground/40 font-mono">{selectedFromNumber}</p>
                  )}
                </div>
              </Card>

              {/* Lead queue sidebar */}
              <div className="space-y-4">
                {/* Queue header */}
                <Card className="liquid-glass-card overflow-hidden">
                  <div className="p-3 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-400" /> Lead-kø
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{leadQueue.length} leads</Badge>
                    </div>
                  </div>

                  {leadQueue.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground/20" />
                      <div>
                        <p className="text-sm font-medium">Ingen leads med telefon</p>
                        <p className="text-xs text-muted-foreground mt-1">Importér leads med telefonnumre fra CRM → Leads</p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => window.location.href = `/${locale}/app/crm/leads`}>
                        <Import className="h-4 w-4" /> Gå til Leads
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/20 max-h-[500px] overflow-y-auto">
                      {leadQueue.map((lead: Lead, i: number) => {
                        const disp = dispositionHistory.find(d => d.leadId === lead.id);
                        const isCurrent = i === currentLeadIdx;
                        return (
                          <button
                            key={lead.id}
                            onClick={() => { setCurrentLeadIdx(i); setCallStatus("idle"); setCallDuration(0); setCallDisposition(null); setCallNotes(""); }}
                            className={cn(
                              "w-full text-left px-3 py-2.5 transition-all hover:bg-accent/30",
                              isCurrent && "bg-gradient-to-r from-emerald-500/10 to-cyan-500/5 border-l-2 border-emerald-500"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className={cn("text-sm truncate", isCurrent ? "font-semibold" : "font-medium")}>{lead.name}</p>
                                  {isCurrent && callStatus === "connected" && (
                                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">{lead.company_name || lead.email}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {disp && (
                                  <Badge variant="outline" className={cn("text-[9px] px-1.5",
                                    disp.disposition === "interested" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                                    disp.disposition === "not_interested" && "bg-red-500/10 text-red-400 border-red-500/30",
                                    disp.disposition === "callback" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                                  )}>
                                    {dispositionLabels[disp.disposition!]?.label}
                                  </Badge>
                                )}
                                {isCurrent && <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />}
                              </div>
                            </div>
                            <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">{lead.phone}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Session log mini */}
                {dispositionHistory.length > 0 && (
                  <Card className="liquid-glass-card overflow-hidden">
                    <div className="p-3 border-b border-border/40">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" /> Log ({dispositionHistory.length})
                      </h3>
                    </div>
                    <div className="divide-y divide-border/20 max-h-[200px] overflow-y-auto">
                      {dispositionHistory.slice(-5).reverse().map((d, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.leadName}</p>
                            <p className="text-muted-foreground">{d.time} · {fmt(d.duration)}</p>
                          </div>
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {dispositionLabels[d.disposition!]?.label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ MANUAL DIAL ═══ */}
        <TabsContent value="manual" className="mt-4">
          <div className="max-w-sm mx-auto space-y-6">
            <Card className="liquid-glass-card p-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Manuel opkald</h3>
                <p className="text-xs text-muted-foreground mt-1">Tast et nummer og ring op</p>
              </div>

              {callStatus === "connected" || callStatus === "dialing" ? (
                <div className="space-y-6 text-center">
                  <CallerRing status={callStatus} />
                  <p className="text-xl font-mono tracking-wider">{manualNumber}</p>
                  <Badge className={cn(
                    "text-sm px-5 py-1.5 rounded-full",
                    callStatus === "dialing" ? "bg-amber-500/15 text-amber-400 animate-pulse" : "bg-emerald-500/15 text-emerald-400",
                  )}>
                    {callStatus === "dialing" ? "Ringer op..." : `🔴 ${fmt(callDuration)}`}
                  </Badge>
                  <Waveform active={callStatus === "connected"} />
                  <Button onClick={handleEndCall} className="rounded-full h-14 w-14 mx-auto bg-red-500 hover:bg-red-600 shadow-xl shadow-red-500/30">
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </div>
              ) : (
                <Numpad
                  value={manualNumber}
                  onChange={setManualNumber}
                  onCall={() => handleStartCall(manualNumber)}
                  disabled={!isConnected || !isSessionActive || !selectedFromNumber}
                />
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ═══ SCRIPTS ═══ */}
        <TabsContent value="script" className="space-y-5 mt-4">
          {/* AI Script Generator */}
          <Card className="liquid-glass-card overflow-hidden">
            <div className="p-4 border-b border-border/40 bg-gradient-to-r from-violet-500/5 to-cyan-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-600 flex items-center justify-center">
                    <Wand2 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">AI Manuskript</h3>
                    <p className="text-xs text-muted-foreground">Generér et personligt manuskript til det aktive lead</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedScript} onValueChange={setSelectedScript}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intro">Introduktion</SelectItem>
                      <SelectItem value="followup">Opfølgning</SelectItem>
                      <SelectItem value="meeting">Book møde</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleGenerateAiScript(currentLead, selectedScript)}
                    disabled={!currentLead || aiScriptLoading}
                    className="gap-2 bg-gradient-to-r from-violet-500 to-cyan-600 hover:from-violet-600 hover:to-cyan-700"
                  >
                    {aiScriptLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Generér
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-5">
              {!currentLead ? (
                <div className="text-center py-8 space-y-2">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Vælg et lead fra Power Dialer for at generere et manuskript</p>
                </div>
              ) : aiScriptLoading ? (
                <div className="text-center py-8 space-y-3">
                  <Loader2 className="h-8 w-8 mx-auto text-violet-400 animate-spin" />
                  <p className="text-sm text-muted-foreground">Genererer manuskript til <span className="font-medium text-foreground">{currentLead.name}</span>...</p>
                </div>
              ) : aiScript ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] gap-1 bg-violet-500/10 text-violet-400 border-violet-500/30">
                      <Sparkles className="h-2.5 w-2.5" /> AI-genereret til {currentLead?.name}
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => { navigator.clipboard.writeText(aiScript); toast({ title: "Kopieret!" }); }}>
                      Kopiér
                    </Button>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed p-4 rounded-xl bg-muted/30 border border-border/30">
                    {aiScript}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-2">
                  <Wand2 className="h-8 w-8 mx-auto text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Klik "Generér" for at få et AI-manuskript tilpasset <span className="font-medium text-foreground">{currentLead.name}</span></p>
                </div>
              )}
            </div>
          </Card>

          {/* Static templates */}
          <div className="grid md:grid-cols-[200px_1fr] gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard skabeloner</p>
              {CALL_SCRIPTS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScript(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedScript === s.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Card className="liquid-glass-card p-5">
              <h3 className="font-semibold mb-3">{CALL_SCRIPTS.find(s => s.id === selectedScript)?.label}</h3>
              <div className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                {CALL_SCRIPTS.find(s => s.id === selectedScript)?.content}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ USAGE ═══ */}
        <TabsContent value="usage" className="space-y-5 mt-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Totale opkald", value: totalCalls, gradient: "from-cyan-400 to-blue-400" },
              { label: "Minutter brugt", value: totalMinutes, gradient: "from-emerald-400 to-teal-400" },
              { label: "Sessioner", value: totalSessions, gradient: "from-violet-400 to-purple-400" },
            ].map((s, i) => (
              <Card key={i} className="liquid-glass-card p-5 text-center">
                <p className={cn("text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent", s.gradient)}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </Card>
            ))}
          </div>

          <Card className="liquid-glass-card overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h3 className="font-semibold flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Sessionshistorik</h3>
            </div>
            <div className="divide-y divide-border/20 max-h-[400px] overflow-y-auto">
              {!usageHistory?.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Ingen sessioner endnu.</p>
              ) : usageHistory.map((u) => (
                <div key={u.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{new Date(u.session_started_at || u.used_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-xs text-muted-foreground">{u.calls_made || 0} opkald · {Math.round((u.duration_seconds || 0) / 60)} min</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", u.session_ended_at ? "text-muted-foreground" : "text-emerald-400 border-emerald-500/30")}>
                    {u.session_ended_at ? "Afsluttet" : "Aktiv"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ═══ ACCOUNT ═══ */}
        <TabsContent value="account" className="space-y-5 mt-4">
          {isConnected && twilioInfo?.balance !== undefined && twilioInfo.balance < 5 && (
            <Card className="border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-300">{twilioInfo.balance <= 0 ? "Saldo er tom" : "Lav saldo"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Saldo: {twilioInfo.balance_currency} {Number(twilioInfo.balance).toFixed(2)}.{" "}
                    <a href="https://console.twilio.com/us1/billing/manage-billing/billing" target="_blank" rel="noopener noreferrer" className="text-primary underline">Tilføj kredit →</a>
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card className="liquid-glass-card p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" /> Twilio-konto</h3>

            {isConnected ? (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo</p>
                      <p className="text-2xl font-bold mt-1">{twilioInfo.balance_currency} {Number(twilioInfo.balance ?? 0).toFixed(2)}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-xs",
                      twilioInfo.balance > 5 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                      twilioInfo.balance > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                      "bg-red-500/10 text-red-400 border-red-500/30"
                    )}>{twilioInfo.balance > 5 ? "OK" : twilioInfo.balance > 0 ? "Lav" : "Tom"}</Badge>
                  </div>
                  <a href="https://console.twilio.com/us1/billing/manage-billing/billing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">Tilføj kredit →</a>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Kontonavn</p><p className="font-medium">{twilioInfo.account.friendly_name}</p></div>
                  <div><p className="text-muted-foreground text-xs">Status</p><Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 mt-1">{twilioInfo.account.status}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Type</p><p className="font-medium capitalize">{twilioInfo.account.type}</p></div>
                  <div><p className="text-muted-foreground text-xs">SID</p><p className="font-mono text-xs">{twilioInfo.account.sid}</p></div>
                </div>

                {phoneNumbers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Numre ({phoneNumbers.length})</p>
                    {phoneNumbers.map((n: TwilioPhoneNumber) => (
                      <div key={n.sid} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <div className="flex items-center gap-2">
                          <PhoneForwarded className="h-4 w-4 text-emerald-400" />
                          <span className="font-mono text-sm">{n.phone_number}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {n.capabilities?.voice && <Badge variant="outline" className="text-[9px]">Voice</Badge>}
                          {n.capabilities?.sms && <Badge variant="outline" className="text-[9px]">SMS</Badge>}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            disabled={releaseNumber.isPending}
                            onClick={async () => {
                              if (!confirm(`Frigiv ${n.phone_number}? Nummeret slettes permanent.`)) return;
                              try {
                                await releaseNumber.mutateAsync({ numberSid: n.sid });
                                toast({ title: "Nummer frigivet", description: n.phone_number });
                              } catch (e) { toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
                            }}
                          >
                            <PhoneOff className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Phone Number Provisioning */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      {phoneNumbers.length === 0 ? "Køb dit første nummer" : "Køb flere numre"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => setShowNumberSearch(!showNumberSearch)}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {showNumberSearch ? "Luk" : "Søg numre"}
                    </Button>
                  </div>

                  {phoneNumbers.length === 0 && !showNumberSearch && (
                    <Card className="border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-300">Intet telefonnummer</p>
                          <p className="text-sm text-muted-foreground mt-1">Køb et nummer direkte herfra for at komme i gang.</p>
                          <Button
                            size="sm"
                            className="mt-2 gap-2 bg-gradient-to-r from-emerald-500 to-cyan-600"
                            onClick={() => setShowNumberSearch(true)}
                          >
                            <Phone className="h-3.5 w-3.5" /> Søg ledige numre
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}

                  {showNumberSearch && (
                    <Card className="p-4 space-y-4 border-emerald-500/20 bg-emerald-500/5">
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block text-muted-foreground">Land</label>
                          <Select value={numberSearchCountry} onValueChange={setNumberSearchCountry}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DK">🇩🇰 Danmark</SelectItem>
                              <SelectItem value="US">🇺🇸 USA</SelectItem>
                              <SelectItem value="GB">🇬🇧 UK</SelectItem>
                              <SelectItem value="DE">🇩🇪 Tyskland</SelectItem>
                              <SelectItem value="SE">🇸🇪 Sverige</SelectItem>
                              <SelectItem value="NO">🇳🇴 Norge</SelectItem>
                              <SelectItem value="NL">🇳🇱 Holland</SelectItem>
                              <SelectItem value="FR">🇫🇷 Frankrig</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block text-muted-foreground">Type</label>
                          <Select value={numberSearchType} onValueChange={setNumberSearchType}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="local">Lokalt</SelectItem>
                              <SelectItem value="mobile">Mobil</SelectItem>
                              <SelectItem value="toll-free">Gratisnummer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block text-muted-foreground">Områdekode (valgfrit)</label>
                          <Input placeholder="fx 45" value={numberSearchArea} onChange={e => setNumberSearchArea(e.target.value)} className="h-9" />
                        </div>
                      </div>
                      <Button
                        className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-500 to-cyan-600"
                        disabled={searchNumbers.isPending}
                        onClick={async () => {
                          try {
                            const res = await searchNumbers.mutateAsync({
                              country: numberSearchCountry,
                              areaCode: numberSearchArea || undefined,
                              numberType: numberSearchType,
                            });
                            setSearchResults(res.numbers || []);
                            if (res.usedType && res.usedType.toLowerCase() !== numberSearchType.replace('-', '')) {
                              toast({ title: "Alternativ type brugt", description: `Twilio havde ikke ${numberSearchType} i ${numberSearchCountry}, så der blev søgt i ${res.usedType}.` });
                            }
                            if (!res.numbers?.length) {
                              toast({ title: "Ingen numre fundet", description: res.warning || "Prøv et andet land eller type." });
                            }
                          } catch (e) { toast({ title: "Søgefejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
                        }}
                      >
                        {searchNumbers.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                        Søg ledige numre
                      </Button>

                      {searchResults.length > 0 && (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          <p className="text-xs text-muted-foreground">{searchResults.length} numre fundet</p>
                          {searchResults.map((n: NumberSearchResult, i: number) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                              <div>
                                <p className="font-mono text-sm font-medium">{n.phone_number}</p>
                                <p className="text-xs text-muted-foreground">{[n.locality, n.region, n.iso_country].filter(Boolean).join(", ")}</p>
                              </div>
                              <Button
                                size="sm"
                                className="gap-2 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700"
                                disabled={buyNumber.isPending && buyingNumber === n.phone_number}
                                onClick={async () => {
                                  setBuyingNumber(n.phone_number);
                                  try {
                                    await buyNumber.mutateAsync({ phoneNumber: n.phone_number, country: numberSearchCountry });
                                    setSearchResults(prev => prev.filter(x => x.phone_number !== n.phone_number));
                                    toast({ title: "Nummer købt! 🎉", description: `${n.phone_number} er nu klar til brug.` });
                                  } catch (e) { toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
                                  setBuyingNumber(null);
                                }}
                              >
                                {buyNumber.isPending && buyingNumber === n.phone_number ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Import className="h-3.5 w-3.5" />}
                                Køb
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40">
                  <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => setShowDisconnectConfirm(true)}>
                    Afbryd Twilio-konto
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-center py-2 space-y-2">
                  <div className="relative mx-auto w-fit">
                    <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-full blur-lg animate-pulse" />
                    <div className="relative h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-xl">
                      <Phone className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg">Forbind din Twilio-konto</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">Du skal bruge en Twilio-konto for at ringe. Det tager under 3 minutter.</p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                      <Sparkles className="h-3.5 w-3.5" /> Opret gratis Twilio-konto
                    </Button>
                  </a>
                  <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-2">
                      <ArrowRight className="h-3.5 w-3.5" /> Åbn Twilio Console
                    </Button>
                  </a>
                </div>

                <div className="space-y-3 max-w-md mx-auto">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    disabled={connectDefaultTwilio.isPending || saveCredentials.isPending}
                    onClick={async () => {
                      try {
                        await connectDefaultTwilio.mutateAsync();
                        toast({ title: "Twilio forbundet!", description: "Standardforbindelsen er nu aktiv for din virksomhed." });
                      } catch (e) {
                        toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
                      }
                    }}
                  >
                    {connectDefaultTwilio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    Brug eksisterende Twilio-forbindelse
                  </Button>

                  <div className="relative text-center text-xs text-muted-foreground">
                    <span className="bg-background px-2 relative z-10">eller forbind manuelt</span>
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-border/40" />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Account SID</label>
                    <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={setupSid} onChange={e => setSetupSid(e.target.value)} className="font-mono text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Auth Token</label>
                    <Input type="password" placeholder="Dit Auth Token" value={setupToken} onChange={e => setSetupToken(e.target.value)} className="font-mono text-sm" />
                  </div>
                  <Button
                    className="w-full bg-gradient-to-r from-emerald-500 to-cyan-600 gap-2"
                    disabled={!setupSid.startsWith("AC") || setupToken.length < 10 || saveCredentials.isPending}
                    onClick={async () => {
                      try {
                        await saveCredentials.mutateAsync({ accountSid: setupSid, authToken: setupToken });
                        setSetupSid(""); setSetupToken("");
                        toast({ title: "Twilio forbundet!", description: "Din konto er nu aktiv." });
                      } catch (e) { toast({ title: "Fejl", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
                    }}
                  >
                    {saveCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Forbind konto
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Afbryd Twilio?</DialogTitle>
                <DialogDescription>Din forbindelse fjernes. Du kan altid forbinde igen.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDisconnectConfirm(false)}>Annullér</Button>
                <Button variant="destructive" disabled={disconnectTwilio.isPending} onClick={async () => {
                  await disconnectTwilio.mutateAsync();
                  setShowDisconnectConfirm(false);
                  toast({ title: "Twilio afbrudt" });
                }}>
                  {disconnectTwilio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Afbryd"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
    </div>
  );
}
