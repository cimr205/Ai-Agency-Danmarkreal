import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { useAuth } from '@/hooks/useAuth';
import { isLocale } from '@/lib/i18n';

// Lazy-load below-the-fold sections
const Features = lazy(() => import('@/components/landing/Features').then(m => ({ default: m.Features })));
const Testimonials = lazy(() => import('@/components/landing/Testimonials').then(m => ({ default: m.Testimonials })));
const Pricing = lazy(() => import('@/components/landing/Pricing').then(m => ({ default: m.Pricing })));
const FAQ = lazy(() => import('@/components/landing/FAQ').then(m => ({ default: m.FAQ })));
const Footer = lazy(() => import('@/components/landing/Footer').then(m => ({ default: m.Footer })));
const CookieConsent = lazy(() => import('@/components/shared/CookieConsent').then(m => ({ default: m.CookieConsent })));
const ContactFormPopup = lazy(() => import('@/components/landing/ContactFormPopup').then(m => ({ default: m.ContactFormPopup })));
const PhonePopup = lazy(() => import('@/components/landing/PhonePopup').then(m => ({ default: m.PhonePopup })));

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  if (!isLoading && isAuthenticated) {
    return <Navigate to={`/${locale}/app/dashboard`} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Suspense fallback={null}>
          <section id="features">
            <Features />
          </section>
          <Testimonials />
          <section id="pricing">
            <Pricing />
          </section>
          <FAQ />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
        <CookieConsent />
        <ContactFormPopup />
        <PhonePopup />
      </Suspense>
    </div>
  );
};

export default Index;