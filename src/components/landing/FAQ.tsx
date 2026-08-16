import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useI18n, isLocale } from '@/lib/i18n';
import { useParams } from 'react-router-dom';

export function FAQ() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const faqs = [
    { q: t('landing.faq1q'), a: t('landing.faq1a') },
    { q: t('landing.faq2q'), a: t('landing.faq2a') },
    { q: t('landing.faq3q'), a: t('landing.faq3a') },
    { q: t('landing.faq4q'), a: t('landing.faq4a') },
    { q: t('landing.faq5q'), a: t('landing.faq5a') },
  ];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28 md:py-40 overflow-hidden" aria-label="FAQ">
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        <div className="grid grid-cols-12 gap-6 lg:gap-10">
          {/* Left sticky editorial column */}
          <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-28 lg:self-start mb-12 lg:mb-0">
            <div className="flex items-center gap-3 mb-8">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                05 — FAQ
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
            <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.8rem)] text-foreground tracking-[-0.03em] leading-[1.02] mb-6">
              {isDa ? (
                <>Spørgsmål, vi{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    faktisk
                  </span>{' '}får.
                </>
              ) : (
                <>Questions we{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    actually
                  </span>{' '}get.
                </>
              )}
            </h2>
            <p className="text-[14px] text-muted-foreground leading-[1.6] max-w-[300px]">
              {isDa
                ? 'Stadig i tvivl? Skriv til os — vi svarer typisk indenfor en time i hverdage.'
                : 'Still unsure? Write us — we usually answer within an hour on weekdays.'}
            </p>
          </div>

          {/* Right — accordion list, hairline rules, no boxes */}
          <div className="col-span-12 lg:col-span-8">
            <ul className="border-t border-foreground/[0.08]">
              {faqs.map((faq, i) => {
                const isOpen = open === i;
                return (
                  <li key={i} className="border-b border-foreground/[0.08]">
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="w-full flex items-start justify-between gap-6 py-7 text-left group"
                    >
                      <div className="flex items-start gap-5 flex-1">
                        <span className="font-mono text-[11px] text-muted-foreground/60 tracking-[0.15em] mt-1.5">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="font-display text-[16px] lg:text-[18px] text-foreground font-medium tracking-[-0.015em] leading-[1.35] group-hover:text-primary transition-colors">
                          {faq.q}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 w-7 h-7 rounded-full border border-foreground/15 flex items-center justify-center transition-all duration-300 ${
                          isOpen ? 'rotate-45 bg-foreground border-foreground' : ''
                        }`}
                      >
                        <Plus className={`w-3.5 h-3.5 transition-colors ${isOpen ? 'text-background' : 'text-foreground/70'}`} strokeWidth={2} />
                      </span>
                    </button>
                    <div
                      className={`grid transition-all duration-400 ease-out ${
                        isOpen ? 'grid-rows-[1fr] opacity-100 pb-7' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="pl-12 pr-12 text-[14.5px] text-muted-foreground leading-[1.65] max-w-[620px]">
                          {faq.a}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
