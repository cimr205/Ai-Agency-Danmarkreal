import { useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';

export function Testimonials() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const pillars = isDa
    ? [
        {
          n: '01',
          head: 'Én tydelig indgang',
          body: 'Start med de samme kerneværktøjer fra første login, og find pris og prøveperiode samlet ét sted.',
        },
        {
          n: '02',
          head: 'Bygget og registreret i Danmark',
          body: 'CVR 45949923. Virksomhedsoplysninger, privatlivspolitik, vilkår og databehandleraftale er tilgængelige direkte på siden.',
        },
        {
          n: '03',
          head: 'Arbejdet samlet',
          body: 'CRM, HR, fakturering, marketing og AI er organiseret i den samme arbejdsflade, så de vigtigste funktioner ikke starter i hver sin app.',
        },
      ]
    : [
        {
          n: '01',
          head: 'One clear starting point',
          body: 'Start with the same core tools from the first login, with pricing and the trial explained in one place.',
        },
        {
          n: '02',
          head: 'Built and registered in Denmark',
          body: 'CVR 45949923. Company details, privacy policy, terms and the data processing agreement are available directly on the site.',
        },
        {
          n: '03',
          head: 'Work brought together',
          body: 'CRM, HR, invoicing, marketing and AI are organised in the same workspace, so core tasks do not start in separate apps.',
        },
      ];

  return (
    <section
      id="testimonials"
      className="relative py-28 md:py-40 overflow-hidden"
      aria-label={isDa ? 'Om AI Agency Danmark' : 'About AI Agency Danmark'}
    >
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial marker */}
        <div className="grid grid-cols-12 gap-6 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                03 — {isDa ? 'Grundlaget' : 'Foundation'}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.02] max-w-[680px]">
              {isDa ? (
                <>
                  Tre ting der{' '}
                  <span
                    className="italic font-normal text-foreground/75"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                  >
                    faktisk
                  </span>{' '}
                  gælder.
                </>
              ) : (
                <>
                  Three things that{' '}
                  <span
                    className="italic font-normal text-foreground/75"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                  >
                    actually
                  </span>{' '}
                  hold.
                </>
              )}
            </h2>
            <p className="mt-5 text-[15px] text-muted-foreground/80 leading-[1.6] max-w-[480px]">
              {isDa
                ? 'Ingen runde tal eller anonyme citater. Her er de konkrete rammer for platformen.'
                : 'No rounded numbers or anonymous quotes. These are the concrete terms of the platform.'}
            </p>
          </div>
        </div>

        {/* Three pillars — editorial row */}
        <div className="grid grid-cols-12 gap-6 lg:gap-10 border-t border-foreground/[0.07] pt-14 lg:pt-20">
          {pillars.map((p, i) => (
            <div
              key={p.n}
              className={`col-span-12 lg:col-span-4 ${i > 0 ? 'lg:pl-8 lg:border-l lg:border-foreground/[0.07]' : ''}`}
            >
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/60 uppercase block mb-6">
                {p.n}
              </span>
              <h3 className="font-display text-[20px] lg:text-[22px] font-semibold text-foreground tracking-[-0.02em] leading-[1.15] mb-4">
                {p.head}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-[1.65]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
