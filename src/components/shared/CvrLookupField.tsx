import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';

export interface CvrLookupResult {
  name: string;
  address: string;
  cvr: string;
  zipcode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
}

interface CvrLookupFieldProps {
  onResult: (result: CvrLookupResult) => void;
  className?: string;
}

export function CvrLookupField({ onResult, className }: CvrLookupFieldProps) {
  const [cvr, setCvr] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    // The backend (cvrapi.dk via cvr-search) genuinely supports searching
    // by CVR number OR company name through the same `search` param —
    // stripping non-digit characters here (as this used to do) silently
    // destroyed every name search into an empty string, even though the
    // placeholder text below has always invited both.
    const search = cvr.trim();
    if (search.length < 2) {
      toast.error('Indtast mindst 2 tegn');
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Log ind for at søge');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/cvr-search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ search }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Opslag fejlede');

      if (!data.results?.length) {
        toast.error(`Ingen virksomhed fundet for "${search}"`);
        return;
      }

      const company = data.results[0];
      const address = [company.address, company.zipcode, company.city].filter(Boolean).join(', ');
      // Only prefill what the registry actually returned — never invent
      // phone/email/website when the source didn't provide them.
      onResult({
        name: company.name || '',
        address,
        cvr: company.cvr || search,
        zipcode: company.zipcode || '',
        city: company.city || '',
        phone: company.phone || '',
        email: company.email || '',
        website: company.website || '',
      });
      toast.success(`Fandt: ${company.name}`);
    } catch (e) {
      toast.error((getErrorMessage(e) || 'Kunne ikke slå virksomhed op'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Label className="flex items-center gap-1.5 mb-1.5">
        <Building2 className="h-3.5 w-3.5" /> CVR-opslag
      </Label>
      <div className="flex gap-2">
        <Input
          placeholder="Indtast CVR-nummer eller virksomhedsnavn..."
          value={cvr}
          onChange={e => setCvr(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
          maxLength={200}
        />
        <Button type="button" variant="secondary" size="sm" onClick={lookup} disabled={loading || cvr.trim().length < 2}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Udfyld automatisk navn og adresse fra CVR-registret</p>
    </div>
  );
}
