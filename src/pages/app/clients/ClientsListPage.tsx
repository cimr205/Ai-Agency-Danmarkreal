import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useCustomers } from "@/hooks/api/useFinance";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, ArrowUpRight } from "lucide-react";

export default function ClientsListPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const [q, setQ] = useState("");
  const { data, isLoading } = useCustomers();

  const list = (data ?? []).filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60">Connected Business Graph</div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-foreground mt-1">Klienter</h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">Hver klient er et levende objekt — kommunikation, deals, fakturaer og aktivitet samlet ét sted.</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Søg klient eller email"
            className="pl-9 h-9 bg-transparent border-border/60 text-[13px]"
          />
        </div>
      </header>

      <ul className="divide-y divide-border/50 border-y border-border/50">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="py-4"><Skeleton className="h-6 w-full" /></li>
        ))}
        {!isLoading && list.length === 0 && (
          <li className="py-12 text-center text-[13px] text-muted-foreground">Ingen klienter endnu.</li>
        )}
        {list.map(c => {
          const initials = c.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
          return (
            <li key={c.id}>
              <Link
                to={`${base}/clients/${c.id}`}
                className="group py-4 flex items-center gap-4 hover:bg-foreground/[0.02] -mx-4 px-4 rounded-md transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-foreground/[0.04] border border-border/50 grid place-items-center text-[12px] font-display text-foreground/80">
                  {initials || <Building2 className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-foreground/90 truncate">{c.name}</div>
                  <div className="text-[11.5px] text-muted-foreground/70 truncate">{c.email}</div>
                </div>
                <span className="text-[10.5px] font-mono text-muted-foreground/50 hidden sm:block">
                  {new Date(c.created_at).toLocaleDateString("da-DK", { month: "short", year: "numeric" })}
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
