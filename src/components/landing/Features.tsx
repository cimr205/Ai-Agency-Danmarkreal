import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScroll, useTransform, useInView, motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { Users, Building2, FileText, Megaphone, Bot, Calendar, ClipboardList, Mail, ArrowUpRight, Scan, Volume2, VolumeX } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { explodeFromProgress } from './clusterMath';
import type { ModuleSpec } from './ModuleCluster3D';

// three.js + drei is ~240 KB gzip. Load it only on desktop, and only once the
// cluster is about to scroll into view — mobile never downloads it.
const ModuleCluster3D = lazy(() => import('./ModuleCluster3D'));
const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

/** Static stand-in: shown on mobile and while the 3D chunk loads. */
function ClusterFallback({ modules, mergedLabel }: { modules: ModuleSpec[]; mergedLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-5" aria-hidden>
      <div className="grid grid-cols-4 gap-2.5">
        {modules.map((m) => (
          <span
            key={m.label}
            className="h-11 w-11 rounded-[10px] border"
            style={{ background: `${m.color}2e`, borderColor: `${m.color}66` }}
          />
        ))}
      </div>
      <span className="whitespace-nowrap rounded-full bg-foreground text-background px-3 py-1 text-[11px] font-semibold">
        {mergedLabel}
      </span>
    </div>
  );
}
import { playTick } from './clickSound';

