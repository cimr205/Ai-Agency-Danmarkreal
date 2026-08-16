import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import type { ThemeMode } from '@/lib/tenant';

export default function ThemeSelector({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
}) {
  const { t } = useI18n();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ThemeMode)}>
      <SelectTrigger>
        <SelectValue placeholder={t('theme.label')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">{t('theme.light')}</SelectItem>
        <SelectItem value="dark">{t('theme.dark')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
