import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Webhook, Plus, Trash2, Play, Eye, Copy, Shield, ExternalLink,
  CheckCircle2, XCircle, Clock, Zap, MoreHorizontal, RefreshCw
} from "lucide-react";
import {
  useWebhooks, useWebhookLogs, useCreateWebhook, useUpdateWebhook,
  useDeleteWebhook, useTestWebhook, WEBHOOK_EVENTS,
} from "@/hooks/api/useWebhooks";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import type { Tables } from "@/integrations/supabase/types";
import { getErrorMessage } from '@/lib/errors';

type WebhookRow = Tables<'webhooks'>;

export default function WebhooksPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { data: webhooks, isLoading } = useWebhooks();
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const { data: logs, isLoading: logsLoading } = useWebhookLogs(selectedWebhookId || undefined);
  const createMut = useCreateWebhook();
  const updateMut = useUpdateWebhook();
  const deleteMut = useDeleteWebhook();
  const testMut = useTestWebhook();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", event: "", secret_key: "" });

  const handleCreate = async () => {
    if (!form.name || !form.url || !form.event) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      new URL(form.url);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    try {
      await createMut.mutateAsync({
        name: form.name,
        url: form.url,
        event: form.event,
        ...(form.secret_key ? { secret_key: form.secret_key } : {}),
      });
      toast.success("Webhook created");
      setShowCreate(false);
      setForm({ name: "", url: "", event: "", secret_key: "" });
    } catch (e) {
      toast.error(getErrorMessage(e) || String(e));
    }
  };

  const handleTest = async (wh: WebhookRow) => {
    try {
      const result = await testMut.mutateAsync({
        webhookId: wh.id,
        event: wh.event,
        companyId: profile!.company_id!,
      });
      const status = result?.results?.[0]?.status;
      if (status === "success") toast.success("Test webhook delivered successfully!");
      else toast.error("Test webhook failed — check logs for details");
    } catch (e) {
      toast.error("Test failed: " + (getErrorMessage(e) || String(e)));
    }
  };

  const handleToggle = async (wh: WebhookRow) => {
    await updateMut.mutateAsync({ id: wh.id, is_active: !wh.is_active });
    toast.success(wh.is_active ? "Webhook disabled" : "Webhook enabled");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook? This cannot be undone.")) return;
    await deleteMut.mutateAsync(id);
    toast.success("Webhook deleted");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Webhook className="h-6 w-6" /> {t("webhooks.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("webhooks.description")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> {t("webhooks.create")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("webhooks.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Name *</Label>
                <Input placeholder="e.g. Slack — New Leads" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Webhook URL *</Label>
                <Input placeholder="https://hooks.zapier.com/..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Paste the URL from Zapier, Make, or any other service</p>
              </div>
              <div>
                <Label>Event Trigger *</Label>
                <Select value={form.event} onValueChange={v => setForm(f => ({ ...f, event: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select event..." /></SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_EVENTS.map(ev => (
                      <SelectItem key={ev} value={ev}>{ev}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Shield className="h-3 w-3" /> Secret Key (optional)</Label>
                <Input placeholder="Used for HMAC-SHA256 verification" value={form.secret_key} onChange={e => setForm(f => ({ ...f, secret_key: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">If set, we'll include an X-Webhook-Signature header</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Webhook
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Zapier/Make connection guide */}
      <Card className="border border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="font-semibold text-base">{t("webhooks.zapierGuideTitle")}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Zapier og Make bruger webhook-URL'er til at modtage data. Du logger ind på din egen Zapier/Make-konto, opretter en Zap/scenario med en "Webhook" trigger, kopierer URL'en, og indsætter den her.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
                  <p className="font-medium text-sm flex items-center gap-1.5"><Zap className="h-4 w-4 text-orange-500" /> Zapier</p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal ml-4">
                    <li>Log ind på <a href="https://zapier.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">zapier.com</a></li>
                    <li>Opret en ny Zap → vælg <strong>"Webhooks by Zapier"</strong> som trigger</li>
                    <li>Vælg <strong>"Catch Hook"</strong></li>
                    <li>Kopiér den webhook-URL Zapier giver dig</li>
                    <li>Indsæt URL'en her med knappen "Opret webhook"</li>
                  </ol>
                </div>
                <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
                  <p className="font-medium text-sm flex items-center gap-1.5"><ExternalLink className="h-4 w-4 text-violet-500" /> Make (Integromat)</p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal ml-4">
                    <li>Log ind på <a href="https://www.make.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">make.com</a></li>
                    <li>Opret et nyt scenario → tilføj <strong>"Webhook"</strong> modul</li>
                    <li>Vælg <strong>"Custom webhook"</strong></li>
                    <li>Kopiér den webhook-URL Make giver dig</li>
                    <li>Indsæt URL'en her med knappen "Opret webhook"</li>
                  </ol>
                </div>
              </div>
              <Button onClick={() => setShowCreate(true)} className="mt-1">
                <Plus className="h-4 w-4 mr-2" /> Forbind med webhook-URL
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Webhooks | Logs */}
      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks ({webhooks?.length || 0})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : !webhooks?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Webhook className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium">{t("webhooks.emptyTitle")}</p>
                <p className="text-sm text-muted-foreground mb-4">{t("webhooks.emptyDesc")}</p>
                <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> {t("webhooks.create")}</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {webhooks.map(wh => (
                <Card key={wh.id} className={!wh.is_active ? "opacity-60" : ""}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{wh.name}</span>
                          <Badge variant={wh.is_active ? "default" : "secondary"} className="text-xs">
                            {wh.is_active ? "Active" : "Disabled"}
                          </Badge>
                          <Badge variant="outline" className="text-xs font-mono">{wh.event}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate font-mono">{wh.url}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-500" /> {wh.success_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-destructive" /> {wh.fail_count}
                          </span>
                          {wh.last_triggered_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {format(new Date(wh.last_triggered_at), "MMM d, HH:mm")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch checked={wh.is_active} onCheckedChange={() => handleToggle(wh)} />
                        <Button variant="outline" size="sm" onClick={() => handleTest(wh)} disabled={testMut.isPending}>
                          <Play className="h-3 w-3 mr-1" /> Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedWebhookId(wh.id); }}>
                          <Eye className="h-3 w-3 mr-1" /> Logs
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(wh.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          {/* Webhook filter for logs */}
          <div className="flex items-center gap-3 mb-4">
            <Select value={selectedWebhookId || "all"} onValueChange={v => setSelectedWebhookId(v === "all" ? null : v)}>
              <SelectTrigger className="w-64"><SelectValue placeholder="All webhooks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All webhooks</SelectItem>
                {webhooks?.map(wh => (
                  <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>HTTP Code</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : !logs?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No logs yet</TableCell></TableRow>
                ) : logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.status === "success" ? (
                        <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>
                      ) : (
                        <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.event}</TableCell>
                    <TableCell>{log.status_code || "—"}</TableCell>
                    <TableCell>{log.attempt}/{3}</TableCell>
                    <TableCell className="text-xs">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">{log.error_message || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
