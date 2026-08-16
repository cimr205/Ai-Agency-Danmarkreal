import { useState } from 'react';
import { useInbox, useMarkMessageRead, useMarkNotificationRead, useSendMessage } from '@/hooks/api/useInbox';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Mail, Bell, Check, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { useI18n, isLocale } from '@/lib/i18n';
import { useParams } from 'react-router-dom';

const localeMap = { da, de, en: enUS };

export default function InboxPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const dateFnsLocale = localeMap[locale] || enUS;

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newMessage, setNewMessage] = useState({ receiver_id: '', content: '' });

  const { data: inbox, isLoading, error } = useInbox();
  const markMessageRead = useMarkMessageRead();
  const markNotificationRead = useMarkNotificationRead();
  const sendMessage = useSendMessage();

  const handleSend = async () => {
    if (!newMessage.receiver_id || !newMessage.content) { toast.error(t('pages.inbox.receiverRequired')); return; }
    try {
      await sendMessage.mutateAsync(newMessage);
      toast.success(t('pages.inbox.sent_success'));
      setNewMessage({ receiver_id: '', content: '' });
      setIsComposeOpen(false);
    } catch { toast.error(t('pages.inbox.sent_error')); }
  };

  const handleMarkMessageRead = async (id: string) => { try { await markMessageRead.mutateAsync(id); } catch {} };
  const handleMarkNotificationRead = async (id: string) => { try { await markNotificationRead.mutateAsync(id); } catch {} };

  const unreadMessages = inbox?.messages?.filter(m => !m.read) ?? [];
  const unreadNotifications = inbox?.notifications?.filter(n => !n.read) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.inbox.title')}</h1>
          <p className="text-muted-foreground">{t('pages.inbox.subtitle')}</p>
        </div>
        <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('pages.inbox.newMessage')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('pages.inbox.sendTitle')}</DialogTitle>
              <DialogDescription>{t('pages.inbox.sendSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="receiver">{t('pages.inbox.to')}</Label><Input id="receiver" value={newMessage.receiver_id} onChange={(e) => setNewMessage({ ...newMessage, receiver_id: e.target.value })} placeholder={t('pages.inbox.toPlaceholder')} /></div>
              <div className="space-y-2"><Label htmlFor="content">{t('pages.inbox.messageLabel')}</Label><Textarea id="content" value={newMessage.content} onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })} placeholder={t('pages.inbox.messagePlaceholder')} rows={4} /></div>
              <Button onClick={handleSend} disabled={sendMessage.isPending} className="w-full">
                {sendMessage.isPending ? t('pages.inbox.sending') : (<><Send className="h-4 w-4 mr-2" />{t('pages.inbox.sendCta')}</>)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center"><Mail className="h-6 w-6 text-blue-600" /></div><div><p className="text-sm text-muted-foreground">{t('pages.inbox.unreadMessages')}</p><p className="text-2xl font-bold">{unreadMessages.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center"><Bell className="h-6 w-6 text-yellow-600" /></div><div><p className="text-sm text-muted-foreground">{t('pages.inbox.unreadNotifications')}</p><p className="text-2xl font-bold">{unreadNotifications.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center"><Check className="h-6 w-6 text-green-600" /></div><div><p className="text-sm text-muted-foreground">{t('pages.inbox.totalLabel')}</p><p className="text-2xl font-bold">{(unreadMessages?.length ?? 0) + (unreadNotifications?.length ?? 0)}</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages" className="gap-2"><Mail className="h-4 w-4" />{t('pages.inbox.messagesTab')}{unreadMessages.length > 0 && <Badge variant="secondary" className="ml-1">{unreadMessages.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />{t('pages.inbox.notificationsTab')}{unreadNotifications.length > 0 && <Badge variant="secondary" className="ml-1">{unreadNotifications.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-4 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="flex items-start gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-full" /></div></div>))}</div>
              ) : error ? (
                <div className="p-8 text-center text-muted-foreground">{t('pages.inbox.fetchErrorMessages')}</div>
              ) : inbox?.messages?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">{t('pages.inbox.emptyMessages')}</div>
              ) : (
                <div className="divide-y">
                  {inbox?.messages?.map((message) => (
                    <div key={message.id} className={`p-4 hover:bg-muted/50 cursor-pointer ${!message.read ? 'bg-primary/5' : ''}`} onClick={() => !message.read && handleMarkMessageRead(message.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${!message.read ? 'text-foreground' : 'text-muted-foreground'}`}>{message.sender_id || t('pages.inbox.unknownSender')}</span>
                            {!message.read && <Badge variant="default" className="text-xs">{t('pages.inbox.new')}</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">{message.content}</p>
                        </div>
                        <span className="text-xs text-muted-foreground ml-4 flex-shrink-0">{formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: dateFnsLocale })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-4 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="flex items-start gap-3"><Skeleton className="h-8 w-8 rounded" /><div className="flex-1"><Skeleton className="h-4 w-full" /></div></div>))}</div>
              ) : error ? (
                <div className="p-8 text-center text-muted-foreground">{t('pages.inbox.fetchErrorNotifications')}</div>
              ) : inbox?.notifications?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">{t('pages.inbox.emptyNotifications')}</div>
              ) : (
                <div className="divide-y">
                  {inbox?.notifications?.map((notification) => (
                    <div key={notification.id} className={`p-4 hover:bg-muted/50 cursor-pointer ${!notification.read ? 'bg-primary/5' : ''}`} onClick={() => !notification.read && handleMarkNotificationRead(notification.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 ${!notification.read ? 'bg-primary' : 'bg-muted'}`} />
                          <div>
                            <p className={!notification.read ? 'font-medium' : 'text-muted-foreground'}>{notification.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{notification.type}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground ml-4 flex-shrink-0">{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateFnsLocale })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}