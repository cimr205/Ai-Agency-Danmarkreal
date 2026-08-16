import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Check, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

type Submission = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  read: boolean;
  created_at: string;
};

export default function AdminContactSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contact_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    setSubmissions((data as Submission[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await supabase.from('contact_submissions').update({ read: true }).eq('id', id);
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, read: true } : s));
  };

  const unreadCount = submissions.filter(s => !s.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Kontaktformularer</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} ny(e)</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Opdater
        </Button>
      </div>

      {submissions.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">Ingen henvendelser endnu.</p>
      )}

      <div className="space-y-3">
        {submissions.map(s => (
          <Card key={s.id} className={!s.read ? 'border-blue-400/50 bg-blue-50/30' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.name}</span>
                    {!s.read && <Badge className="text-[10px] h-4 bg-blue-600">Ny</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>
                    {s.phone && <span>{s.phone}</span>}
                    <span>{format(new Date(s.created_at), 'dd. MMM yyyy HH:mm', { locale: da })}</span>
                  </div>
                  <p className="text-sm text-foreground mt-2">{s.message}</p>
                </div>
                {!s.read && (
                  <Button variant="ghost" size="sm" onClick={() => markRead(s.id)} className="shrink-0">
                    <Check className="w-4 h-4 mr-1" /> Læst
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
