import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';

export type CvrCompanyResult = {
  name: string | null;
  cvr: string | null;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  industrycode: string | null;
  employees: string | null;
  companyform: string | null;
  status: string | null;
  website: string | null;
  startdate: string | null;
};

type CvrSearchResponse = {
  results: CvrCompanyResult[];
  total: number;
  query: string;
};

type CvrSearchError = {
  error: string;
  code?: string;
};

export function useCvrSearch() {
  const [results, setResults] = useState<CvrCompanyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const search = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Søgning skal indeholde mindst 2 tegn');
      return;
    }

    setLoading(true);
    setError(null);

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
          body: JSON.stringify({ search: trimmed }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const errData = data as CvrSearchError;
        setError(errData.error || 'CVR opslag fejlede');
        setResults([]);
        setTotal(0);
        return;
      }

      const searchRes = data as CvrSearchResponse;
      setResults(searchRes.results);
      setTotal(searchRes.total);
    } catch (e) {
      setError(getErrorMessage(e) || 'Noget gik galt');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setResults([]);
    setError(null);
    setTotal(0);
  };

  return { results, loading, error, total, search, clear };
}
