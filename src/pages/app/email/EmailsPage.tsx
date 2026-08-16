import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, Star, AlertTriangle, CalendarDays, FileText, Clock, CheckCircle2, Send, LogOut, Loader2, X, Plus, ArrowRight, Reply, Archive, Eye, EyeOff, Info, Search as SearchIcon, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useGmailAccount, useConnectGmail, useDisconnectGmail, useSyncEmails, useEmails, useSendEmail, useUpdateEmail } from '@/hooks/api/useEmail';
import { useI18n } from '@/lib/i18n';
import type { Tables } from '@/integrations/supabase/types';

type Email = Tables<'emails'>;

const PAGE_SIZE = 50;

export default function EmailsPage() {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipients, setComposeRecipients] = useState<string[]>(['']);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [page, setPage] = useState(0);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [todoDialogOpen, setTodoDialogOpen] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [priorityInfoOpen, setPriorityInfoOpen] = useState(false);
  const [todoInfoOpen, setTodoInfoOpen] = useState(false);

  // Advanced search
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [searchSender, setSearchSender] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

  const priorityConfig = useMemo(() => ({
    meeting: { icon: CalendarDays, label: t('pages.email.meeting'), color: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20' },
    deadline: { icon: Clock, label: t('pages.email.deadline'), color: 'text-orange-600 bg-orange-500/10 border-orange-500/20' },
    invoice: { icon: FileText, label: t('pages.email.invoice'), color: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20' },
    contract: { icon: AlertTriangle, label: t('pages.email.contract'), color: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20' },
  }), [t]);

  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  const gmailAccount = useGmailAccount();
  const connectGmail = useConnectGmail();
  const disconnectGmail = useDisconnectGmail();
  const syncEmails = useSyncEmails();
  const sendEmail = useSendEmail();
  const updateEmail = useUpdateEmail();

  const isConnected = !!gmailAccount.data;
  const lastSynced = gmailAccount.data?.last_synced_at;

  const emailFilter = useMemo(() => {
    if (activeTab === 'unread') return { unread: true };
    if (activeTab === 'priority') return { priority: true };
    if (activeTab === 'starred') return { starred: true };
    return undefined;
  }, [activeTab]);

  const { data: emails = [], isLoading: emailsLoading } = useEmails(emailFilter);

  useEffect(() => {
    if (searchParams.get('gmail_connected') === 'true') {
      toast.success(t('pages.email.gmailConnected'));
      gmailAccount.refetch().then(() => syncEmails.mutate(500));
    }
    if (searchParams.get('gmail_error')) {
      toast.error(`${t('pages.email.gmailError')}: ${searchParams.get('gmail_error')}`);
    }
  }, []);

  useEffect(() => {
    if (isConnected && !emailsLoading && emails.length === 0 && !syncEmails.isPending) {
      toast.info(t('pages.email.syncing'));
      syncEmails.mutate(500);
    }
  }, [isConnected, emailsLoading, emails.length]);

  useEffect(() => { setPage(0); }, [activeTab, search]);

  const filteredEmails = useMemo(() => {
    let result = emails;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        (e.subject || '').toLowerCase().includes(q) ||
        (e.from_name || '').toLowerCase().includes(q) ||
        (e.snippet || '').toLowerCase().includes(q)
      );
    }
    if (searchSender) {
      const s = searchSender.toLowerCase();
      result = result.filter((e) =>
        (e.from_name || '').toLowerCase().includes(s) ||
        (e.from_address || '').toLowerCase().includes(s)
      );
    }
    if (searchDateFrom) {
      const from = new Date(searchDateFrom);
      result = result.filter((e) => new Date(e.received_at) >= from);
    }
    if (searchDateTo) {
      const to = new Date(searchDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((e) => new Date(e.received_at) <= to);
    }
    return result;
  }, [emails, search, searchSender, searchDateFrom, searchDateTo]);

  const totalPages = Math.ceil(filteredEmails.length / PAGE_SIZE);
  const pagedEmails = useMemo(() =>
    filteredEmails.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredEmails, page]
  );

  const unreadCount = useMemo(() => emails.filter((e) => !e.is_read).length, [emails]);
  const priorityEmails = useMemo(() => emails.filter((e) => e.ai_priority && !e.is_read), [emails]);
  const priorityCount = useMemo(() => emails.filter((e) => e.ai_priority).length, [emails]);
  const todoCount = useMemo(() => emails.filter((e) => e.ai_suggested_todo).length, [emails]);
  const todoEmails = useMemo(() => emails.filter((e) => e.ai_suggested_todo), [emails]);
  const allPriorityEmails = useMemo(() => emails.filter((e) => e.ai_priority), [emails]);
  const starredCount = useMemo(() => emails.filter((e) => e.is_starred).length, [emails]);

  const handleConnect = useCallback(async () => {
    try {
      const result = await connectGmail.mutateAsync();
      if (result.auth_url) window.location.href = result.auth_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pages.email.gmailConnectError'));
    }
  }, [connectGmail, t]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectGmail.mutateAsync();
      toast.success(t('pages.email.gmailDisconnected'));
      setDisconnectConfirmOpen(false);
    } catch {
      toast.error(t('pages.email.gmailDisconnectError'));
    }
  }, [disconnectGmail, t]);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncEmails.mutateAsync(30);
      toast.success(t('pages.email.emailsSynced').replace('{count}', String(result.synced)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pages.email.syncError'));
    }
  }, [syncEmails, t]);

  const handleSend = useCallback(async () => {
    const validRecipients = composeRecipients.filter(r => r.trim() && r.includes('@'));
    if (!validRecipients.length || !composeSubject || !composeBody) {
      toast.error(t('pages.email.fillAllFields'));
      return;
    }
    if (validRecipients.length > 10) {
      toast.error(t('pages.email.maxRecipients'));
      return;
    }
    setSendingEmails(true);
    let sent = 0;
    let errors = 0;
    for (const to of validRecipients) {
      try {
        await sendEmail.mutateAsync({ to: to.trim(), subject: composeSubject, message: composeBody });
        sent++;
      } catch {
        errors++;
      }
    }
    setSendingEmails(false);
    if (errors === 0) {
      toast.success(sent === 1 ? t('pages.email.emailSent') : t('pages.email.emailsSent').replace('{count}', String(sent)));
    } else {
      toast.warning(t('pages.email.sentWithErrors').replace('{sent}', String(sent)).replace('{errors}', String(errors)));
    }
    setComposeOpen(false);
    setComposeRecipients(['']);
    setComposeSubject('');
    setComposeBody('');
  }, [composeRecipients, composeSubject, composeBody, sendEmail, t]);

  const addRecipient = useCallback(() => {
    if (composeRecipients.length < 10) {
      setComposeRecipients(prev => [...prev, '']);
    }
  }, [composeRecipients.length]);

  const updateRecipient = useCallback((idx: number, val: string) => {
    setComposeRecipients(prev => prev.map((r, i) => i === idx ? val : r));
  }, []);

  const removeRecipient = useCallback((idx: number) => {
    if (composeRecipients.length > 1) {
      setComposeRecipients(prev => prev.filter((_, i) => i !== idx));
    }
  }, [composeRecipients.length]);

  const toggleStar = useCallback((email: Email, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateEmail.mutate({ id: email.id, updates: { is_starred: !email.is_starred } });
  }, [updateEmail]);

  const toggleRead = useCallback((email) => {
    updateEmail.mutate({ id: email.id, updates: { is_read: !email.is_read } });
  }, [updateEmail]);

  // Bulk actions
  const handleMarkAllRead = useCallback(() => {
    const unread = filteredEmails.filter((e) => !e.is_read);
    if (unread.length === 0) { toast.info(t('pages.email.allAlreadyRead')); return; }
    unread.forEach((email) => updateEmail.mutate({ id: email.id, updates: { is_read: true } }));
    toast.success(t('pages.email.markedAllRead').replace('{count}', String(unread.length)));
  }, [filteredEmails, updateEmail, t]);

  // Not connected
  if (!isConnected && !gmailAccount.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.email.smartInbox')}</h1>
          <p className="text-muted-foreground">{t('pages.email.connectSyncDesc')}</p>
        </div>
        <Card className="max-w-lg mx-auto mt-12">
          <CardHeader className="text-center">
            <Mail className="h-16 w-16 mx-auto text-primary mb-4" />
            <CardTitle>{t('pages.email.connectGmail')}</CardTitle>
            <CardDescription>{t('pages.email.connectGmailDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={handleConnect} disabled={connectGmail.isPending} size="lg">
              {connectGmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {t('pages.email.connectGmail')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.email.smartInbox')}</h1>
          {gmailAccount.data?.email_address && (
            <p className="text-sm text-muted-foreground">
              {t('pages.email.connected')}: {gmailAccount.data.email_address}
              {lastSynced && (
                <span className="ml-2 text-xs">
                  · {t('pages.email.lastSynced')}: {new Date(lastSynced).toLocaleString(dateLocale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setDisconnectConfirmOpen(true)} disabled={disconnectGmail.isPending}>
            <LogOut className="h-4 w-4 mr-1" />{t('pages.email.disconnect')}
          </Button>
          <Button variant="outline" onClick={() => { setComposeRecipients(['']); setComposeOpen(true); }}>
            <Send className="h-4 w-4 mr-2" />{t('pages.email.compose')}
          </Button>
          <Button onClick={handleSync} disabled={syncEmails.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncEmails.isPending ? 'animate-spin' : ''}`} />
            {t('pages.email.sync')}
          </Button>
        </div>
      </div>

      {/* Priority emails */}
      {priorityEmails.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />{t('pages.email.todayPriorities')}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setPriorityInfoOpen(true)} className="ml-1">
                      <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p className="max-w-xs text-xs">{t('pages.email.priorityExplanation')}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge variant="secondary" className="ml-auto">{priorityEmails.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priorityEmails.slice(0, 3).map((email) => {
                const cfg = email.ai_priority ? priorityConfig[email.ai_priority as keyof typeof priorityConfig] : null;
                const Icon = cfg?.icon || Mail;
                return (
                  <div key={email.id} onClick={() => setSelectedEmail(email)} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${cfg?.color || 'border-border'}`}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">{email.from_name || email.from_address}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Mail className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">{t('pages.email.total')}</p><p className="text-2xl font-bold">{emails.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Badge className="bg-primary/10 text-primary px-2 py-1">{unreadCount}</Badge><div><p className="text-sm text-muted-foreground">{t('pages.email.unread')}</p></div></div></CardContent></Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setPriorityDialogOpen(true)}>
          <CardContent className="pt-6"><div className="flex items-center gap-3"><Star className="h-5 w-5 text-yellow-500" /><div><p className="text-sm text-muted-foreground">{t('pages.email.prioritized')}</p><p className="text-2xl font-bold">{priorityCount}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" /></div></CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setTodoDialogOpen(true)}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  {t('pages.email.todoSuggestions')}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-xs text-xs">{t('pages.email.todoExplanation')}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <p className="text-2xl font-bold">{todoCount}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search, tabs and bulk actions */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t('pages.email.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setAdvancedSearchOpen(!advancedSearchOpen)}>
            <Filter className="h-4 w-4 mr-1" />{t('pages.email.advancedSearch')}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <Eye className="h-4 w-4 mr-1" />{t('pages.email.markAllRead')}
            </Button>
          </div>
        </div>

        {advancedSearchOpen && (
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('pages.email.filterSender')}</label>
                <Input value={searchSender} onChange={e => setSearchSender(e.target.value)} placeholder={t('pages.email.senderPlaceholder')} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('pages.email.filterDateFrom')}</label>
                <Input type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('pages.email.filterDateTo')}</label>
                <Input type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} className="mt-1" />
              </div>
            </div>
            {(searchSender || searchDateFrom || searchDateTo) && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearchSender(''); setSearchDateFrom(''); setSearchDateTo(''); }}>
                <X className="h-3 w-3 mr-1" />{t('pages.email.clearFilters')}
              </Button>
            )}
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">{t('pages.email.all')}</TabsTrigger>
            <TabsTrigger value="unread">{t('pages.email.unread')} ({unreadCount})</TabsTrigger>
            <TabsTrigger value="priority">{t('pages.email.prioritized')}</TabsTrigger>
            <TabsTrigger value="starred">{t('pages.email.starred')} {starredCount > 0 ? `(${starredCount})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Email list */}
      <Card>
        <CardContent className="p-0">
          {emailsLoading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
              <p className="text-muted-foreground">{t('pages.email.fetchingEmails')}</p>
            </div>
          ) : pagedEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>{emails.length === 0 ? t('pages.email.noEmailsSynced') : t('pages.email.noEmailsMatch')}</p>
              {activeTab === 'starred' && starredCount === 0 && (
                <p className="text-xs mt-2">{t('pages.email.starredHint')}</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pagedEmails.map((email) => {
                const cfg = email.ai_priority ? priorityConfig[email.ai_priority as keyof typeof priorityConfig] : null;
                return (
                  <div
                    key={email.id}
                    onClick={() => { setSelectedEmail(email); if (!email.is_read) toggleRead(email); }}
                    className={`flex items-start gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${!email.is_read ? 'bg-primary/5' : ''} ${email.ai_priority && !email.is_read ? 'border-l-4 border-l-yellow-500' : ''}`}
                  >
                    <button onClick={e => toggleStar(email, e)} className="mt-1 shrink-0" aria-label={t('pages.email.starred')}>
                      <Star className={`h-4 w-4 ${email.is_starred ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30 hover:text-yellow-500'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${!email.is_read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                          {email.from_name || email.from_address}
                        </span>
                        {cfg && <Badge variant="outline" className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</Badge>}
                        {!email.is_read && <Badge className="bg-primary text-primary-foreground text-xs shrink-0">{t('pages.email.new')}</Badge>}
                      </div>
                      <p className={`text-sm truncate ${!email.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{email.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{email.snippet}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(email.received_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredEmails.length)} {t('pages.email.of')} {filteredEmails.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('pages.email.prev')}</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>{t('pages.email.next')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email detail dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => { setSelectedEmail(null); setReplyOpen(false); setReplyBody(''); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedEmail && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selectedEmail.subject}</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedEmail.from_name || selectedEmail.from_address}</span>
                  <span>&lt;{selectedEmail.from_address}&gt;</span>
                  <span className="ml-auto">{new Date(selectedEmail.received_at).toLocaleString(dateLocale)}</span>
                </div>
                {selectedEmail.ai_suggested_todo && (
                  <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
                    <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                    <p className="text-xs font-medium text-accent">{t('pages.email.suggestedTodo')}: {selectedEmail.ai_suggested_todo}</p>
                  </div>
                )}
              </DialogHeader>
              <div className="mt-4 prose prose-sm max-w-none dark:prose-invert">
                {selectedEmail.body_html ? (
                  <div
                    className="[&_*]:!max-width-full [&_img]:max-w-full [&_a]:text-primary [&_a]:underline"
                    style={{ colorScheme: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{selectedEmail.body_text || selectedEmail.snippet}</pre>
                )}
              </div>

              {replyOpen ? (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">{t('pages.email.replyTo')}: <span className="font-medium text-foreground">{selectedEmail.from_address}</span></p>
                  <Textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder={t('pages.email.writeReply')} rows={6} autoFocus />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setReplyOpen(false); setReplyBody(''); }}>{t('pages.email.cancel')}</Button>
                    <Button size="sm" disabled={sendingReply || !replyBody.trim()} onClick={async () => {
                      setSendingReply(true);
                      try {
                        await sendEmail.mutateAsync({
                          to: selectedEmail.from_address,
                          subject: selectedEmail.subject?.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
                          message: replyBody,
                          reply_to_message_id: selectedEmail.thread_id || selectedEmail.gmail_id,
                        });
                        toast.success(t('pages.email.replySent'));
                        setReplyOpen(false);
                        setReplyBody('');
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : t('pages.email.replyError'));
                      } finally {
                        setSendingReply(false);
                      }
                    }}>
                      {sendingReply ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      {t('pages.email.sendReply')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-2 justify-end border-t border-border pt-4">
                  <Button variant="outline" size="sm" onClick={() => toggleRead(selectedEmail)}>
                    {selectedEmail.is_read ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                    {selectedEmail.is_read ? t('pages.email.markUnread') : t('pages.email.markRead')}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedEmail(null)}>{t('pages.email.close')}</Button>
                  <Button onClick={() => setReplyOpen(true)}>
                    <Reply className="h-4 w-4 mr-2" />{t('pages.email.reply')}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('pages.email.composeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('pages.email.toLabel')}</label>
              {composeRecipients.map((r, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input value={r} onChange={e => updateRecipient(idx, e.target.value)} placeholder={t('pages.email.recipientPlaceholder')} type="email" />
                  {composeRecipients.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRecipient(idx)} className="shrink-0" aria-label="Remove recipient">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {composeRecipients.length < 10 && (
                <Button variant="outline" size="sm" onClick={addRecipient}>
                  <Plus className="h-4 w-4 mr-1" />{t('pages.email.addRecipient')}
                </Button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{t('pages.email.subject')}</label>
              <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder={t('pages.email.subject')} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('pages.email.message')}</label>
              <Textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder={t('pages.email.writeMessage')} rows={8} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>{t('pages.email.cancel')}</Button>
            <Button onClick={handleSend} disabled={sendingEmails}>
              {sendingEmails ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {composeRecipients.filter(r => r.includes('@')).length > 1
                ? t('pages.email.sendToMultiple').replace('{count}', String(composeRecipients.filter(r => r.includes('@')).length))
                : t('pages.email.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirmation */}
      <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pages.email.disconnectConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('pages.email.disconnectConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectConfirmOpen(false)}>{t('pages.email.cancel')}</Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnectGmail.isPending}>
              {disconnectGmail.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              {t('pages.email.disconnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* To-do suggestions dialog */}
      <Dialog open={todoDialogOpen} onOpenChange={setTodoDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              {t('pages.email.todoSuggestions')} ({todoCount})
            </DialogTitle>
            <DialogDescription>{t('pages.email.todoExplanation')}</DialogDescription>
          </DialogHeader>
          {todoEmails.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('pages.email.noTodoSuggestions')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todoEmails.map((email) => (
                <div
                  key={email.id}
                  className="p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => { setTodoDialogOpen(false); setSelectedEmail(email); }}
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-accent">{email.ai_suggested_todo}</p>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{email.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {email.from_name || email.from_address} · {new Date(email.received_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); setTodoDialogOpen(false); setSelectedEmail(email); }}>
                      <Reply className="h-3 w-3 mr-1" />{t('pages.email.open')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Priority emails dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              {t('pages.email.prioritizedEmails')} ({priorityCount})
            </DialogTitle>
            <DialogDescription>{t('pages.email.priorityExplanation')}</DialogDescription>
          </DialogHeader>
          {allPriorityEmails.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('pages.email.noPriorityEmails')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allPriorityEmails.map((email) => {
                const cfg = email.ai_priority ? priorityConfig[email.ai_priority as keyof typeof priorityConfig] : null;
                const Icon = cfg?.icon || Mail;
                return (
                  <div
                    key={email.id}
                    className="p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => { setPriorityDialogOpen(false); setSelectedEmail(email); }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${cfg?.color || 'bg-muted'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${cfg?.color || ''}`}>{cfg?.label || t('pages.email.priority')}</Badge>
                          {!email.is_read && <Badge className="bg-primary text-primary-foreground text-xs">{t('pages.email.new')}</Badge>}
                        </div>
                        <p className="text-sm font-medium text-foreground mt-1 truncate">{email.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {email.from_name || email.from_address} · {new Date(email.received_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); setPriorityDialogOpen(false); setSelectedEmail(email); }}>
                        <Reply className="h-3 w-3 mr-1" />{t('pages.email.open')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
