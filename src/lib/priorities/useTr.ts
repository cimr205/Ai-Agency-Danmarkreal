import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import { interpolate, type Tr } from './types';

/** Translation function with {placeholder} support, for priority copy. */
export function useTr(): Tr {
  const { t } = useI18n();
  return useCallback<Tr>((key, vars) => interpolate(t(key), vars), [t]);
}
