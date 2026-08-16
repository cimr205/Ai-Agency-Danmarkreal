import { useI18n, isLocale } from '@/lib/i18n';
import { useParams } from 'react-router-dom';

export function Testimonials() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const quotes = [
    { name: 'Martin K.', role: t('landing.test1role'), text: t('landing.test1text'), accent: 'hsl(221 83% 53%)' },
    { name: 'Louise H.', role: t('landing.test2role'), text: t('landing.test2text'), accent: 'hsl(258 90% 66%)' },
    { name: 'Anders P.', role: t('landing.test3role'), text: t('landing.test3text'), accent: 'hsl(160 84% 39%)' },
  ];

  // Featured pull quote = first
  const [feature, ...rest] = quotes;

  return (
    <section id="testimonials" className="relative py-28 md:py-40 overflow-hidden" aria-label="Testimonials">
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial marker */}
        <div className="grid grid-cols-12 gap-6 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                03 — {isDa ? 'Stemmer' : 'Voices'}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.02] max-w-[680px]">
              {isDa ? (
                <>Hvad teams siger, når de{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    rykker hertil
                  </span>.
                </>
              ) : (
                <>What teams say once they{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    move in
                  </span>.
                </>
              )}
            </h2>
          </div>
        </div>

        {/* Featured pull quote — editorial, oversized */}
        <div className="grid grid-cols-12 gap-6 lg:gap-10 mb-20 lg:mb-28">
          <div className="col-span-12 lg:col-span-2 lg:pt-3">
            <span
              className="block font-display text-[120px] leading-[0.7] text-foreground/10 select-none"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              "
            </span>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <blockquote
              className="font-display text-[clamp(1.6rem,2.6vw,2.3rem)] text-foreground/90 tracking-[-0.02em] leading-[1.25] font-medium"
            >
              {feature.text}
            </blockquote>
            <div className="mt-10 flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-display font-semibold text-white shadow-sm"
                style={{ backgroundColor: feature.accent }}
              >
                {feature.name[0]}
              </div>
              <div className="flex flex-col">
                <span className="text-[13.5px] font-display font-semibold text-foreground tracking-[-0.005em]">{feature.name}</span>
                <span className="text-[12px] text-muted-foreground font-mono">{feature.role}</span>
              </div>
              <div className="hidden lg:flex items-center gap-2 ml-6 pl-6 border-l border-foreground/[0.08]">
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
                  {isDa ? 'Verificeret kunde' : 'Verified customer'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Two supporting voices — split, asymmetric, no card frames */}
        <div className="grid grid-cols-12 gap-6 lg:gap-12 border-t border-foreground/[0.06] pt-14 lg:pt-20">
          {rest.map((q, i) => (
            <div
              key={q.name}
              className={`col-span-12 lg:col-span-6 ${i === 1 ? 'lg:pl-8 lg:border-l lg:border-foreground/[0.06]' : ''}`}
            >
              <div className="flex items-start gap-3 mb-5">
                <span className="font-mono text-[10px] text-muted-foreground/60 tracking-[0.18em] uppercase mt-1">
                  0{i + 2}
                </span>
                <div
                  className="h-3 w-3 rounded-full mt-1"
                  style={{ backgroundColor: q.accent, boxShadow: `0 0 0 4px ${q.accent}1a` }}
                />
              </div>
              <p className="text-[16px] text-foreground/80 leading-[1.6] font-medium mb-6 max-w-[460px]">
                {q.text}
              </p>
              <div className="flex items-center gap-3 pt-5 border-t border-foreground/[0.06] max-w-[460px]">
                <span className="text-[13px] font-display font-semibold text-foreground">{q.name}</span>
                <span className="w-1 h-1 rounded-full bg-foreground/20" />
                <span className="text-[12px] text-muted-foreground font-mono">{q.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