export function Features() {
  const { t, locale } = useI18n();
  const clusterSectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: clusterSectionRef,
    offset: ['start end', 'end start'],
  });
  const toolCount = useTransform(scrollYProgress, (v) => String(Math.round(1 + explodeFromProgress(v) * 7)).padStart(2, '0'));
  const [blueprint, setBlueprint] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const isDesktop = useIsDesktop();
  // Mount once it is within ~one screen; after that keep it mounted and just
  // pause the render loop while it is offscreen.
  const nearView = useInView(clusterSectionRef, { once: true, margin: '800px 0px' });
  const inView = useInView(clusterSectionRef, { margin: '100px 0px' });

  const primary = [
    { icon: Users, titleKey: 'landing.featureCrm', descKey: 'landing.featureCrmDesc', tag: 'CRM', color: '#2FA87A' },
    { icon: Bot, titleKey: 'landing.featureAi', descKey: 'landing.featureAiDesc', tag: 'AI', color: '#C9E23B' },
  ];
  const secondary = [
    { icon: Building2, titleKey: 'landing.featureHr', descKey: 'landing.featureHrDesc', color: '#E0A526' },
    { icon: FileText, titleKey: 'landing.featureInvoice', descKey: 'landing.featureInvoiceDesc', color: '#3B6FE2' },
    { icon: Megaphone, titleKey: 'landing.featureMarketing', descKey: 'landing.featureMarketingDesc', color: '#E2583B' },
    { icon: Calendar, titleKey: 'landing.featureCalendar', descKey: 'landing.featureCalendarDesc', color: '#8B5CE2' },
    { icon: ClipboardList, titleKey: 'landing.featureTasks', descKey: 'landing.featureTasksDesc', color: '#2BC4C9' },
    { icon: Mail, titleKey: 'landing.featureInbox', descKey: 'landing.featureInboxDesc', color: '#D43F8D' },
  ];

  const clusterModules = [...primary, ...secondary].map((f) => ({ label: t(f.titleKey), color: f.color }));

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
                {t('landing.sectionModulesLabel')}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(2rem,4.4vw,3.6rem)] text-foreground tracking-[-0.035em] leading-[0.98] max-w-[820px]">
              {t('landing.featuresHeadlinePre')}{' '}
              <span className="text-primary">{t('landing.featuresHeadlineItalic')}</span>{' '}
              {t('landing.featuresHeadlineSystem')}<span className="text-primary">.</span>
            </h2>
            <p className="mt-6 text-[16px] text-muted-foreground/90 leading-[1.6] max-w-[520px]">
              {t('landing.featuresSubtitle')}
            </p>
          </div>
        </div>

        {/* Scroll-driven moment — the 8 modules fly apart, then merge into
            one block, as you scroll past. Object + verb: scroll explodes it. */}
        <div ref={clusterSectionRef} className="hidden lg:block relative h-[520px] -mt-4 mb-16">
          <div className="absolute top-0 right-0 z-10 flex items-center gap-4">
            <span className="font-mono text-[11px] text-muted-foreground/60 tabular-nums">
              <motion.span>{toolCount}</motion.span> / 08
            </span>
            <button
              type="button"
              onClick={() => setBlueprint((v) => !v)}
              aria-pressed={blueprint}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                blueprint ? 'border-foreground bg-foreground text-background' : 'border-foreground/15 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Scan className="w-3 h-3" strokeWidth={1.75} />
              {t('landing.clusterBlueprintToggle')}
            </button>
            <button
              type="button"
              onClick={() => setSoundOn((v) => !v)}
              aria-pressed={soundOn}
              aria-label={t('landing.clusterSoundToggle')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-foreground/15 text-muted-foreground hover:text-foreground transition-colors"
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5" strokeWidth={1.75} /> : <VolumeX className="w-3.5 h-3.5" strokeWidth={1.75} />}
            </button>
          </div>
          {isDesktop && nearView ? (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <ClusterFallback modules={clusterModules} mergedLabel={t('landing.clusterMergedLabel')} />
                </div>
              }
            >
              <ModuleCluster3D
                modules={clusterModules}
                mergedLabel={t('landing.clusterMergedLabel')}
                progress={scrollYProgress}
                blueprint={blueprint}
                active={inView}
                onTick={soundOn ? playTick : undefined}
                className="w-full h-full"
              />
            </Suspense>
          ) : null}
        </div>

        <div className="lg:hidden -mt-6 mb-14">
          <ClusterFallback modules={clusterModules} mergedLabel={t('landing.clusterMergedLabel')} />
        </div>

        {/* Two anchor features — large editorial slabs */}
        <div className="grid grid-cols-12 gap-6 lg:gap-8 mb-6">
          {primary.map((f, i) => (
            <ScrollReveal key={f.titleKey} delay={i * 0.1} className="col-span-12 lg:col-span-6">
            <article
              className="group relative overflow-hidden rounded-[18px] border border-foreground/[0.07] bg-card transition-all duration-500
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_1px_2px_hsl(222_47%_11%/0.04),0_30px_60px_-30px_hsl(222_47%_11%/0.18)]
                hover:shadow-[0_1px_0_0_hsl(0_0%_100%/0.8)_inset,0_2px_4px_hsl(222_47%_11%/0.06),0_40px_80px_-30px_hsl(222_47%_11%/0.25)]"
            >
              {/* Lights up on hover — tinted with the module's own color */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(70% 60% at 85% -10%, ${f.color}1f 0%, transparent 70%)` }}
              />

              {/* Top frame */}
              <div className="relative px-7 pt-7 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase">
                  {String(i + 1).padStart(2, '0')} / {f.tag}
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" strokeWidth={1.5} />
              </div>

              <div className="relative px-7 pt-10 pb-8">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-[12px] mb-7 transition-colors duration-500 bg-foreground/[0.04] group-hover:bg-[var(--icon-tint)]"
                  style={{ ['--icon-tint' as string]: `${f.color}1f` }}
                >
                  <f.icon className="w-6 h-6 text-foreground/85 transition-colors duration-500" strokeWidth={1.25} />
                </div>
                <h3 className="font-display text-[26px] lg:text-[30px] font-semibold text-foreground tracking-[-0.025em] leading-[1.05] mb-3">
                  {t(f.titleKey)}
                </h3>
                <p className="text-[14.5px] text-muted-foreground leading-[1.65] max-w-[440px]">
                  {t(f.descKey)}
                </p>
              </div>

              {/* Bottom rule */}
              <div className="relative h-px bg-foreground/[0.06]" />
            </article>
            </ScrollReveal>
          ))}
        </div>

        {/* Secondary modules — minimal editorial list, NOT cards */}
        <div className="grid grid-cols-12 gap-x-8 mt-20 lg:mt-28">
          <div className="col-span-12 lg:col-span-3 mb-10 lg:mb-0">
            <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
              {t('landing.featuresAlsoIncludedLabel')}
            </span>
            <p className="mt-3 text-[13px] text-muted-foreground/80 leading-[1.55] max-w-[200px]">
              {t('landing.featuresAlsoIncludedDesc')}
            </p>
          </div>
          <div className="col-span-12 lg:col-span-9">
            <ul className="divide-y divide-foreground/[0.06] border-y border-foreground/[0.06]">
              {secondary.map((f, i) => (
                <ScrollReveal
                  key={f.titleKey}
                  as="li"
                  delay={i * 0.05}
                  y={8}
                  style={{ ['--row-accent' as string]: f.color }}
                  className="group grid grid-cols-12 gap-4 items-center py-6 lg:py-7 transition-colors hover:bg-foreground/[0.015] -mx-4 px-4 rounded-[6px]"
                >
                  <div className="col-span-1 font-mono text-[10.5px] text-muted-foreground/60 tracking-wider">
                    {String(i + 3).padStart(2, '0')}
                  </div>
                  <div className="col-span-1">
                    <f.icon
                      className="w-[18px] h-[18px] text-foreground/70 transition-colors duration-300 group-hover:[color:var(--row-accent)]"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="col-span-10 lg:col-span-4">
                    <h4 className="font-display text-[15.5px] font-semibold text-foreground tracking-[-0.01em]">
                      {t(f.titleKey)}
                    </h4>
                  </div>
                  <div className="col-span-12 lg:col-span-6 lg:pl-4 lg:border-l lg:border-foreground/[0.06]">
                    <p className="text-[13.5px] text-muted-foreground leading-[1.55]">{t(f.descKey)}</p>
                  </div>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
