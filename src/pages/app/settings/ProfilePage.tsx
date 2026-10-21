import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Lock, Shield, Download, Trash2, FileText, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getErrorMessage } from '@/lib/errors';

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { profile, roles, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return email.slice(0, 2).toUpperCase();
  };

  const handleSaveName = async () => {
    if (!profile?.user_id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', profile.user_id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t('common.saved'));
    } catch (e) {
      toast.error(getErrorMessage(e) || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(t('auth.passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordMismatch'));
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('profile.passwordChanged'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast.error(getErrorMessage(e) || t('common.error'));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExportData = async () => {
    if (!profile?.user_id) return;
    setExporting(true);
    try {
      const [profileData, leadsData, tasksData, activityData] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', profile.user_id),
        supabase.from('customers').select('*').eq('record_type', 'lead').eq('created_by', profile.user_id).limit(1000),
        supabase.from('tasks').select('*').eq('created_by', profile.user_id).limit(1000),
        supabase.from('activity_logs').select('*').eq('user_id', profile.user_id).limit(1000),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        gdpr_article: 'Art. 20 - Right to Data Portability',
        profile: profileData.data,
        leads: leadsData.data,
        tasks: tasksData.data,
        activity_logs: activityData.data,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clowd-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log the export
      await supabase.from('consent_logs').insert({
        user_id: profile.user_id,
        consent_type: 'data_export',
        consent_value: true,
        user_agent: navigator.userAgent,
        metadata: { article: 'GDPR Art. 20' },
      });

      toast.success(t('profile.dataExported'));
    } catch (e) {
      toast.error(getErrorMessage(e) || t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!profile?.user_id) return;
    setRequestingDeletion(true);
    try {
      const { error } = await supabase.from('data_deletion_requests').insert({
        user_id: profile.user_id,
        company_id: profile.company_id || null,
      });
      if (error) throw error;

      await supabase.from('consent_logs').insert({
        user_id: profile.user_id,
        consent_type: 'deletion_request',
        consent_value: true,
        user_agent: navigator.userAgent,
        metadata: { article: 'GDPR Art. 17' },
      });

      toast.success(t('profile.deletionRequested'));
    } catch (e) {
      toast.error(getErrorMessage(e) || t('common.error'));
    } finally {
      setRequestingDeletion(false);
    }
  };

  const roleLabels: Record<string, string> = {
    system_admin: t('profile.roleLabels.system_admin'),
    company_admin: t('profile.roleLabels.company_admin'),
    owner: t('profile.roleLabels.owner'),
    manager: t('profile.roleLabels.manager'),
    employee: t('profile.roleLabels.employee'),
    readonly: t('profile.roleLabels.readonly'),
    partner: t('profile.roleLabels.partner'),
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('profile.subtitle')}</p>
      </div>

      {/* Avatar & Info */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> {t('profile.personalInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(profile?.full_name || null, profile?.email || '')}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{profile?.full_name || profile?.email}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('common.name')}</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t('common.email')}</Label>
            <Input value={profile?.email || ''} readOnly className="bg-muted/50" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Shield className="h-3 w-3" /> {t('profile.roles')}
            </Label>
            <div className="flex gap-2 flex-wrap">
              {roles.map(r => (
                <Badge key={r.role} variant="outline">{roleLabels[r.role] || r.role}</Badge>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveName} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> {t('profile.changePassword')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('profile.newPassword')}</Label>
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('profile.newPasswordPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('profile.confirmPassword')}</Label>
            <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('profile.newPasswordPlaceholder')} />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
            {changingPassword ? t('common.saving') : t('profile.updatePassword')}
          </Button>
        </CardContent>
      </Card>

      {/* GDPR & Data Rights */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> {t('profile.gdprTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('profile.gdprIntro')}
          </p>

          {/* Data Export */}
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('profile.exportTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('profile.exportDesc')}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportData} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {t('profile.exportButton')}
            </Button>
          </div>

          {/* Privacy Policy link */}
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('profile.privacyPolicyTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('profile.privacyPolicyDesc')}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href={`/${locale}/privacy`} target="_blank" rel="noopener">
                {t('profile.readButton')}
              </a>
            </Button>
          </div>

          {/* Data Deletion Request */}
          <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <Trash2 className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">{t('profile.deletionTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('profile.deletionDesc')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={requestingDeletion}>
                  {requestingDeletion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  {t('profile.requestButton')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('profile.confirmDeletionTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('profile.confirmDeletionDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRequestDeletion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t('profile.confirmDeleteData')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
