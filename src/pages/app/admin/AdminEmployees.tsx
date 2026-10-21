import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Key, Shield, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/lib/errors';

export default function AdminEmployees() {
  const { isAdmin, profile } = useAuth();
  const [invitations, setInvitations] = useState<Tables<'invitations'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');

  const loadInvitations = async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase.from('invitations').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false });
    setInvitations(data || []);
    setLoading(false);
  };

  useEffect(() => { loadInvitations(); }, [profile?.company_id]);

  const handleCreateInvitation = async () => {
    if (!email.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_invitation', { invite_email: email.trim() });
      if (error) throw error;
      const token = data;
      const link = `${window.location.origin}/en/invite?token=${token}`;
      await navigator.clipboard.writeText(link);
      toast.success('Invitation oprettet og link kopieret!');
      setEmail('');
      await loadInvitations();
    } catch (err) {
      toast.error((getErrorMessage(err) || 'Kunne ikke oprette invitation'));
    } finally {
      setCreating(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8"><Card><CardContent className="py-12 text-center">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Adgang nægtet</h2>
        <p className="text-muted-foreground">Kun administratorer kan se denne side.</p>
      </CardContent></Card></div>
    );
  }

  if (loading) {
    return <div className="p-8 space-y-6"><Skeleton className="h-8 w-48 mb-2" /><Skeleton className="h-4 w-64" /><Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent><Skeleton className="h-12 w-full" /></CardContent></Card></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div><h1 className="text-2xl font-bold">Tilføj medarbejdere</h1><p className="text-muted-foreground">Inviter nye medarbejdere via email</p></div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" />Inviter medarbejder</CardTitle>
          <CardDescription>Indtast email-adressen på den medarbejder du vil invitere</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="medarbejder@firma.dk" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateInvitation()} />
            <Button onClick={handleCreateInvitation} disabled={creating || !email.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Inviter
            </Button>
          </div>

          {invitations.length > 0 && (
            <div className="pt-4 border-t space-y-2">
              <Label>Seneste invitationer</Label>
              <div className="space-y-1">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                    <div>
                      <span className="font-medium">{inv.email}</span>
                      <span className={`ml-2 text-xs ${inv.status === 'accepted' ? 'text-green-600' : inv.status === 'pending' ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Medarbejdere</CardTitle>
          <CardDescription>Se og administrer medarbejdere under HR → Medarbejdere</CardDescription>
        </CardHeader>
        <CardContent><Button variant="outline" asChild><a href="/en/app/hr/employees">Gå til medarbejderliste</a></Button></CardContent>
      </Card>
    </div>
  );
}
