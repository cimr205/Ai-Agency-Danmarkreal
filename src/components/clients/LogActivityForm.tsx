import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateActivity, type CrmActivityType } from "@/hooks/api/useActivities";
import { useToast } from "@/components/ui/use-toast";
import { tx } from '@/lib/inlineI18n';

const LOGGABLE_TYPES: { value: CrmActivityType; readonly label: string }[] = [
  { value: "call", get label() { return tx("Opkald", "Call"); } },
  { value: "meeting", get label() { return tx("Møde", "Meeting"); } },
  { value: "note", get label() { return tx("Note", "Note"); } },
];

export function LogActivityForm({ entityType, entityId }: { entityType: "customer" | "deal"; entityId: string }) {
  const [type, setType] = useState<CrmActivityType>("note");
  const [body, setBody] = useState("");
  const [nextStepAt, setNextStepAt] = useState("");
  const createActivity = useCreateActivity();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!body.trim() && !nextStepAt) return;
    try {
      await createActivity.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        type,
        body: body.trim() || undefined,
        next_step_at: nextStepAt ? new Date(nextStepAt).toISOString() : undefined,
      });
      setBody("");
      setNextStepAt("");
      toast({ title: tx("Aktivitet logget", "Activity logged") });
    } catch (e) {
      toast({ title: tx("Kunne ikke logge aktivitet", "Could not log activity"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="border border-border/40 rounded-md p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as CrmActivityType)}>
          <SelectTrigger className="h-8 w-32 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOGGABLE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-[12.5px]">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="datetime-local"
          value={nextStepAt}
          onChange={(e) => setNextStepAt(e.target.value)}
          className="h-8 w-44 text-[12.5px]"
          placeholder={tx("Opfølgning (valgfri)", "Follow-up (optional)")}
        />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tx("Hvad skete der?", "What happened?")}
        className="min-h-[60px] text-[13px]"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={createActivity.isPending || (!body.trim() && !nextStepAt)}>
          {tx("Log aktivitet", "Log activity")}
        </Button>
      </div>
    </div>
  );
}
