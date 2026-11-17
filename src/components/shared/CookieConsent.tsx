import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { loadGA4, loadLeadfeeder, withdrawAnalytics } from '@/lib/analytics';
import type { Json } from '@/integrations/supabase/types';
import { CONSENT_ID_KEY, CONSENT_VERSION, COOKIE_KEY, OPEN_COOKIE_SETTINGS, readStoredConsent, type ConsentState } from '@/lib/consent';

type ConsentAction = 'accept_all' | 'reject_all' | 'custom';

/** A random, non-identifying id that ties the logged choices of one browser together as proof of consent. */
function consentId(): string {
  try {
    let id = localStorage.getItem(CONSENT_ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CONSENT_ID_KEY, id); }
    return id;
  } catch {
    return 'unavailable';
  }
}

async function logConsent(consent: ConsentState, action: ConsentAction, previous: ConsentState | null) {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null; // RLS only accepts the caller's own id or null
    const rows = (['necessary', 'analytics', 'marketing'] as const).map((type) => ({
      consent_type: `cookie_${type}`,
      consent_value: consent[type],
      user_id: userId,
      anonymous_id: consentId(),
      user_agent: navigator.userAgent,
      metadata: {
        version: CONSENT_VERSION, action, path: window.location.pathname,
        withdrawal: !!previous && ((previous.analytics && !consent.analytics) || (previous.marketing && !consent.marketing)),
        all_consent: consent,
      } as unknown as Json,
    }));
    const { error } = await supabase.from('consent_logs').insert(rows);
    if (error) console.warn('[consent] log not stored:', error.message);
  } catch (e) {
    console.warn('[consent] log not stored:', (e as Error).message);
  }
}

function startTrackers(consent: ConsentState) {
  if (!consent.analytics) return;
  loadLeadfeeder();
  loadGA4({ marketing: consent.marketing });
}

export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { t, locale } = useI18n();

  useEffect(() => {
    const stored = readStoredConsent();
    if (!stored) setShow(true);
    else startTrackers(stored); // returning visitor: honour the earlier choice

    const openSettings = () => {
      const current = readStoredConsent();
      setAnalytics(!!current?.analytics);
      setMarketing(!!current?.marketing);
      setExpanded(true);
      setShow(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, openSettings);
  }, []);

  const save = (choice: { analytics: boolean; marketing: boolean }, action: ConsentAction) => {
    const previous = readStoredConsent();
    const consent: ConsentState = { necessary: true, ...choice, timestamp: new Date().toISOString(), version: CONSENT_VERSION };
    try { localStorage.setItem(COOKIE_KEY, JSON.stringify(consent)); } catch { /* private mode: choice lasts this page only */ }
    void logConsent(consent, action, previous);
    setShow(false);
    if (consent.analytics) {
      startTrackers(consent);
      return;
    }
    // Rejected or withdrawn: stop GA4 now; if any tracker already ran, reload so none keeps running.
    if (withdrawAnalytics()) window.location.reload();
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4" role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p id="cookie-consent-title" className="text-sm font-medium">{t('cookie.title')}</p>
            <p className="text-sm text-muted-foreground">{t('cookie.message')}</p>
            {expanded && (
              <div className="mt-3 space-y-3 border-t pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t('cookie.necessary')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.necessaryDesc')}</p>
                  </div>
                  <Switch checked disabled aria-label={t('cookie.necessary')} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t('cookie.analytics')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.analyticsDesc')}</p>
                  </div>
                  <Switch checked={analytics} onCheckedChange={setAnalytics} aria-label={t('cookie.analytics')} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t('cookie.marketing')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.marketingDesc')}</p>
                  </div>
                  <Switch checked={marketing} onCheckedChange={setMarketing} aria-label={t('cookie.marketing')} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="link" className="text-xs px-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? t('cookie.hideDetails') : t('cookie.customize')}
          </Button>
          <div className="flex flex-wrap gap-2">
            {/* Reject and accept have equal weight: same size, same style, one click each. */}
            <Button size="sm" variant="outline" onClick={() => save({ analytics: false, marketing: false }, 'reject_all')}>{t('cookie.reject')}</Button>
            {expanded && (
              <Button size="sm" variant="outline" onClick={() => save({ analytics, marketing }, 'custom')}>{t('cookie.save')}</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => save({ analytics: true, marketing: true }, 'accept_all')}>{t('cookie.accept')}</Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/80">
          {t('cookie.policyHint')}{' '}
          <a href={`/${locale}/privacy`} className="underline hover:text-muted-foreground">{t('cookie.policyLink')}</a>
        </p>
      </div>
    </div>
  );
}
