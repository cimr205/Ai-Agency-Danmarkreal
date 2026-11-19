import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { isLocale, useI18n } from '@/lib/i18n';
import AuthLayout from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { Lock, AlertTriangle } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { resetPasswordSchema } from '@/lib/validations';
import { describeValidationError } from '@/lib/validationErrors';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';

type LinkState = 'checking' | 'valid' | 'invalid';

export default function ResetPasswordPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { t } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkState, setLinkState] = useState<LinkState>('checking');

  // The recovery link sets a session via the URL hash/PASSWORD_RECOVERY
  // event. Without a session, updateUser() would silently fail (or act on
  // whatever account happens to already be logged in) — so gate the form on
  // a session actually being established first.
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) setLinkState('valid');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) setLinkState('valid');
    });

    const timeout = setTimeout(() => {
      if (!cancelled) setLinkState(current => (current === 'checking' ? 'invalid' : current));
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = resetPasswordSchema.safeParse({ password, confirmPassword: confirm });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = describeValidationError(err.message, t);
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: t('auth.passwordUpdated'), description: t('auth.passwordUpdatedDesc') });
      navigate(`/${locale}/auth/login`);
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.error'), description: getErrorMessage(err) || t('auth.unknownError') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 backdrop-blur p-8">
          {linkState === 'invalid' ? (
            <div className="text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="text-xl font-semibold mb-2">{t('auth.resetLinkInvalidTitle')}</h1>
              <p className="text-sm text-muted-foreground mb-6">{t('auth.resetLinkInvalidDesc')}</p>
              <Button asChild className="w-full">
                <Link to={`/${locale}/auth/forgot-password`}>{t('auth.sendResetLink')}</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="rounded-full bg-primary/10 p-2.5">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">{t('auth.newPassword')}</h1>
                  <p className="text-xs text-muted-foreground">{t('auth.newPasswordDesc')}</p>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <PasswordInput placeholder={t('auth.newPasswordPlaceholder')} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} aria-invalid={!!errors.password} />
                  <PasswordStrength password={password} />
                  {errors.password ? (
                    <p className="text-xs text-destructive mt-1">{errors.password}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">{t('auth.passwordRequirements')}</p>
                  )}
                </div>
                <div>
                  <PasswordInput placeholder={t('auth.confirmPassword')} value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} aria-invalid={!!errors.confirmPassword} />
                  {errors.confirmPassword && <p className="text-xs text-destructive mt-1">{errors.confirmPassword}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading || linkState === 'checking'}>
                  {loading ? t('auth.updatingPassword') : t('auth.updatePassword')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
