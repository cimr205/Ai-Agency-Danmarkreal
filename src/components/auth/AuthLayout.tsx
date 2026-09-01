import { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import LanguagePicker from '@/components/LanguagePicker';
import logo from '@/assets/logo.png';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, var(--bg-base) 0%, var(--bg-surface) 50%, var(--bg-base) 100%)' }}>
      <div className="absolute top-4 left-4 z-10">
        <Link to={`/${locale}`}>
          <img src={logo} alt="AI Agency Danmark" className="h-10 w-auto" />
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <LanguagePicker />
      </div>
      {children}
    </div>
  );
}
