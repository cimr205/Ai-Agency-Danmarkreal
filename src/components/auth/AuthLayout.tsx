import { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import LanguagePicker from '@/components/LanguagePicker';
import { BrandWordmark } from '@/components/brand/BrandMark';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute top-4 left-4 z-10">
        <Link to={`/${locale}`} className="block border border-border bg-card px-3 py-2">
          <BrandWordmark />
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <LanguagePicker />
      </div>
      {children}
    </div>
  );
}
