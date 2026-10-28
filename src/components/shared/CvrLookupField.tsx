import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeFunction } from '@/lib/functions';
import { showError } from '@/lib/showError';
import { t3 } from '@/lib/inlineI18n';

interface CvrLookupFieldProps {
  onResult: (result: { name: string; address: string; cvr: string }) => void;
  className?: string;
}

export function CvrLookupField({ onResult, className }: CvrLookupFieldProps) {
  const [cvr, setCvr] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    // The backend (cvrapi.dk via the cvr-search function) searches by CVR
    // number OR company name, so pass the raw term — do not strip to digits.
    const term = cvr.trim();
    if (term.length < 2) {
      toast.error(t3("Indtast mindst 2 tegn (CVR-nummer eller virksomhedsnavn)", "Enter at least 2 characters (CVR number or company name)", "Mindestens 2 Zeichen eingeben (CVR-Nummer oder Firmenname)"));
      return;
    }
    setLoading(true);
    try {
      // Use the Supabase client so the function URL + auth are resolved from the
      // configured project — the previous code built the URL from an undefined
      // VITE_SUPABASE_PROJECT_ID, so every lookup hit https://undefined.supabase.co.
      const payload = await invokeFunction<{ error?: string; results?: Array<{ name?: string; address?: string; zipcode?: string; city?: string; cvr?: string }> }>('cvr-search', { body: { search: term } });
      if (payload?.error) throw new Error(payload.error);

      const results = payload?.results ?? [];
      if (!results.length) {
        toast.error(t3(`Ingen virksomhed fundet for "${term}"`, `No company found for "${term}"`, `Kein Unternehmen gefunden für "${term}"`));
        return;
      }

      const company = results[0];
      const address = [company.address, company.zipcode, company.city].filter(Boolean).join(', ');
      onResult({ name: company.name || '', address, cvr: company.cvr || term.replace(/\D/g, '') });
      toast.success(`Fandt: ${company.name}`);
    } catch (e) {
      showError(e, { action: t3('slå CVR op', 'look up CVR', 'CVR nachschlagen'), module: 'cvr' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Label className="flex items-center gap-1.5 mb-1.5">
        <Building2 className="h-3.5 w-3.5" /> {t3('CVR-opslag', 'CVR lookup', 'CVR-Suche')}
      </Label>
      <div className="flex gap-2">
        <Input
          placeholder={t3("Indtast CVR-nummer eller virksomhedsnavn...", "Enter CVR number or company name...", "CVR-Nummer oder Firmenname eingeben...")}
          value={cvr}
          onChange={e => setCvr(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
          maxLength={200}
        />
        <Button type="button" variant="secondary" size="sm" onClick={lookup} disabled={loading || cvr.trim().length < 2} aria-label={t3('Slå op i CVR', 'Look up in CVR', 'Im CVR nachschlagen')}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{t3("Udfyld automatisk navn og adresse fra CVR-registret", "Fill in name and address automatically from the Danish CVR register", "Name und Adresse automatisch aus dem dänischen CVR-Register ausfüllen")}</p>
    </div>
  );
}
