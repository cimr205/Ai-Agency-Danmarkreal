import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { isLocale, useI18n } from '@/lib/i18n';
import AuthLayout from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { loginSchema } from '@/lib/validations';
import { describeAuthError } from '@/lib/authErrors';

export default function LoginPage() {
  const { login, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuth();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { t } = useI18n();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember_me') === 'true');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!authLoading && isAuthenticated) {
    return <Navigate to={`/${locale}/app/dashboard`} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.loginFailed'), description: describeAuthError(err, t) });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.loginFailed'), description: describeAuthError(err, t) });
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 backdrop-blur p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold">{t('auth.loginTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('auth.loginSubtitle')}</p>
          </div>

          {/* Google SSO first */}
          <Button variant="outline" className="w-full gap-3 h-11 mb-6" disabled={loading} onClick={handleGoogle}>
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('auth.loginWithGoogle')}
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t('auth.orContinueWith')}</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <Input placeholder={t('auth.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required aria-invalid={!!errors.email} className="h-11" />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
            <div>
              <Input placeholder={t('auth.password')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} aria-invalid={!!errors.password} className="h-11" />
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={e => { setRememberMe(e.target.checked); localStorage.setItem('remember_me', String(e.target.checked)); }} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">{t('auth.rememberMe')}</span>
              </label>
              <Link to={`/${locale}/auth/forgot-password`} className="text-xs text-primary hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? t('auth.loggingIn') : t('auth.loginCta')}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
            <p>
              {t('auth.noAccount')}{' '}
              <Link to={`/${locale}/auth/signup`} className="text-primary hover:underline font-medium">{t('auth.createAccount')}</Link>
            </p>
            <p>
              {t('auth.haveJoinCode')}{' '}
              <Link to={`/${locale}/auth/join`} className="text-primary hover:underline font-medium">{t('auth.joinHere')}</Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
