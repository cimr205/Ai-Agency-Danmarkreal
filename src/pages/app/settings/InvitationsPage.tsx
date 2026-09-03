import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Mail, Copy, XCircle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';
import { getErrorMessage } from '@/lib/errors';

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
};

export default function InvitationsPage() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const { locale } = useParams();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('employee');
  const [creating, setCreating] = useState(false);
  // The raw invitation token is only ever returned once, right here, by
  // create_invitation() — the database only stores a hash of it, so
  // there is no way to recover this link later. Shown once, then gone.
  const [justCreatedLink, setJustCreatedLink] = useState<string | null>(null);

  const loadInvitations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invitations')
      .select('id, email, role, status, created_at, expires_at')
      .order('created_at', { ascending: false });
    setInvitations((data || []) as Invitation[]);
    setLoading(false);
  };

  useEffect(() => { loadInvitations(); }, []);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error(t('invitations.emailRequired'));
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_invitation', {
        invite_email: newEmail.trim(),
        invite_role: newRole as Enums<'app_role'>,
      });
      if (error) throw error;
      // data is the raw token — the only place it will ever be visible.
      // No email is actually sent (there's no email-sending wired to
      // this flow yet); the admin must copy this link and send it
      // themselves.
      const baseUrl = window.location.origin;
      setJustCreatedLink(`${baseUrl}/${locale || 'en'}/invite?token=${data}`);
      setNewEmail('');
      setNewRole('employee');
      await loadInvitations();
    } catch (err) {
      toast.error(getErrorMessage(err) || t('invitations.couldNotCreate'));
    } finally {
      setCreating(false);
    }
  };

  const copyJustCreatedLink = () => {
    if (!justCreatedLink) return;
    navigator.clipboard.writeText(justCreatedLink);
    toast.success(t('invitations.invitationLinkCopied'));
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setJustCreatedLink(null);
  };

  const handleRevoke = async (id: string) => {
    try {
      const { error } = await supabase.rpc('revoke_invitation', { invitation_id: id });
      if (error) throw error;
      toast.success(t('invitations.invitationRevoked'));
      await loadInvitations();
    } catch (err) {
      toast.error(getErrorMessage(err) || t('invitations.couldNotRevoke'));
    }
  };

  const statusBadge = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    if (status === 'accepted') return <Badge className="bg-success/15 text-success"><CheckCircle2 className="h-3 w-3 mr-1" />{t('invitations.accepted')}</Badge>;
    if (status === 'revoked') return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('invitations.revoked')}</Badge>;
    if (isExpired) return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{t('invitations.expired')}</Badge>;
    return <Badge className="bg-warning/15 text-warning"><Clock className="h-3 w-3 mr-1" />{t('invitations.pending')}</Badge>;
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">{t('common.adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('invitations.title')}</h1>
          <p className="text-muted-foreground">{t('invitations.subtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) closeCreateDialog(); else setIsCreateOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t('invitations.inviteMember')}</Button>
          </DialogTrigger>
          <DialogContent>
            {justCreatedLink ? (
              <>
                <DialogHeader>
                  <DialogTitle>{t('invitations.inviteTeamMember')}</DialogTitle>
                  <DialogDescription>
                    Invitationen er oprettet. Dette link vises kun én gang — kopiér det og send det til medarbejderen nu.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input readOnly value={justCreatedLink} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" size="icon" onClick={copyJustCreatedLink}><Copy className="h-4 w-4" /></Button>
                  </div>
                  <Button onClick={closeCreateDialog} className="w-full">{t('common.done') || 'Færdig'}</Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{t('invitations.inviteTeamMember')}</DialogTitle>
                  <DialogDescription>{t('invitations.inviteDesc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('auth.email')} *</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="colleague@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('invitations.roleLabel')}</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">{t('roles.employee')}</SelectItem>
                        <SelectItem value="manager">{t('roles.manager')}</SelectItem>
                        <SelectItem value="company_admin">{t('invitations.adminRole')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreate} disabled={creating} className="w-full">
                    {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    {creating ? t('common.loading') : t('settings.sendInvitation')}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t('invitations.pending')}</p><p className="text-2xl font-bold text-warning">{invitations.filter(i => i.status === 'pending' && new Date(i.expires_at) > new Date()).length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t('invitations.accepted')}</p><p className="text-2xl font-bold text-success">{invitations.filter(i => i.status === 'accepted').length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t('invitations.total')}</p><p className="text-2xl font-bold">{invitations.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('invitations.allInvitations')}</CardTitle>
          <CardDescription>{t('invitations.allInvitationsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>{t('invitations.noInvitationsYet')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('auth.email')}</TableHead>
                  <TableHead>{t('invitations.roleCol')}</TableHead>
                  <TableHead>{t('invitations.statusCol')}</TableHead>
                  <TableHead>{t('invitations.createdCol')}</TableHead>
                  <TableHead>{t('invitations.expiresCol')}</TableHead>
                  <TableHead className="text-right">{t('invitations.actionsCol')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell><Badge variant="outline">{inv.role}</Badge></TableCell>
                    <TableCell>{statusBadge(inv.status, inv.expires_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {inv.status === 'pending' && new Date(inv.expires_at) > new Date() && (
                          <Button size="sm" variant="ghost" onClick={() => handleRevoke(inv.id)} className="text-destructive hover:text-destructive" title={t('invitations.revoke')}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
