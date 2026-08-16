import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { loadLeadfeeder } from '@/lib/analytics';
import type { Json } from '@/integrations/supabase/types';

const COOKIE_KEY = 'cookie-consent';

interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

function logConsent(consent: ConsentState) {
  const types = ['necessary', 'analytics', 'marketing'] as const;
  types.forEach(type => {
    const row = {
      consent_type: `cookie_${type}`,
      consent_value: consent[type],
      user_agent: navigator.userAgent,
      metadata: { all_consent: consent } as unknown as Json,
    };
    supabase.from('consent_logs').insert(row).then(() => {});
  });
}

export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { t, locale } = useI18n();
  const isDa = locale === 'da';

  useEffect(() => {
    const saved = localStorage.getItem(COOKIE_KEY);
    if (!saved) {
      setShow(true);
      return;
    }
    // Returning visitor who previously opted in — honor that choice on this load too.
    try {
      const parsed = JSON.parse(saved) as ConsentState;
      if (parsed.analytics) loadLeadfeeder();
    } catch {
      // ignore malformed stored consent
    }
  }, []);

  const save = (consent: ConsentState) => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(consent));
    logConsent(consent);
    if (consent.analytics) loadLeadfeeder();
    setShow(false);
  };

  const acceptAll = () => {
    save({ necessary: true, analytics: true, marketing: true, timestamp: new Date().toISOString() });
  };

  const acceptSelected = () => {
    save({ necessary: true, analytics, marketing, timestamp: new Date().toISOString() });
  };

  const rejectAll = () => {
    save({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() });
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {t('cookie.message')}
            </p>
            {expanded && (
              <div className="mt-3 space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{isDa ? 'Nødvendige' : 'Necessary'}</p>
                    <p className="text-xs text-muted-foreground">{isDa ? 'Kræves for login og sikkerhed' : 'Required for login and security'}</p>
                  </div>
                  <Switch checked disabled />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{isDa ? 'Analytiske' : 'Analytics'}</p>
                    <p className="text-xs text-muted-foreground">{isDa ? 'Hjælper os med at forbedre platformen' : 'Helps us improve the platform'}</p>
                  </div>
                  <Switch checked={analytics} onCheckedChange={setAnalytics} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{isDa ? 'Marketing' : 'Marketing'}</p>
                    <p className="text-xs text-muted-foreground">{isDa ? 'Personaliserede annoncer og indhold' : 'Personalized ads and content'}</p>
                  </div>
                  <Switch checked={marketing} onCheckedChange={setMarketing} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="link" className="text-xs px-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? (isDa ? 'Skjul detaljer' : 'Hide details') : (isDa ? 'Tilpas cookies' : 'Customize cookies')}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={rejectAll}>{t('cookie.reject')}</Button>
            {expanded && (
              <Button size="sm" variant="outline" onClick={acceptSelected}>
                {isDa ? 'Gem valg' : 'Save choices'}
              </Button>
            )}
            <Button size="sm" onClick={acceptAll}>{t('cookie.accept')}</Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          {isDa
            ? 'Læs vores privatlivspolitik for mere information.'
            : 'Read our privacy policy for more information.'}
          {' '}
          <a href={`/${locale}/privacy`} className="underline hover:text-muted-foreground">{isDa ? 'Privatlivspolitik' : 'Privacy Policy'}</a>
        </p>
      </div>
    </div>
  );
}
