import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateCalendarEvent } from "@/hooks/api/useCalendar";

interface BookMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  relatedType: "lead" | "customer" | "deal";
  relatedId: string;
  onBooked?: () => void;
}

// <input type="datetime-local"> expects and displays a naive local
// wall-clock string (no timezone) — building these via toISOString()
// (which is UTC) silently shifted the displayed time by the local
// offset, so end could render before start despite being 30 minutes
// later. Pad manually instead of touching ISO/UTC until submit time.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInputValue(d);
}

function defaultEnd(start: string): string {
  const d = new Date(start);
  d.setMinutes(d.getMinutes() + 30);
  return toLocalInputValue(d);
}

// Books directly into the workspace's own internal calendar
// (calendar_events) — always available, no external connection required.
// Where an external calendar (Google/Outlook) is connected, this is the
// natural place to also push the event there in a later pass; not yet
// wired since calendar.write two-way sync isn't built.
export function BookMeetingDialog({ open, onOpenChange, defaultTitle, relatedType, relatedId, onBooked }: BookMeetingDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(() => defaultEnd(defaultStart()));
  const [description, setDescription] = useState("");
  const createEvent = useCreateCalendarEvent();

  const handleBook = () => {
    if (!title.trim() || !start || !end) {
      toast.error("Titel, start og slut skal udfyldes");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("Sluttidspunkt skal være efter starttidspunkt");
      return;
    }
    createEvent.mutate(
      {
        title,
        description: description || undefined,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        event_type: "meeting",
        related_type: relatedType,
        related_id: relatedId,
      },
      {
        onSuccess: (created) => {
          toast.success(
            created.externalPush?.pushed
              ? `Møde booket · synkroniseret til ${created.externalPush.provider === 'googlecalendar' ? 'Google Calendar' : created.externalPush.provider}`
              : "Møde booket",
          );
          onOpenChange(false);
          onBooked?.();
        },
        onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke booke møde"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Book møde</DialogTitle>
          <DialogDescription>Oprettes i jeres interne kalender.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Slut</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (valgfri)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={handleBook} disabled={createEvent.isPending} className="gap-2">
            {createEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Book møde
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
