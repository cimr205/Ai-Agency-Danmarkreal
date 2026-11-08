/**
 * Onboarding Wizard: company + applicant role + team size + module/seat allocation, then Stripe Checkout.
 */

import { useState } from 'react';
import { Building2, Check, ArrowLeft, ArrowRight, Users, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { invokeFunction } from '@/lib/functions';
import { showError } from '@/lib/showError';
import { CvrLookupField } from '@/components/shared/CvrLookupField';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type BillingMode = 'full_suite' | 'per_module';
type Module = 'crm' | 'hr' | 'marketing' | 'finance';

const MODULE_PRICES_DKK: Record<Module, number> = {
  crm: 299,
  hr: 299,
  marketing: 299,
  finance: 199,
};

const FULL_SUITE_PRICE_DKK = 499;

const COUNTRIES = [
  { value: 'DK', label: 'Danmark' },
  { value: 'SE', label: 'Sverige' },
  { value: 'NO', label: 'Norge' },
  { value: 'DE', label: 'Tyskland' },
  { value: 'GB', label: 'Storbritannien' },
  { value: 'US', label: 'USA' },
  { value: 'OTHER', label: 'Andet' },
];

const TIMEZONES = [
  'Europe/Copenhagen', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Berlin',
  'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC',
];

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONES.includes(tz) ? tz : 'Europe/Copenhagen';
  } catch {
    return 'Europe/Copenhagen';
  }
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const [loading, setLoading] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [cvr, setCvr] = useState('');
  const [country, setCountry] = useState('DK');
  const [timezone, setTimezone] = useState(detectTimezone);
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [role, setRole] = useState('');
  const [teamSize, setTeamSize] = useState('1');
  const [billingMode, setBillingMode] = useState<BillingMode>('full_suite');
  const [moduleSeats, setModuleSeats] = useState<Record<Module, string>>({
    crm: '', hr: '', marketing: '', finance: '',
  });

  const moduleTotal = (Object.entries(moduleSeats) as [Module, string][])
    .reduce((sum, [mod, val]) => sum + (Number(val) || 0) * MODULE_PRICES_DKK[mod], 0);

  const goNext = () => {
    if (step === 1) {
      if (!companyName.trim()) {
        toast({ variant: 'destructive', title: t('wizard.fillCompanyName') });
        return;
      }
      if (!fullName.trim()) {
        toast({ variant: 'destructive', title: t('wizard.fillName') });
        return;
      }
      if (!role) {
        toast({ variant: 'destructive', title: t('wizard.fillRole') });
        return;
      }
    }
    if (step === 2) {
      if (!teamSize || Number(teamSize) < 1) {
        toast({ variant: 'destructive', title: t('wizard.fillTeamSize') });
        return;
      }
    }
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const goBack = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (billingMode === 'per_module') {
      const hasAnySeats = Object.values(moduleSeats).some(v => Number(v) > 0);
      if (!hasAnySeats) {
        toast({ variant: 'destructive', title: t('wizard.fillModuleSeats') });
        return;
      }
    }
    if (!user) return;

    setLoading(true);
    try {
      // Atomic: company creation, profile linking and admin-role grant all
      // happen in one DB transaction (see bootstrap_company migration), so a
      // mid-flight failure can't leave an orphaned company with no owner.
      //
      // `as never` on the function name: bootstrap_company() ships in a
      // migration that is written but NOT YET APPLIED to the project (no
      // production migration without approval) — supabase/types.ts is
      // generated from the live schema, so it doesn't know this RPC yet.
      // Once the migration is applied, re-run `npm run db:types` (or the
      // project's type-gen command) and drop this cast.
      const bootstrapRpc = supabase.rpc.bind(supabase) as unknown as (
        fn: 'bootstrap_company',
        args: Record<string, unknown>
      ) => Promise<{ data: string | null; error: { message: string } | null }>;
      const { data: companyId, error: bootstrapError } = await bootstrapRpc('bootstrap_company', {
        _name: companyName,
        _full_name: fullName,
        _cvr: cvr || null,
        _country: country,
        _timezone: timezone,
        _company_size: companySize || null,
        _industry: industry || null,
        _applicant_role: role,
        _billing_mode: billingMode,
      });

      if (bootstrapError) throw new Error(bootstrapError.message);
      if (!companyId) throw new Error('Could not create company');

      await refreshProfile();

      toast({ title: t('wizard.welcome'), description: t('wizard.companyCreatedFallback').replace('{company}', companyName) });

      const localeMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
      const locale = localeMatch?.[1] ?? 'da';
      const currency = locale === 'en' ? 'usd' : 'dkk';

      const checkoutBody: Record<string, unknown> = { currency, locale, billing_mode: billingMode };
      if (billingMode === 'per_module') {
        checkoutBody.modules = {
          crm: Number(moduleSeats.crm) || 0,
          hr: Number(moduleSeats.hr) || 0,
          marketing: Number(moduleSeats.marketing) || 0,
          finance: Number(moduleSeats.finance) || 0,
        };
      } else {
        checkoutBody.seat_limit = Number(teamSize) || 1;
      }

      const checkout = await invokeFunction<{ url?: string }>('create-checkout', {
        body: checkoutBody,
      });
      if (!checkout?.url) {
        throw new Error('Could not start checkout');
      }
      window.location.href = checkout.url;
    } catch (err) {
      showError(err, { module: 'create-checkout' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              {step === 1 && <Building2 className="w-5 h-5 text-primary" />}
              {step === 2 && <Users className="w-5 h-5 text-primary" />}
              {step === 3 && <LayoutGrid className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <CardTitle className="text-lg">
                {step === 1 && t('wizard.companyTitle')}
                {step === 2 && t('wizard.seatsTitle')}
                {step === 3 && t('wizard.billingModeTitle')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t('wizard.stepOf').replace('{step}', String(step)).replace('{total}', String(totalSteps))}</p>
            </div>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <CardDescription>
            {step === 1 && t('wizard.companyDesc')}
            {step === 2 && t('wizard.seatsDesc')}
            {step === 3 && t('wizard.billingModeDesc')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="full-name">{t('auth.fullName')} *</Label>
                <Input
                  id="full-name"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-name">{t('wizard.companyNameLabel')}</Label>
                <Input
                  id="company-name"
                  placeholder={t('wizard.companyNamePlaceholder')}
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>

              {country === 'DK' && (
                <CvrLookupField
                  onResult={result => {
                    if (result.name && !companyName) setCompanyName(result.name);
                    setCvr(result.cvr);
                  }}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('wizard.countryLabel')}</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('wizard.timezoneLabel')}</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('wizard.companySizeLabel')} <span className="text-muted-foreground font-normal">({t('wizard.optional')})</span></Label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">{t('wizard.industryLabel')} <span className="text-muted-foreground font-normal">({t('wizard.optional')})</span></Label>
                  <Input id="industry" value={industry} onChange={e => setIndustry(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('wizard.roleLabel')}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('wizard.roleSelect')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">{t('wizard.roleOwner')}</SelectItem>
                    <SelectItem value="ceo">{t('wizard.roleCeo')}</SelectItem>
                    <SelectItem value="manager">{t('wizard.roleManager')}</SelectItem>
                    <SelectItem value="other">{t('wizard.roleOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="team-size">{t('wizard.teamSizeLabel')}</Label>
              <Input
                id="team-size"
                type="number"
                min={1}
                value={teamSize}
                onChange={e => setTeamSize(e.target.value)}
              />
            </div>
          )}

          {step === 3 && (
            <>
              <RadioGroup value={billingMode} onValueChange={v => setBillingMode(v as BillingMode)} className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="full_suite" id="mode-full" className="mt-0.5" />
                  <div>
                    <div className="font-medium">{t('wizard.billingModeFullSuite')}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('wizard.billingModeFullSuiteDesc').replace('{price}', String(FULL_SUITE_PRICE_DKK))}
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="per_module" id="mode-module" className="mt-0.5" />
                  <div>
                    <div className="font-medium">{t('wizard.billingModePerModule')}</div>
                    <div className="text-sm text-muted-foreground">{t('wizard.billingModePerModuleDesc')}</div>
                  </div>
                </label>
              </RadioGroup>

              {billingMode === 'per_module' && (
                <div className="space-y-3 pt-2">
                  {(['crm', 'hr', 'marketing', 'finance'] as Module[]).map(mod => (
                    <div key={mod} className="flex items-center justify-between gap-3">
                      <Label htmlFor={`seats-${mod}`} className="flex-1">
                        {t(`wizard.module${mod[0].toUpperCase()}${mod.slice(1)}`)}
                        <span className="text-muted-foreground font-normal"> — {MODULE_PRICES_DKK[mod]} kr.</span>
                      </Label>
                      <Input
                        id={`seats-${mod}`}
                        type="number"
                        min={0}
                        className="w-24"
                        placeholder="0"
                        value={moduleSeats[mod]}
                        onChange={e => setModuleSeats(prev => ({ ...prev, [mod]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-3 border-t text-sm font-medium">
                    <span>{t('wizard.moduleTotalLabel')}</span>
                    <span>{moduleTotal.toLocaleString('da-DK')} kr./md.</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 mt-4">
            {step > 1 && (
              <Button variant="outline" onClick={goBack} disabled={loading}>
                <ArrowLeft className="w-4 h-4 mr-2" /> {t('wizard.back')}
              </Button>
            )}
            {step < totalSteps ? (
              <Button onClick={goNext} className="flex-1">
                {t('wizard.next')} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? t('wizard.creating') : (
                  <><Check className="w-4 h-4 mr-2" /> {t('wizard.startTrial')}</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
