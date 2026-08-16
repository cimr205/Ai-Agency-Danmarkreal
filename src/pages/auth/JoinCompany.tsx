import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isLocale, useI18n } from '@/lib/i18n';
import AuthLayout from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';

export default function JoinCompanyPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { t } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<'code' | 'signup' | 'done'>('code');
  const [companyCode, setCompanyCode] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkPendingJoin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const pendingCode = localStorage.getItem('pending_company_code');
      if (!pendingCode) return;

      try {
        const { data, error } = await supabase.rpc('join_company_by_code', { _code: pendingCode });
        if (error) throw error;
        localStorage.removeItem('pending_company_code');
        localStorage.removeItem('pending_company_id');
        toast({ title: t('auth.joined'), description: t('auth.joinedDesc') });
        navigate(`/${locale}/app/dashboard`, { replace: true });
      } catch {
        localStorage.removeItem('pending_company_code');
        localStorage.removeItem('pending_company_id');
      }
    };
    checkPendingJoin();
  }, []);

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('validate_activation_code', { _code: companyCode.trim() });
      if (error) throw error;
      if (!data) {
        toast({ variant: 'destructive', title: t('auth.invalidCode'), description: t('auth.invalidCodeDesc') });
        setLoading(false);
        return;
      }

      const { data: company } = await supabase.from('companies').select('name').eq('id', data).single();
      setCompanyId(data as string);
      setCompanyName(company?.name || t('auth.unknownCompany'));

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error: joinError } = await supabase.rpc('join_company_by_code', { _code: companyCode.trim() });
        if (joinError) throw joinError;
        toast({ title: t('auth.joined'), description: t('auth.joinedDesc') });
        navigate(`/${locale}/app/dashboard`, { replace: true });
        return;
      }

      setStep('signup');
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.error'), description: err instanceof Error ? err.message : t('auth.unknownError') });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('auth.passwordsNoMatch') });
      return;
    }
    setLoading(true);
    try {
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signupError) throw signupError;

      if (companyId) {
        localStorage.setItem('pending_company_code', companyCode.trim());
        localStorage.setItem('pending_company_id', companyId);
      }

      setStep('done');
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.error'), description: err instanceof Error ? err.message : t('auth.unknownError') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 backdrop-blur p-8">
          <Link
            to={`/${locale}/auth/login`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('auth.backToLogin')}
          </Link>

          {step === 'code' && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="rounded-full bg-primary/10 p-2.5">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">{t('auth.joinCompanyTitle')}</h1>
                  <p className="text-xs text-muted-foreground">{t('auth.joinCompanySubtitle')}</p>
                </div>
              </div>

              <form onSubmit={handleValidateCode} className="space-y-4">
                <Input
                  placeholder={t('auth.joinCompanyCodePlaceholder')}
                  value={companyCode}
                  onChange={e => setCompanyCode(e.target.value.toUpperCase())}
                  required
                  maxLength={20}
                  className="text-center font-mono text-lg tracking-wider"
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('auth.validating') : t('auth.validateCode')}
                </Button>
              </form>
            </>
          )}

          {step === 'signup' && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold">{t('auth.createEmployeeAccount')}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('auth.joiningCompany')} <span className="font-medium text-foreground">{companyName}</span>
                </p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                <Input placeholder={t('auth.fullName')} value={fullName} onChange={e => setFullName(e.target.value)} required />
                <Input placeholder={t('auth.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder={t('auth.password')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                <Input placeholder={t('auth.confirmPassword')} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('auth.creatingAccount') : t('auth.signupCta')}
                </Button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-500/10 p-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-semibold">{t('auth.accountCreatedDone')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('auth.confirmEmailJoin').replace('{company}', companyName)}
              </p>
              <Button variant="outline" onClick={() => navigate(`/${locale}/auth/login`)}>
                {t('auth.goToLogin')}
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              <p>
                {t('auth.haveAccount')}{' '}
                <Link to={`/${locale}/auth/login`} className="text-primary hover:underline font-medium">{t('auth.signIn')}</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
