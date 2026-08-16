import { useNavigate, useParams } from 'react-router-dom';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { isLocale } from '@/lib/i18n';

export default function Onboarding() {
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  return (
    <OnboardingWizard onComplete={() => navigate(`/${locale}/app/dashboard`)} />
  );
}
