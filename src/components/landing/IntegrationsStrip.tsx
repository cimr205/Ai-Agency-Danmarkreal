import { useI18n } from '@/lib/i18n';
import { ScrollReveal } from './ScrollReveal';

const PARTNERS = ['Google Workspace', 'Gmail', 'Meta Ads', 'Stripe', 'Twilio'];

export function IntegrationsStrip() {
  const { t } = useI18n();

  return (
    <section className="relative py-10 border-y border-foreground/[0.06]" aria-label={t('landing.integrationsLabel')}>
      <ScrollReveal y={8} duration={0.5} className="max-w-[1340px] mx-auto px-5 lg:px-10 flex flex-wrap items-center gap-x-10 gap-y-3">
        <span className="font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground/60 uppercase shrink-0">
          {t('landing.integrationsLabel')}
        </span>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          {PARTNERS.map((p) => (
            <span key={p} className="text-[13.5px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors">
              {p}
            </span>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
