import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, Star, AlertTriangle, CalendarDays, FileText, Clock, CheckCircle2, LogOut, Loader2, Info, ArrowRight, Reply } from 'lucide-react';
import { openAmbientAI } from '@/components/workspace/AmbientAIBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useGmailAccount, useConnectGmail, useDisconnectGmail, useSyncEmails, useEmails, useSendEmail, useUpdateEmail } from '@/hooks/api/useEmail';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';
import { useCompactLayout } from '@/hooks/useCompactLayout';
import { useEmailFolders, matchesFolderKeyword } from '@/hooks/useEmailFolders';
import { extractEmailAddress, buildReplyAllCc } from '@/lib/emailAddress';
import { MailSidebar, type FolderId } from '@/components/email/MailSidebar';
import { EmailListPane, type Email, type ReadFilter } from '@/components/email/EmailListPane';
import { EmailReaderPane } from '@/components/email/EmailReaderPane';
import { ComposeDialog, type ComposeMode, type ComposePayload, parseRecipients } from '@/components/email/ComposeDialog';
import { WorkspaceFrame } from '@/components/workspace/WorkspacePanel';

export default function EmailsPage() {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const isMobile = useCompactLayout();

  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox');
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'reader'>('list');
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('new');
  const [composeInitial, setComposeInitial] = useState<ComposePayload>({ to: '', cc: '', subject: '', body: '' });
  const [composeKey, setComposeKey] = useState(0);
  const [sendingCompose, setSendingCompose] = useState(false);

  const [todoDialogOpen, setTodoDialogOpen] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  const priorityConfig = useMemo(() => ({
    meeting: { icon: CalendarDays, label: t('pages.email.meeting'), color: 'text-warning bg-warning/10 border-warning/20' },
    deadline: { icon: Clock, label: t('pages.email.deadline'), color: 'text-destructive bg-destructive/10 border-destructive/20' },
    invoice: { icon: FileText, label: t('pages.email.invoice'), color: 'text-warning bg-warning/10 border-warning/20' },
    contract: { icon: AlertTriangle, label: t('pages.email.contract'), color: 'text-destructive bg-destructive/10 border-destructive/20' },
  }), [t]);

  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  const gmailAccount = useGmailAccount();
  const connectGmail = useConnectGmail();
  const disconnectGmail = useDisconnectGmail();
  const syncEmails = useSyncEmails();
  const sendEmail = useSendEmail();
  const updateEmail = useUpdateEmail();
  const { folders: customFolders, addFolder, removeFolder } = useEmailFolders();

  const isConnected = !!gmailAccount.data;
  const lastSynced = gmailAccount.data?.last_synced_at;
  const ownAddress = gmailAccount.data?.email_address;

  const { data: emails = [], isLoading: emailsLoading } = useEmails();

  useEffect(() => {
    if (searchParams.get('gmail_connected') === 'true') {
      toast.success(t('pages.email.gmailConnected'));
      gmailAccount.refetch().then(() => syncEmails.mutate(500));
    }
    if (searchParams.get('gmail_error')) {
      toast.error(`${t('pages.email.gmailError')}: ${searchParams.get('gmail_error')}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isConnected && !emailsLoading && emails.length === 0 && !syncEmails.isPending) {
      toast.info(t('pages.email.syncing'));
      syncEmails.mutate(500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, emailsLoading, emails.length]);

  const inboxEmails = useMemo(() => emails.filter((e) => e.direction !== 'outbound'), [emails]);
  const priorityEmails = useMemo(() => inboxEmails.filter((e) => e.ai_priority && !e.is_read), [inboxEmails]);
  const allPriorityEmails = useMemo(() => inboxEmails.filter((e) => e.ai_priority), [inboxEmails]);
  const todoEmails = useMemo(() => inboxEmails.filter((e) => e.ai_suggested_todo), [inboxEmails]);
  const priorityCount = allPriorityEmails.length;
  const todoCount = todoEmails.length;

  const counts = useMemo(() => ({
    inbox: inboxEmails.length,
    unreadInbox: inboxEmails.filter((e) => !e.is_read).length,
    important: inboxEmails.filter((e) => e.is_important).length,
    starred: emails.filter((e) => e.is_starred).length,
    sent: emails.filter((e) => e.direction === 'outbound').length,
  }), [emails, inboxEmails]);

  const folderEmails = useMemo(() => {
    if (activeFolder === 'inbox') return inboxEmails;
    if (activeFolder === 'important') return inboxEmails.filter((e) => e.is_important);
    if (activeFolder === 'starred') return emails.filter((e) => e.is_starred);
    if (activeFolder === 'sent') return emails.filter((e) => e.direction === 'outbound');
    if (activeFolder.startsWith('custom:')) {
      const folder = customFolders.find((f) => f.id === activeFolder.slice(7));
      return folder ? inboxEmails.filter((e) => matchesFolderKeyword(e, folder.keyword)) : [];
    }
    return inboxEmails;
  }, [activeFolder, inboxEmails, emails, customFolders]);

  const visibleEmails = useMemo(() => {
    let result = folderEmails;
    if (readFilter === 'read') result = result.filter((e) => e.is_read);
    if (readFilter === 'unread') result = result.filter((e) => !e.is_read);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        (e.subject || '').toLowerCase().includes(q) ||
        (e.from_name || '').toLowerCase().includes(q) ||
        (e.from_address || '').toLowerCase().includes(q) ||
        (e.snippet || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [folderEmails, readFilter, search]);

  const selectedEmail = useMemo(() => emails.find((e) => e.id === selectedId) || null, [emails, selectedId]);

  const folderTitle = useMemo(() => {
    switch (activeFolder) {
      case 'inbox': return t('pages.email.inbox');
      case 'important': return t('pages.email.important');
      case 'starred': return t('pages.email.starred');
      case 'sent': return t('pages.email.sent');
      default: {
        if (activeFolder.startsWith('custom:')) {
          const folder = customFolders.find((f) => f.id === activeFolder.slice(7));
          return folder?.name || t('pages.email.folders');
        }
        return t('pages.email.inbox');
      }
    }
  }, [activeFolder, customFolders, t]);

  const handleConnect = useCallback(async () => {
    try {
      const result = await connectGmail.mutateAsync();
      if (result.auth_url) window.location.href = result.auth_url;
    } catch (err) {
      toast.error(getErrorMessage(err) || t('pages.email.gmailConnectError'));
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
      toast.error(getErrorMessage(err) || t('pages.email.syncError'));
    }
  }, [syncEmails, t]);

  const handleSelectFolder = useCallback((id: FolderId) => {
    setActiveFolder(id);
    setSelectedId(null);
    setSearch('');
    setReadFilter('all');
    setMobileFoldersOpen(false);
    setMobileView('list');
  }, []);

  const handleSelectEmail = useCallback((email: Email) => {
    setSelectedId(email.id);
    if (!email.is_read) updateEmail.mutate({ id: email.id, updates: { is_read: true } });
    if (isMobile) setMobileView('reader');
  }, [updateEmail, isMobile]);

  const toggleStar = useCallback((email: Email, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateEmail.mutate({ id: email.id, updates: { is_starred: !email.is_starred } });
  }, [updateEmail]);

  const toggleRead = useCallback((email: Email) => {
    updateEmail.mutate({ id: email.id, updates: { is_read: !email.is_read } });
  }, [updateEmail]);

  const toggleImportant = useCallback((email: Email) => {
    updateEmail.mutate({ id: email.id, updates: { is_important: !email.is_important } });
  }, [updateEmail]);

  const handleMarkAllRead = useCallback(() => {
    const unread = visibleEmails.filter((e) => !e.is_read);
    if (unread.length === 0) { toast.info(t('pages.email.allAlreadyRead')); return; }
    unread.forEach((email) => updateEmail.mutate({ id: email.id, updates: { is_read: true } }));
    toast.success(t('pages.email.markedAllRead').replace('{count}', String(unread.length)));
  }, [visibleEmails, updateEmail, t]);

  const openCompose = useCallback(() => {
    setComposeMode('new');
    setComposeInitial({ to: '', cc: '', subject: '', body: '' });
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
  }, []);

  const openReply = useCallback((email: Email) => {
    setComposeMode('reply');
    setComposeInitial({
      to: email.from_address,
      cc: '',
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      body: '',
    });
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
  }, []);

  const openReplyAll = useCallback((email: Email) => {
    const toList = Array.isArray(email.to_addresses) ? (email.to_addresses as string[]) : [];
    const ccList = Array.isArray(email.cc_addresses) ? (email.cc_addresses as string[]) : [];
    setComposeMode('replyAll');
    setComposeInitial({
      to: email.from_address,
      cc: buildReplyAllCc(toList, ccList, email.from_address, ownAddress),
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      body: '',
    });
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
  }, [ownAddress]);

  const openForward = useCallback((email: Email) => {
    const fromLabel = locale === 'da' ? 'Fra' : locale === 'de' ? 'Von' : 'From';
    const quoted = `\n\n---------- ${locale === 'da' ? 'Videresendt besked' : locale === 'de' ? 'Weitergeleitete Nachricht' : 'Forwarded message'} ----------\n` +
      `${fromLabel}: ${email.from_name || email.from_address} <${email.from_address}>\n` +
      `${new Date(email.received_at).toLocaleString(dateLocale)}\n` +
      `${t('pages.email.subject')}: ${email.subject || ''}\n\n` +
      `${email.body_text || email.snippet || ''}`;
    setComposeMode('forward');
    setComposeInitial({
      to: '',
      cc: '',
      subject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
      body: quoted,
    });
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
  }, [dateLocale, locale, t]);

  const handleComposeSend = useCallback(async (payload: ComposePayload) => {
    const recipients = parseRecipients(payload.to);
    if (!recipients.length || !payload.subject.trim() || !payload.body.trim()) {
      toast.error(t('pages.email.fillAllFields'));
      return;
    }
    const replyContext = (composeMode === 'reply' || composeMode === 'replyAll') ? selectedEmail : null;
    setSendingCompose(true);
    let sent = 0;
    let errors = 0;
    for (const to of recipients) {
      try {
        await sendEmail.mutateAsync({
          to,
          subject: payload.subject,
          message: payload.body,
          cc: payload.cc.trim() || undefined,
          reply_to_message_id: replyContext ? (replyContext.thread_id || replyContext.gmail_id) : undefined,
        });
        sent++;
      } catch {
        errors++;
      }
    }
    setSendingCompose(false);
    if (errors === 0) {
      toast.success(
        composeMode === 'new'
          ? (sent === 1 ? t('pages.email.emailSent') : t('pages.email.emailsSent').replace('{count}', String(sent)))
          : t('pages.email.replySent')
      );
    } else {
      toast.warning(t('pages.email.sentWithErrors').replace('{sent}', String(sent)).replace('{errors}', String(errors)));
    }
    setComposeOpen(false);
  }, [composeMode, selectedEmail, sendEmail, t]);

  // Still checking whether Gmail is connected — avoid flashing the full
  // inbox UI before we actually know the connection state.
  if (gmailAccount.isLoading) {
    return (
      <div className="workspace-theme space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.email.smartInbox')}</h1>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>{t('pages.email.checkingConnection')}</p>
        </div>
      </div>
    );
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="workspace-theme space-y-6">
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

  const sidebar = (
    <MailSidebar
      activeFolder={activeFolder}
      onSelectFolder={handleSelectFolder}
      counts={counts}
      customFolders={customFolders}
      onAddFolder={addFolder}
      onRemoveFolder={removeFolder}
    />
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap gap-2">
          {priorityCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPriorityDialogOpen(true)}>
              <Star className="h-4 w-4 mr-1.5 text-warning" />{t('pages.email.prioritized')}
              <Badge variant="secondary" className="ml-1.5">{priorityCount}</Badge>
            </Button>
          )}
          {todoCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setTodoDialogOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5 text-stamp" />{t('pages.email.todoSuggestions')}
              <Badge variant="secondary" className="ml-1.5">{todoCount}</Badge>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDisconnectConfirmOpen(true)} disabled={disconnectGmail.isPending}>
            <LogOut className="h-4 w-4 mr-1" />{t('pages.email.disconnect')}
          </Button>
          <Button onClick={handleSync} disabled={syncEmails.isPending} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncEmails.isPending ? 'animate-spin' : ''}`} />
            {t('pages.email.sync')}
          </Button>
        </div>
      </div>

      {/* Three-pane inbox */}
      <WorkspaceFrame className="flex-1 overflow-hidden">
        <div className="flex h-[calc(100vh-14rem)] min-h-[560px] w-full gap-[10px]">
          {!isMobile && (
            <div className="w-60 shrink-0 overflow-hidden rounded-[22px]">
              {sidebar}
            </div>
          )}

          {(!isMobile || mobileView === 'list') && (
            <div className={`overflow-hidden rounded-[22px] bg-background ${isMobile ? 'w-full' : 'w-[360px] shrink-0'}`}>
              <EmailListPane
                title={folderTitle}
                emails={visibleEmails}
                loading={emailsLoading}
                selectedId={selectedId}
                onSelect={handleSelectEmail}
                onToggleStar={toggleStar}
                onCompose={openCompose}
                search={search}
                onSearchChange={setSearch}
                readFilter={readFilter}
                onReadFilterChange={setReadFilter}
                dateLocale={dateLocale}
                totalInFolder={folderEmails.length}
                onOpenFolders={isMobile ? () => setMobileFoldersOpen(true) : undefined}
                unreadCount={folderEmails.filter((e) => !e.is_read).length}
                onMarkAllRead={handleMarkAllRead}
              />
            </div>
          )}

          {(!isMobile || mobileView === 'reader') && (
            <div className="min-w-0 flex-1 overflow-hidden rounded-[22px] bg-background">
              <EmailReaderPane
                email={selectedEmail}
                dateLocale={dateLocale}
                locale={locale}
                onReply={() => selectedEmail && openReply(selectedEmail)}
                onReplyAll={() => selectedEmail && openReplyAll(selectedEmail)}
                onForward={() => selectedEmail && openForward(selectedEmail)}
                onToggleStar={() => selectedEmail && toggleStar(selectedEmail)}
                onToggleImportant={() => selectedEmail && toggleImportant(selectedEmail)}
                onToggleRead={() => selectedEmail && toggleRead(selectedEmail)}
                onAskAi={() => {
                  if (!selectedEmail) return;
                  const body = (selectedEmail.body_text || selectedEmail.snippet || '').slice(0, 3000);
                  const ask = locale === 'da'
                    ? `Opsummer denne email og forslå et svar:\n\nEmne: ${selectedEmail.subject}\nFra: ${selectedEmail.from_name || selectedEmail.from_address}\n\n${body}`
                    : locale === 'de'
                      ? `Fasse diese E-Mail zusammen und schlage eine Antwort vor:\n\nBetreff: ${selectedEmail.subject}\nVon: ${selectedEmail.from_name || selectedEmail.from_address}\n\n${body}`
                      : `Summarize this email and suggest a reply:\n\nSubject: ${selectedEmail.subject}\nFrom: ${selectedEmail.from_name || selectedEmail.from_address}\n\n${body}`;
                  openAmbientAI(ask);
                }}
                onBack={isMobile ? () => setMobileView('list') : undefined}
              />
            </div>
          )}
        </div>
      </WorkspaceFrame>

      {/* Mobile folder navigation */}
      <Sheet open={mobileFoldersOpen} onOpenChange={setMobileFoldersOpen}>
        <SheetContent side="left" className="w-72 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Compose / reply / reply-all / forward dialog */}
      <ComposeDialog
        key={composeKey}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        mode={composeMode}
        initial={composeInitial}
        sending={sendingCompose}
        onSend={handleComposeSend}
      />

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
              <CheckCircle2 className="h-5 w-5 text-stamp" />
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
                  onClick={() => { setTodoDialogOpen(false); setActiveFolder('inbox'); handleSelectEmail(email); }}
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-stamp mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-stamp">{email.ai_suggested_todo}</p>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{email.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {email.from_name || email.from_address} · {new Date(email.received_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); setTodoDialogOpen(false); setActiveFolder('inbox'); handleSelectEmail(email); }}>
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
              <Star className="h-5 w-5 text-warning fill-warning" />
              {t('pages.email.prioritizedEmails')} ({priorityCount})
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent><p className="max-w-xs text-xs">{t('pages.email.priorityExplanation')}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
                    onClick={() => { setPriorityDialogOpen(false); setActiveFolder('inbox'); handleSelectEmail(email); }}
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
                      <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); setPriorityDialogOpen(false); setActiveFolder('inbox'); handleSelectEmail(email); }}>
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
