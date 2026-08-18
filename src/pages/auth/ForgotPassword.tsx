import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { isLocale, useI18n } from '@/lib/i18n';
import AuthLayout from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';

export default function ForgotPasswordPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { t } = useI18n();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/auth/reset-password`,
      });
      if (error) throw error;
      setSent(true);
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
          <Link
            to={`/${locale}/auth/login`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> {t('auth.backToLogin')}
          </Link>

          {sent ? (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-semibold mb-2">{t('auth.checkEmail')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.resetEmailSent').replace('{email}', email)}
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold mb-1">{t('auth.forgotPasswordTitle')}</h1>
              <p className="text-sm text-muted-foreground mb-6">
                {t('auth.forgotPasswordDesc')}
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  placeholder={t('auth.emailPlaceholder')}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
