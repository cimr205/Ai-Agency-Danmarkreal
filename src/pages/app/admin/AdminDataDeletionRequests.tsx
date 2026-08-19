import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';

type DeletionRequest = {
  id: string;
  user_id: string;
  company_id: string | null;
  status: string;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
  profile_email: string | null;
};

export default function AdminDataDeletionRequests() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('data_deletion_requests')
      .select('id, user_id, company_id, status, requested_at, processed_at, notes')
      .order('requested_at', { ascending: false });
    if (error) {
      toast.error(getErrorMessage(error) || 'Kunne ikke hente sletteanmodninger');
      setLoading(false);
      return;
    }
    const rows = data || [];
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('user_id, email').in('user_id', userIds)
      : { data: [] as { user_id: string; email: string }[] };
    const emailByUser = new Map((profiles || []).map(p => [p.user_id, p.email]));
    setRequests(rows.map(r => ({ ...r, profile_email: emailByUser.get(r.user_id) ?? null })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markProcessed = async (id: string) => {
    setProcessing(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('data_deletion_requests')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
          notes: notesDraft[id] ?? null,
        })
        .eq('id', id);
      if (error) throw error;
      toast.success('Markeret som behandlet');
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Kunne ikke opdatere anmodning');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">GDPR-sletteanmodninger</h2>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-xs">{pendingCount} afventer</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Opdater
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg p-3">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Denne side markerer kun anmodninger som behandlet — den sletter ikke automatisk brugerdata.
          Udfør den faktiske sletning manuelt (eller via en separat, verificeret handling) før du markerer en anmodning som behandlet.
        </p>
      </div>

      {requests.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">Ingen sletteanmodninger.</p>
      )}

      <div className="space-y-3">
        {requests.map(r => (
          <Card key={r.id} className={r.status === 'pending' ? 'border-destructive/40' : ''}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.profile_email || r.user_id}</span>
                    <Badge variant={r.status === 'pending' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                      {r.status === 'pending' ? 'Afventer' : 'Behandlet'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anmodet {format(new Date(r.requested_at), 'dd. MMM yyyy HH:mm', { locale: da })}
                    {r.processed_at && ` · Behandlet ${format(new Date(r.processed_at), 'dd. MMM yyyy HH:mm', { locale: da })}`}
                  </p>
                  {r.notes && <p className="text-sm text-foreground mt-1">{r.notes}</p>}
                </div>
              </div>
              {r.status === 'pending' && (
                <div className="flex items-start gap-2">
                  <Textarea
                    placeholder="Noter (valgfrit)"
                    value={notesDraft[r.id] ?? ''}
                    onChange={e => setNotesDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                    className="text-sm min-h-[2.5rem]"
                  />
                  <Button size="sm" disabled={processing === r.id} onClick={() => markProcessed(r.id)} className="shrink-0">
                    Marker behandlet
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
