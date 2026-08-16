import { Navigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';

export default function RegisterCompanyPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  return <Navigate to={`/${locale}/auth/signup`} replace />;
}
