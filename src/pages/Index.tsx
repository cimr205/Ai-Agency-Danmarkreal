import { lazy, Suspense, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { useAuth } from '@/hooks/useAuth';
import { isLocale } from '@/lib/i18n';
import { takePostLoginRedirect } from '@/lib/postLoginRedirect';

// Lazy-load below-the-fold sections
const Features = lazy(() => import('@/components/landing/Features').then(m => ({ default: m.Features })));
const Testimonials = lazy(() => import('@/components/landing/Testimonials').then(m => ({ default: m.Testimonials })));
const Pricing = lazy(() => import('@/components/landing/Pricing').then(m => ({ default: m.Pricing })));
const FAQ = lazy(() => import('@/components/landing/FAQ').then(m => ({ default: m.FAQ })));
const Footer = lazy(() => import('@/components/landing/Footer').then(m => ({ default: m.Footer })));
const ContactFormPopup = lazy(() => import('@/components/landing/ContactFormPopup').then(m => ({ default: m.ContactFormPopup })));
const PhonePopup = lazy(() => import('@/components/landing/PhonePopup').then(m => ({ default: m.PhonePopup })));

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  // Supabase may return a Google sign-in to the site root; finish it on the
  // page the user originally asked for (read once per mount).
  const [target] = useState(() => takePostLoginRedirect(`/${locale}/app/dashboard`));

  if (!isLoading && isAuthenticated) {
    return <Navigate to={target} replace />;
  }

  return (
    <div className="light min-h-screen bg-background text-foreground">
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
        <ContactFormPopup />
        <PhonePopup />
      </Suspense>
    </div>
  );
};

export default Index;
