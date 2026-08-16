import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n, SUPPORTED_LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export default function LanguageSelector({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (value: Locale) => void;
}) {
  const { t } = useI18n();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Locale)}>
      <SelectTrigger>
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
