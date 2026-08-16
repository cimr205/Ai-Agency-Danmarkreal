import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n, SUPPORTED_LOCALES } from '@/lib/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LanguagePicker() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (value: string) => {
    const parts = location.pathname.split('/');
    parts[1] = value;
    navigate(parts.join('/') + location.search, { replace: true });
  };

  return (
    <Select value={locale} onValueChange={handleChange}>
      <SelectTrigger className="w-32 border-none bg-transparent text-muted-foreground text-[13px] hover:text-foreground shadow-none h-8">
        <SelectValue placeholder={t('language.label')} />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {t(`language.${code}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
