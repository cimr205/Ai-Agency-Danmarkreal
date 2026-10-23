import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface EmailFolder {
  id: string;
  name: string;
  keyword: string;
}

// AI priority categories already computed server-side by gmail-sync's
// classifier (see supabase/functions/gmail-sync). A folder keyword that
// matches one of these synonyms also matches on ai_priority, not just
// substring search — so e.g. a "Faktura" folder catches AI-flagged invoice
// emails even when the word "faktura" isn't in the subject/snippet.
const PRIORITY_SYNONYMS: Record<string, 'meeting' | 'deadline' | 'invoice' | 'contract'> = {
  meeting: 'meeting', møde: 'meeting', moede: 'meeting', meetings: 'meeting',
  deadline: 'deadline', frist: 'deadline', deadlines: 'deadline',
  invoice: 'invoice', invoices: 'invoice', faktura: 'invoice', fakturaer: 'invoice', betaling: 'invoice',
  contract: 'contract', contracts: 'contract', kontrakt: 'contract', kontrakter: 'contract', aftale: 'contract',
  urgent: 'deadline', haster: 'deadline', vigtigt: 'deadline',
};

function storageKey(userId: string) {
  return `email-folders:${userId}`;
}

// Custom folders are saved search filters, not mail containers — there is
// no backend table for them (no folder/label-assignment API exists), so
// they're persisted per-browser in localStorage. This is real, working
// functionality (it actually filters the user's real synced emails) but it
// does not sync across devices; callers should be transparent about that.
export function useEmailFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<EmailFolder[]>([]);

  useEffect(() => {
    if (!user?.id) { setFolders([]); return; }
    try {
      const raw = localStorage.getItem(storageKey(user.id));
      setFolders(raw ? JSON.parse(raw) : []);
    } catch {
      setFolders([]);
    }
  }, [user?.id]);

  const persist = useCallback((next: EmailFolder[]) => {
    setFolders(next);
    if (user?.id) {
      localStorage.setItem(storageKey(user.id), JSON.stringify(next));
    }
  }, [user?.id]);

  const addFolder = useCallback((name: string, keyword: string) => {
    const folder: EmailFolder = { id: crypto.randomUUID(), name: name.trim(), keyword: keyword.trim() };
    persist([...folders, folder]);
    return folder;
  }, [folders, persist]);

  const removeFolder = useCallback((id: string) => {
    persist(folders.filter(f => f.id !== id));
  }, [folders, persist]);

  return { folders, addFolder, removeFolder };
}

export function matchesFolderKeyword(
  email: { subject: string | null; snippet: string | null; from_name: string | null; from_address: string; ai_priority: string | null },
  keyword: string,
): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return false;

  const haystack = `${email.subject || ''} ${email.snippet || ''} ${email.from_name || ''} ${email.from_address || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;

  const priorityMatch = PRIORITY_SYNONYMS[q];
  if (priorityMatch && email.ai_priority === priorityMatch) return true;

  return false;
}
