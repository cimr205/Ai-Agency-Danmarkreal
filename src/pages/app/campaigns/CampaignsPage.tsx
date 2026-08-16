/**
 * Campaigns Page
 * Manage email campaigns - all data from backend
 */

import { useState } from 'react';
import { Send, Plus, Users, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useCampaigns, useCreateCampaign, useSendCampaign } from '@/hooks/api';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  draft: 'Kladde',
  sending: 'Sender',
  sent: 'Sendt',
  failed: 'Fejlet',
};

export default function CampaignsPage() {
  const { toast } = useToast();
  const { data: campaigns, isLoading, error } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    subject: '',
    body: '',
    recipients: '',
  });

  const handleCreate = async () => {
    if (!newCampaign.name.trim() || !newCampaign.subject.trim() || !newCampaign.recipients.trim()) {
      toast({
        title: 'Udfyld alle felter',
        description: 'Navn, emne og modtagere er påkrævet.',
        variant: 'destructive',
      });
      return;
    }

    const recipientList = newCampaign.recipients
      .split(/[,\n]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (recipientList.length > 200) {
      toast({
        title: 'For mange modtagere',
        description: 'Maksimalt 200 modtagere pr. kampagne.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createCampaign.mutateAsync({
        name: newCampaign.name,
        subject: newCampaign.subject,
        body: newCampaign.body,
        recipients: recipientList,
      });
      toast({
        title: 'Kampagne oprettet',
        description: `Kampagne "${newCampaign.name}" er oprettet med ${recipientList.length} modtagere.`,
      });
      setIsCreateOpen(false);
      setNewCampaign({ name: '', subject: '', body: '', recipients: '' });
    } catch (err) {
      toast({
        title: 'Fejl',
        description: 'Kunne ikke oprette kampagne.',
        variant: 'destructive',
      });
    }
  };

  const handleSend = async (campaignId: string) => {
    try {
      await sendCampaign.mutateAsync(campaignId);
      toast({
        title: 'Kampagne sendt',
        description: 'Kampagnen er nu ved at blive sendt.',
      });
    } catch (err) {
      toast({
        title: 'Fejl',
        description: 'Kunne ikke sende kampagne.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kampagner</h1>
          <p className="text-muted-foreground">
            Opret og send email kampagner (maks 200 modtagere)
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Ny Kampagne
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Opret Kampagne</DialogTitle>
              <DialogDescription>
                Udfyld kampagnedetaljer. Maks 200 modtagere.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Kampagnenavn</Label>
                <Input
                  id="name"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="F.eks. 'Januar Nyhedsbrev'"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Email Emne</Label>
                <Input
                  id="subject"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  placeholder="Emnelinjen modtagere ser"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Indhold</Label>
                <Textarea
                  id="body"
                  value={newCampaign.body}
                  onChange={(e) => setNewCampaign({ ...newCampaign, body: e.target.value })}
                  placeholder="Email indhold..."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipients">
                  Modtagere (adskilt med komma eller ny linje, maks 200)
                </Label>
                <Textarea
                  id="recipients"
                  value={newCampaign.recipients}
                  onChange={(e) => setNewCampaign({ ...newCampaign, recipients: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {newCampaign.recipients
                    .split(/[,\n]/)
                    .filter(e => e.trim()).length} modtagere
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Annuller
                </Button>
                <Button onClick={handleCreate} disabled={createCampaign.isPending}>
                  {createCampaign.isPending ? 'Opretter...' : 'Opret Kampagne'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Kampagner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sendt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {campaigns?.filter(c => c.status === 'sent').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Kladder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {campaigns?.filter(c => c.status === 'draft').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Kampagner</CardTitle>
          <CardDescription>
            Oversigt over dine email kampagner
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              Kunne ikke hente kampagner.
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Ingen kampagner endnu.</p>
              <p className="text-sm mt-2">Opret din første kampagne for at komme i gang.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>Emne</TableHead>
                  <TableHead>Modtagere</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Oprettet</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{campaign.subject}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {campaign.recipients_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[campaign.status] || ''}>
                        {statusLabels[campaign.status] || campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(campaign.created_at).toLocaleDateString('da-DK')}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => handleSend(campaign.id)}
                          disabled={sendCampaign.isPending}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Send
                        </Button>
                      )}
                      {campaign.status === 'sent' && (
                        <span className="text-sm text-green-600 flex items-center gap-1 justify-end">
                          <CheckCircle2 className="h-4 w-4" />
                          {campaign.sent_count} sendt
                        </span>
                      )}
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
