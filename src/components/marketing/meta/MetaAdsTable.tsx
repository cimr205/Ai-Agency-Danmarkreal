import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Image } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export function MetaAdsTable() {
  const [search, setSearch] = useState("");
  const { locale } = useI18n();
  const isDa = locale === 'da';

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{isDa ? 'Alle annoncer' : 'All Ads'}</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder={isDa ? 'Søg annoncer...' : 'Search ads...'} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-primary/5 scale-[2] blur-xl" />
            <div className="relative h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Image className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">{isDa ? 'Ingen annoncer' : 'No ads'}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {isDa ? 'Forbind din Meta Ads konto for at se dine annoncer her' : 'Connect your Meta Ads account to see your ads here'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
