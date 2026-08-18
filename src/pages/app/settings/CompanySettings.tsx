import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Copy, RefreshCw, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { AccountingConnections } from '@/components/settings/AccountingConnections';
import { getErrorMessage } from '@/lib/errors';

export default function CompanySettingsPage() {
  const { t, locale } = useI18n();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  // Admins get the full row via select('*'); non-admins get the narrower
  // get_company_for_user() RPC shape, so the state must tolerate either.
  const [company, setCompany] = useState<Partial<Tables<'companies'>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!user?.company_id) { setLoading(false); return; }
    if (isAdmin) {
      // Admins get full company data including activation_code, stripe fields
      supabase.from('companies').select('*').eq('id', user.company_id).single()
        .then(({ data }) => { setCompany(data); setLoading(false); });
    } else {
      // Non-admins get safe subset via security definer function
      supabase.rpc('get_company_for_user', { _company_id: user.company_id })
        .then(({ data }) => { setCompany(data?.[0] || null); setLoading(false); });
    }
  }, [user?.company_id, isAdmin]);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    const { error } = await supabase.from('companies').update({
      name: company.name, cvr: company.cvr || null, address: company.address || null,
      phone: company.phone || null, email: company.email || null, website: company.website || null,
    }).eq('id', company.id);
    if (error) toast({ title: t('auth.error'), description: error.message });
    else toast({ title: t('common.save') });
    setSaving(false);
  };

  const handleCopyCode = () => {
    if (company?.activation_code) {
      navigator.clipboard.writeText(company.activation_code);
      sonnerToast.success(t('companySettings.codeCopied'));
    }
  };

  const handleRegenerateCode = async () => {
    if (!company?.id) return;
    setRegenerating(true);
    try {
      const { data, error } = await supabase.rpc('regenerate_activation_code', { _company_id: company.id });
      if (error) throw error;
      setCompany({ ...company, activation_code: data });
      sonnerToast.success(t('companySettings.codeRegenerated'));
    } catch (err) {
      sonnerToast.error((getErrorMessage(err) || t('companySettings.codeRegenerateError')));
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  if (!company) return <div className="text-sm text-destructive">{t('companySettings.loadError')}</div>;

  // Setup completeness calculation
  const requiredFields = ['name', 'cvr', 'address', 'phone', 'email', 'website'];
  const filledFields = requiredFields.filter(f => company?.[f] && String(company[f]).trim().length > 0);
  const completionPct = Math.round((filledFields.length / requiredFields.length) * 100);
  const missingFields = requiredFields.filter(f => !company?.[f] || String(company[f]).trim().length === 0);
  const isComplete = missingFields.length === 0;

  const fieldLabels: Record<string, string> = {
    name: t('auth.companyName'),
    cvr: t('companySettings.cvr'),
    address: t('companySettings.address'),
    phone: t('companySettings.phone'),
    email: t('auth.email'),
    website: t('companySettings.website'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.companyTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.companySubtitle')}</p>
      </div>

      {/* Setup Progress Banner */}
      {!isComplete && isAdmin && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  {locale === 'da' ? 'Firmaprofil er ufuldstændig' : locale === 'de' ? 'Firmenprofil ist unvollständig' : 'Company profile is incomplete'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'da'
                    ? 'Udfyld alle felter for at aktivere fakturering og professionel kommunikation.'
                    : locale === 'de'
                    ? 'Füllen Sie alle Felder aus, um Rechnungsstellung und professionelle Kommunikation zu aktivieren.'
                    : 'Complete all fields to enable invoicing and professional communication.'}
                </p>
              </div>
            </div>
            <Progress value={completionPct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {filledFields.length}/{requiredFields.length} — {locale === 'da' ? 'Mangler' : locale === 'de' ? 'Fehlend' : 'Missing'}: {missingFields.map(f => fieldLabels[f]).join(', ')}
            </p>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium">
                {locale === 'da' ? 'Firmaprofil er komplet ✓' : locale === 'de' ? 'Firmenprofil ist vollständig ✓' : 'Company profile is complete ✓'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && <AccountingConnections />}

      {/* Company Code Section - Only for admins/owners */}
      {isAdmin && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {t('companySettings.codeTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('companySettings.codeDesc')}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-muted/50 border border-border rounded-lg px-4 py-3 font-mono text-lg tracking-[0.3em] text-center select-all">
                {company.activation_code || '—'}
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyCode} title={t('companySettings.copyCode')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleRegenerateCode} disabled={regenerating} title={t('companySettings.regenerateCode')}>
                <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('companySettings.codeHint')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Company Info */}
      <Card className="p-6 space-y-4 bg-card/70 backdrop-blur border-border">
        <div className="grid gap-4 md:grid-cols-2">
          <div><div className="text-xs text-muted-foreground mb-1">{t('auth.companyName')}</div><Input value={company.name || ''} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">{t('companySettings.cvr')}</div><Input value={company.cvr || ''} onChange={(e) => setCompany({ ...company, cvr: e.target.value })} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">{t('companySettings.address')}</div><Input value={company.address || ''} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">{t('companySettings.phone')}</div><Input value={company.phone || ''} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">{t('auth.email')}</div><Input value={company.email || ''} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></div>
          <div><div className="text-xs text-muted-foreground mb-1">{t('companySettings.website')}</div><Input value={company.website || ''} onChange={(e) => setCompany({ ...company, website: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1"><div className="text-xs text-muted-foreground mb-1">{t('companySettings.status')}</div><Badge variant={company.status === 'active' ? 'default' : 'secondary'}>{t(`companySettings.status${(company.status || 'setup').replace(/^./, c => c.toUpperCase())}`)}</Badge></div>
          <div className="flex-1"><div className="text-xs text-muted-foreground mb-1">{t('companySettings.mode')}</div><Badge variant="outline">{t(`companySettings.mode${(company.mode || 'setup').replace(/^./, c => c.toUpperCase())}`)}</Badge></div>
        </div>
        {isAdmin && (
          <Button onClick={handleSave} disabled={saving}>{saving ? t('common.loading') : t('settings.updateCta')}</Button>
        )}
      </Card>
    </div>
  );
}
