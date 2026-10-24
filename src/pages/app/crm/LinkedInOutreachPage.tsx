import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, ExternalLink, Linkedin, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isLocale, useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useDeleteLinkedInOutreach, useGenerateLinkedInDrafts, useLinkedInAccount, useLinkedInOutreach,
  useUpdateLinkedInOutreach, type LinkedInOutreachRow, type OutreachStatus,
} from "@/hooks/api/useLinkedInOutreach";

const STATUSES: OutreachStatus[] = ["draft", "ready", "connection_sent", "connected", "messaged", "replied", "skipped"];
const NOTE_MAX = 300;

async function copy(text: string, okMsg: string, failMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error(failMsg);
  }
}

function OutreachCard({ row }: { row: LinkedInOutreachRow }) {
  const { t } = useI18n();
  const update = useUpdateLinkedInOutreach();
  const remove = useDeleteLinkedInOutreach();
  const [note, setNote] = useState(row.connection_note ?? "");
  const [followup, setFollowup] = useState(row.followup_message ?? "");

  const setStatus = (status: OutreachStatus) => {
    const now = new Date().toISOString();
    update.mutate({
      id: row.id,
      patch: {
        status,
        ...(status === "connection_sent" ? { sent_at: now } : {}),
        ...(status === "connected" ? { connected_at: now } : {}),
        ...(status === "replied" ? { replied_at: now } : {}),
      },
    });
  };

  const dirty = note !== (row.connection_note ?? "") || followup !== (row.followup_message ?? "");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{row.contact_name || row.company_name || row.linkedin_url}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[row.contact_role, row.company_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Select value={row.status} onValueChange={(v) => setStatus(v as OutreachStatus)}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`linkedinOutreach.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t("linkedinOutreach.connectionNote")}</span>
          <span className={`text-[11px] ${note.length > NOTE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
            {note.length}/{NOTE_MAX}
          </span>
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="text-sm" />
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t("linkedinOutreach.followup")}</span>
        <Textarea value={followup} onChange={(e) => setFollowup(e.target.value)} rows={4} className="text-sm" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!note}
          onClick={() => copy(note, t("linkedinOutreach.copied"), t("linkedinOutreach.copyFailed"))}>
          <Copy className="h-3.5 w-3.5" /> {t("linkedinOutreach.copyNote")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!followup}
          onClick={() => copy(followup, t("linkedinOutreach.copied"), t("linkedinOutreach.copyFailed"))}>
          <Copy className="h-3.5 w-3.5" /> {t("linkedinOutreach.copyFollowup")}
        </Button>
        <Button size="sm" asChild className="gap-1.5">
          <a href={row.linkedin_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> {t("linkedinOutreach.openProfile")}
          </a>
        </Button>
        {dirty && (
          <Button size="sm" variant="secondary" disabled={note.length > NOTE_MAX || update.isPending}
            onClick={() => update.mutate({ id: row.id, patch: { connection_note: note, followup_message: followup } })}>
            {t("linkedinOutreach.save")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={remove.isPending}
          onClick={() => remove.mutate(row.id)} aria-label={t("linkedinOutreach.remove")}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

export default function LinkedInOutreachPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const { data: rows = [], isLoading } = useLinkedInOutreach();
  const { data: account } = useLinkedInAccount();
  const generate = useGenerateLinkedInDrafts();
  const [filter, setFilter] = useState<OutreachStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c = new Map<OutreachStatus, number>();
    rows.forEach((r) => c.set(r.status, (c.get(r.status) ?? 0) + 1));
    return c;
  }, [rows]);
  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const runGenerate = (ids: string[]) => {
    generate.mutate(ids, {
      onSuccess: (r) => {
        setSelected(new Set());
        if (r.generated) toast.success(t("linkedinOutreach.generated").replace("{count}", String(r.generated)));
        if (r.failed.length) toast.error(t("linkedinOutreach.generateFailed").replace("{count}", String(r.failed.length)));
      },
    });
  };

  const needDrafts = rows.filter((r) => !r.connection_note && r.status !== "skipped").map((r) => r.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("linkedinOutreach.eyebrow")}
        title={t("linkedinOutreach.title")}
        description={t("linkedinOutreach.description")}
        actions={
          <Button className="gap-1.5" disabled={generate.isPending || needDrafts.length === 0}
            onClick={() => runGenerate(needDrafts.slice(0, 25))}>
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t("linkedinOutreach.generateMissing")} ({Math.min(needDrafts.length, 25)})
          </Button>
        }
      />

      <Card className="p-3 flex items-center gap-3 text-sm">
        <Linkedin className="h-4 w-4 text-muted-foreground" />
        {account?.connected ? (
          <span>{t("linkedinOutreach.connectedAs").replace("{name}", account.name ?? "LinkedIn")}</span>
        ) : (
          <span className="text-muted-foreground">
            {t("linkedinOutreach.notConnected")}{" "}
            <Link className="text-primary hover:underline" to={`/${locale}/app/workspace/connected-apps`}>
              {t("linkedinOutreach.connectLink")}
            </Link>
          </span>
        )}
      </Card>
      <p className="text-xs text-muted-foreground -mt-3">{t("linkedinOutreach.manualNotice")}</p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          {t("linkedinOutreach.all")} ({rows.length})
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {t(`linkedinOutreach.status.${s}`)} ({counts.get(s) ?? 0})
          </Button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{selected.size}</Badge>
          <Button size="sm" variant="outline" disabled={generate.isPending || selected.size > 25}
            onClick={() => runGenerate(Array.from(selected))} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> {t("linkedinOutreach.regenerate")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Linkedin}
          title={t("linkedinOutreach.emptyTitle")}
          hint={t("linkedinOutreach.emptyHint")}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((row) => (
            <div key={row.id} className="relative">
              <div className="absolute -left-1 top-4 z-10">
                <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)}
                  aria-label={row.contact_name ?? row.linkedin_url} />
              </div>
              <div className="pl-5"><OutreachCard row={row} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
