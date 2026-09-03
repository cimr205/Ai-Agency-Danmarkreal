import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useHasCapability } from "@/hooks/api/useCapabilities";
import { useSendEmail } from "@/hooks/api/useEmail";
import { useConnectGmail, useCreateComposioConnection } from "@/hooks/api/useIntegrations";

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  to: string;
  toName?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** Which product module this send happens from — feeds real usage tracking (capability_usage), never fabricated. */
  module: string;
  onSent?: () => void;
}

// Contextual connection, inline: the user never has to navigate away to
// the Integration Centre to send an email from a Lead/Deal — connecting
// right here, then continuing the send, is the whole point of the
// capability-first architecture.
function ConnectEmailPrompt() {
  const connectGmail = useConnectGmail();
  const connectComposio = useCreateComposioConnection();

  const handleOutlook = () => {
    connectComposio.mutate("outlook", {
      onSuccess: (res) => { window.location.href = res.redirectUrl; },
    });
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Ingen forbundet e-mail endnu. Forbind én for at sende direkte herfra.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-2" onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending}>
          {connectGmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Gmail
        </Button>
        <Button variant="outline" className="flex-1 gap-2" onClick={handleOutlook} disabled={connectComposio.isPending}>
          {connectComposio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Outlook
        </Button>
      </div>
    </div>
  );
}

export function ComposeEmailDialog({ open, onOpenChange, to, toName, defaultSubject = "", defaultBody = "", module, onSent }: ComposeEmailDialogProps) {
  const hasEmailSend = useHasCapability("email.send");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const sendEmail = useSendEmail();

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Emne og besked skal udfyldes");
      return;
    }
    sendEmail.mutate(
      { to, subject, message: body, module },
      {
        onSuccess: () => {
          toast.success(`Email sendt til ${toName ?? to}`);
          onOpenChange(false);
          setSubject("");
          setBody("");
          onSent?.();
        },
        onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke sende email"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Send email</DialogTitle>
          <DialogDescription>{toName ? `${toName} — ${to}` : to}</DialogDescription>
        </DialogHeader>

        {!hasEmailSend ? (
          <ConnectEmailPrompt />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Emne</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Emne…" />
            </div>
            <div className="space-y-1.5">
              <Label>Besked</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Skriv din besked…" />
            </div>
          </div>
        )}

        {hasEmailSend && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Annullér</Button>
            <Button onClick={handleSend} disabled={sendEmail.isPending} className="gap-2">
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
