import { useState, useEffect } from 'react';
import { Phone, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function PhonePopup() {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 animate-fade-in">
      <div className="landing-glass rounded-2xl px-5 py-4 shadow-xl flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--success-color)] flex items-center justify-center shrink-0">
          <Phone className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('phone.callUs')}</p>
          <a href="tel:+4553609170" className="text-base font-semibold text-foreground hover:text-primary transition-colors">
            +45 53 60 91 70
          </a>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="ml-2 text-muted-foreground hover:text-foreground"
          aria-label={t('common.close') || 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
