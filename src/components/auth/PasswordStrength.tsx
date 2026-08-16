import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { t } = useI18n();

  const { score, label, color } = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^a-zA-Z0-9]/.test(password)) s++;

    const levels = [
      { label: t('auth.passwordWeak'), color: 'bg-destructive' },
      { label: t('auth.passwordFair'), color: 'bg-orange-500' },
      { label: t('auth.passwordGood'), color: 'bg-yellow-500' },
      { label: t('auth.passwordStrong'), color: 'bg-emerald-500' },
      { label: t('auth.passwordVeryStrong'), color: 'bg-emerald-600' },
    ];
    const idx = Math.min(s, levels.length) - 1;
    const lvl = levels[Math.max(0, idx)];
    return { score: s, label: lvl.label, color: lvl.color };
  }, [password, t]);

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? color : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
