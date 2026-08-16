import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { isLocale, useI18n } from '@/lib/i18n';
import AuthLayout from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { t } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('auth.passwordsNoMatch') });
      return;
    }
    if (password.length < 8) {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('auth.passwordMinLength') });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: t('auth.passwordUpdated'), description: t('auth.passwordUpdatedDesc') });
      navigate(`/${locale}/auth/login`);
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
            <Input placeholder={t('auth.newPasswordPlaceholder')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            <Input placeholder={t('auth.confirmPassword')} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('auth.updatingPassword') : t('auth.updatePassword')}
            </Button>
          </form>
        </div>
      </div>
    </AuthLayout>
  );
}
