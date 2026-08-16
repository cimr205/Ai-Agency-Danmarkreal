import { useI18n } from '@/lib/i18n';
import { useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import { Users, Building2, FileText, Megaphone, Bot, Calendar, ClipboardList, Mail, ArrowUpRight } from 'lucide-react';

export function Features() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const primary = [
    { icon: Users, titleKey: 'landing.featureCrm', descKey: 'landing.featureCrmDesc', tag: 'CRM' },
    { icon: Bot, titleKey: 'landing.featureAi', descKey: 'landing.featureAiDesc', tag: 'AI' },
  ];
  const secondary = [
    { icon: Building2, titleKey: 'landing.featureHr', descKey: 'landing.featureHrDesc' },
    { icon: FileText, titleKey: 'landing.featureInvoice', descKey: 'landing.featureInvoiceDesc' },
    { icon: Megaphone, titleKey: 'landing.featureMarketing', descKey: 'landing.featureMarketingDesc' },
    { icon: Calendar, titleKey: 'landing.featureCalendar', descKey: 'landing.featureCalendarDesc' },
    { icon: ClipboardList, titleKey: 'landing.featureTasks', descKey: 'landing.featureTasksDesc' },
    { icon: Mail, titleKey: 'landing.featureInbox', descKey: 'landing.featureInboxDesc' },
  ];

  return (
    <section className="relative py-28 md:py-40 overflow-hidden" aria-label="Features">
      {/* Quiet background — no glow blobs */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)/0.07) 1px, transparent 0)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 80% 30%, black 0%, transparent 75%)',
        }}
      />

      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Section marker — editorial */}
        <div className="grid grid-cols-12 gap-x-6 mb-20 lg:mb-28">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3 lg:sticky lg:top-28">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                02 — {isDa ? 'Modulerne' : 'The modules'}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(2rem,4.4vw,3.6rem)] text-foreground tracking-[-0.035em] leading-[0.98] max-w-[820px]">
              {isDa ? (
                <>Otte værktøjer.{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Ét sammenhængende
                  </span>{' '}system<span className="text-primary">.</span>
                </>
              ) : (
                <>Eight tools.{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    One coherent
                  </span>{' '}system<span className="text-primary">.</span>
                </>
              )}
            </h2>
            <p className="mt-6 text-[16px] text-muted-foreground/90 leading-[1.6] max-w-[520px]">
              {isDa
                ? 'Hvert modul er bygget til at tale sammen. Data flyder fra første kontakt til sidste faktura — uden integrationer, uden duplikater, uden brudte arbejdsgange.'
                : 'Every module is built to talk to the others. Data flows from first contact to final invoice — no integrations, no duplicates, no broken workflows.'}
            </p>
          </div>
        </div>

        {/* Two anchor features — large editorial slabs */}
        <div className="grid grid-cols-12 gap-6 lg:gap-8 mb-6">
          {primary.map((f, i) => (
            <article
              key={f.titleKey}
              className={`col-span-12 lg:col-span-6 group relative overflow-hidden rounded-[18px] border border-foreground/[0.07] bg-card transition-all duration-500
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_1px_2px_hsl(222_47%_11%/0.04),0_30px_60px_-30px_hsl(222_47%_11%/0.18)]
                hover:shadow-[0_1px_0_0_hsl(0_0%_100%/0.8)_inset,0_2px_4px_hsl(222_47%_11%/0.06),0_40px_80px_-30px_hsl(222_47%_11%/0.25)]`}
            >
              {/* Top frame */}
              <div className="px-7 pt-7 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase">
                  {String(i + 1).padStart(2, '0')} / {f.tag}
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" strokeWidth={1.5} />
              </div>

              <div className="px-7 pt-10 pb-8">
                <f.icon className="w-7 h-7 text-foreground/85 mb-7" strokeWidth={1.25} />
                <h3 className="font-display text-[26px] lg:text-[30px] font-semibold text-foreground tracking-[-0.025em] leading-[1.05] mb-3">
                  {t(f.titleKey)}
                </h3>
                <p className="text-[14.5px] text-muted-foreground leading-[1.65] max-w-[440px]">
                  {t(f.descKey)}
                </p>
              </div>

              {/* Bottom hairline visual */}
              <div className="h-[88px] border-t border-foreground/[0.06] bg-gradient-to-b from-transparent to-foreground/[0.015] flex items-end px-7 py-4">
                <div className="flex items-end gap-1 w-full h-full">
                  {[35, 52, 41, 68, 55, 78, 62, 88, 71, 95, 80, 90, 76, 92].map((h, j) => (
                    <div
                      key={j}
                      className="flex-1 rounded-[2px] bg-foreground/[0.08] group-hover:bg-primary/40 transition-colors duration-700"
                      style={{ height: `${h}%`, transitionDelay: `${j * 30}ms` }}
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Secondary modules — minimal editorial list, NOT cards */}
        <div className="grid grid-cols-12 gap-x-8 mt-20 lg:mt-28">
          <div className="col-span-12 lg:col-span-3 mb-10 lg:mb-0">
            <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
              {isDa ? 'Også inkluderet' : 'Also included'}
            </span>
            <p className="mt-3 text-[13px] text-muted-foreground/80 leading-[1.55] max-w-[200px]">
              {isDa
                ? 'Seks moduler mere — hver med deres egen dybde, men aldrig isoleret fra resten.'
                : 'Six more modules — each with their own depth, but never isolated from the rest.'}
            </p>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <ul className="divide-y divide-foreground/[0.06] border-y border-foreground/[0.06]">
              {secondary.map((f, i) => (
                <li key={f.titleKey} className="group grid grid-cols-12 gap-4 items-center py-6 lg:py-7 transition-colors hover:bg-foreground/[0.015] -mx-4 px-4 rounded-[6px]">
                  <div className="col-span-1 font-mono text-[10.5px] text-muted-foreground/60 tracking-wider">
                    {String(i + 3).padStart(2, '0')}
                  </div>
                  <div className="col-span-1">
                    <f.icon className="w-[18px] h-[18px] text-foreground/70 group-hover:text-primary transition-colors" strokeWidth={1.5} />
                  </div>
                  <div className="col-span-10 lg:col-span-4">
                    <h4 className="font-display text-[15.5px] font-semibold text-foreground tracking-[-0.01em]">
                      {t(f.titleKey)}
                    </h4>
                  </div>
                  <div className="col-span-12 lg:col-span-6 lg:pl-4 lg:border-l lg:border-foreground/[0.06]">
                    <p className="text-[13.5px] text-muted-foreground leading-[1.55]">{t(f.descKey)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
