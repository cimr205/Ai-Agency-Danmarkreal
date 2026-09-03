import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateActivity, type CrmActivityType } from "@/hooks/api/useActivities";
import { useToast } from "@/components/ui/use-toast";

const LOGGABLE_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: "call", label: "Opkald" },
  { value: "meeting", label: "Møde" },
  { value: "note", label: "Note" },
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
      toast({ title: "Aktivitet logget" });
    } catch (e) {
      toast({ title: "Kunne ikke logge aktivitet", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
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
          placeholder="Opfølgning (valgfri)"
        />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Hvad skete der?"
        className="min-h-[60px] text-[13px]"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={createActivity.isPending || (!body.trim() && !nextStepAt)}>
          Log aktivitet
        </Button>
      </div>
    </div>
  );
}
