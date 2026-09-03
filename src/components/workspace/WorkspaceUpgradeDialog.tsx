import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { unlockedModulesForProvider } from "@/lib/capabilityDisplay";

interface WorkspaceUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  providerName: string;
}

// The "you just upgraded AI Agency Danmark" moment — shown once, right
// after a connection completes, instead of dropping the user back on a
// plain "Connected" catalogue row. Deliberately understated (no confetti):
// states exactly what became available and where, nothing more.
export function WorkspaceUpgradeDialog({ open, onOpenChange, provider, providerName }: WorkspaceUpgradeDialogProps) {
  const { capabilityNames, moduleNames } = unlockedModulesForProvider(provider);

  if (capabilityNames.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> {providerName} connected</DialogTitle>
          <DialogDescription>Your workspace just gained {capabilityNames.length} capabilit{capabilityNames.length === 1 ? "y" : "ies"}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60 mb-1.5">Unlocked</div>
            <ul className="space-y-1">
              {capabilityNames.map((name) => (
                <li key={name} className="text-sm flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-primary shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          {moduleNames.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60 mb-1.5">Now available in</div>
              <div className="flex flex-wrap gap-1.5">
                {moduleNames.map((m) => (
                  <span key={m} className="text-xs rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
