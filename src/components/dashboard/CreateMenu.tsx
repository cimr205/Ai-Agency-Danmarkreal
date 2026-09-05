import { Plus, User, Briefcase, FileText, Calendar, Mail, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CreateAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function CreateMenu({ base }: { base: string }) {
  const navigate = useNavigate();

  const actions: CreateAction[] = [
    { label: "Lead", href: `${base}/crm/leads?create=true`, icon: User },
    { label: "Deal", href: `${base}/crm/deals?create=true`, icon: Briefcase },
    { label: "Faktura", href: `${base}/finance/invoices?create=true`, icon: FileText },
    { label: "Møde", href: `${base}/work/calendar?create=true`, icon: Calendar },
    { label: "Mail", href: `${base}/email/emails?compose=true`, icon: Mail },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[8px] bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          aria-label="Opret nyt"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          Opret
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-52 rounded-[8px] p-1">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            onSelect={() => navigate(a.href)}
            className="gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] focus:bg-muted"
          >
            <a.icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
