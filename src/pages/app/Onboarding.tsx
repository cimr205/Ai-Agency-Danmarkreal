import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { isLocale } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';

export default function Onboarding() {
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { profile } = useAuth();

  // The wizard's own submit flow redirects to Stripe Checkout rather than
  // calling onComplete directly, and Checkout's success/cancel URLs land
  // back here — without this guard a user who already has a company sees
  // a blank "create your company" form again instead of their workspace.
  if (profile?.company_id) {
    return <Navigate to={`/${locale}/app/dashboard`} replace />;
  }

  return (
    <OnboardingWizard onComplete={() => navigate(`/${locale}/app/dashboard`)} />
  );
}
