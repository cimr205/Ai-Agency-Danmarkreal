import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Shield, Users, Loader2, Crown, UserCog, User, Eye, Mail, Copy, Clock, XCircle, CheckCircle2, Send } from "lucide-react";
import { ROLE_LABELS, ROLE_HIERARCHY, canManageRole } from "@/lib/auth";
import { getErrorMessage } from '@/lib/errors';

interface UserWithRole {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  role: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export default function AdminUsers() {
  const { user, isAdmin, roles } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviting, setInviting] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const currentUserRole = roles[0]?.role || "employee";

  const fetchUsers = async () => {
    if (!user?.company_id) return;
    try {
      // Fetch profiles in the same company with their roles
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, created_at")
        .eq("company_id", user.company_id);

      if (error) throw error;

      // Fetch roles for these users
      const userIds = (profiles || []).map((p) => p.user_id);
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const roleMap: Record<string, string> = {};
      (rolesData || []).forEach((r) => {
        const existing = roleMap[r.user_id];
        const existingLevel = existing ? ROLE_HIERARCHY[existing] ?? 5 : 5;
        const newLevel = ROLE_HIERARCHY[r.role] ?? 5;
        if (newLevel < existingLevel) roleMap[r.user_id] = r.role;
      });

      const mapped: UserWithRole[] = (profiles || []).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        role: roleMap[p.user_id] || "employee",
      }));

      mapped.sort((a, b) => (ROLE_HIERARCHY[a.role] || 5) - (ROLE_HIERARCHY[b.role] || 5));
      setUsers(mapped);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Kunne ikke hente brugere");
    }
  };

  const fetchInvitations = async () => {
    if (!user?.company_id) return;
    try {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvitations((data as Invitation[]) || []);
    } catch (error) {
      console.error("Error fetching invitations:", error);
    }
  };

  useEffect(() => {
    Promise.all([fetchUsers(), fetchInvitations()]).finally(() => setLoading(false));
  }, [user?.company_id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.rpc("create_invitation", {
        invite_email: inviteEmail.trim(),
        invite_role: inviteRole as Enums<'app_role'>,
      });
      if (error) throw error;
      setLastToken(data as string);
      toast.success(`Invitation sendt til ${inviteEmail}`);
      setInviteEmail("");
      fetchInvitations();
    } catch (error) {
      toast.error(getErrorMessage(error) || "Kunne ikke oprette invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const { error } = await supabase.rpc("revoke_invitation", { invitation_id: id });
      if (error) throw error;
      toast.success("Invitation tilbagekaldt");
      fetchInvitations();
    } catch (error) {
      toast.error(getErrorMessage(error) || "Kunne ikke tilbagekalde invitation");
    }
  };

  const copyInviteLink = (token: string) => {
    const locale = window.location.pathname.split("/")[1] || "en";
    const link = `${window.location.origin}/${locale}/invite?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite-link kopieret til udklipsholder");
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "system_admin": return "destructive" as const;
      case "company_admin": case "admin": return "destructive" as const;
      case "manager": return "default" as const;
      case "readonly": return "outline" as const;
      default: return "secondary" as const;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "system_admin": return <Crown className="w-3 h-3" />;
      case "company_admin": case "admin": return <Shield className="w-3 h-3" />;
      case "manager": return <UserCog className="w-3 h-3" />;
      case "readonly": return <Eye className="w-3 h-3" />;
      default: return <User className="w-3 h-3" />;
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    if (status === "pending" && new Date(expiresAt) < new Date()) {
      return <Badge variant="outline" className="gap-1 text-muted-foreground"><Clock className="w-3 h-3" />Udløbet</Badge>;
    }
    switch (status) {
      case "pending": return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Afventer</Badge>;
      case "accepted": return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="w-3 h-3" />Accepteret</Badge>;
      case "revoked": return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Tilbagekaldt</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const assignableRoles = ["company_admin", "manager", "employee", "readonly"].filter((role) =>
    canManageRole(currentUserRole, role)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingInvitations = invitations.filter((i) => i.status === "pending" && new Date(i.expires_at) > new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-destructive" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Brugeradministration</h1>
            <p className="text-muted-foreground">Administrer brugere og invitationer i organisationen</p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setLastToken(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Send className="w-4 h-4" />Invitér medarbejder</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invitér ny medarbejder</DialogTitle>
                <DialogDescription>
                  Send en invitation via e-mail. Medarbejderen tilknyttes automatisk din virksomhed.
                </DialogDescription>
              </DialogHeader>
              {lastToken ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Invitation oprettet! Del dette link med medarbejderen:</p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/${window.location.pathname.split("/")[1] || "en"}/invite?token=${lastToken}`}
                      className="text-xs"
                    />
                    <Button size="icon" variant="outline" onClick={() => copyInviteLink(lastToken)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Linket udløber om 7 dage.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">E-mail</label>
                    <Input
                      type="email"
                      placeholder="medarbejder@firma.dk"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Rolle</label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role] || role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <DialogFooter>
                {!lastToken && (
                  <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                    Opret invitation
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Brugere</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{users.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Administratorer</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {users.filter((u) => ["company_admin", "system_admin"].includes(u.role)).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Medarbejdere</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter((u) => ["employee", "manager", "readonly"].includes(u.role)).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Afventende invitationer</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-500">{pendingInvitations.length}</div></CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Brugere</CardTitle>
          <CardDescription>Alle brugere i din virksomhed</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Oprettet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name || "-"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(u.role)} className="gap-1">
                      {getRoleIcon(u.role)}
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("da-DK")}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Ingen brugere fundet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Invitationer</CardTitle>
          <CardDescription>Sendte invitationer og deres status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Oprettet</TableHead>
                <TableHead>Udløber</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[inv.role] || inv.role}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(inv.status, inv.expires_at)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString("da-DK")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(inv.expires_at).toLocaleDateString("da-DK")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {inv.status === "pending" && new Date(inv.expires_at) > new Date() && (
                        <Button size="icon" variant="ghost" onClick={() => handleRevoke(inv.id)} title="Tilbagekald">
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {invitations.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Ingen invitationer endnu</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
