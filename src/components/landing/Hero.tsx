import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowUpRight, TrendingUp, Sparkles, Mail, CheckCircle2, Circle, Phone, Zap } from 'lucide-react';
import { useI18n, isLocale } from '@/lib/i18n';
import { SalesPdfDownload } from './SalesPdfDownload';

export function Hero() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  return (
    <section className="relative pt-24 lg:pt-28 pb-24 lg:pb-32 overflow-hidden" aria-label="Hero">
      {/* ── Cinematic background stack ── */}
      {/* Warm cream-to-cool gradient base */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 70% at 85% -10%, hsl(221 83% 53% / 0.10) 0%, transparent 55%), radial-gradient(80% 60% at 0% 110%, hsl(258 90% 66% / 0.07) 0%, transparent 60%), linear-gradient(180deg, hsl(214 33% 98%) 0%, hsl(214 33% 96%) 100%)',
        }}
      />
      {/* Diagonal hairline accent */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{
          backgroundImage: 'linear-gradient(115deg, transparent 0%, transparent 49.85%, hsl(var(--foreground)/0.06) 49.95%, hsl(var(--foreground)/0.06) 50.05%, transparent 50.15%, transparent 100%)',
        }}
      />
      {/* Sparse dot grid, faded out smoothly */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)/0.10) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 60% 50% at 25% 20%, black 0%, transparent 70%)',
        }}
      />
      {/* Grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.5] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial top marker — off-grid */}
        <div className="hidden lg:flex items-center gap-3 mb-10 ml-[-2px]">
          <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
            01 — {isDa ? 'Platformen' : 'The Platform'}
          </span>
          <div className="h-px w-24 bg-gradient-to-r from-foreground/30 to-transparent" />
          <span className="font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground/50">
            {isDa ? 'København · Est. 2024' : 'Copenhagen · Est. 2024'}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-x-6 gap-y-20 items-start">
          {/* LEFT — editorial content */}
          <div className="col-span-12 lg:col-span-7 lg:pr-6 relative">
            {/* Hairline numbered tag, floats slightly off-grid */}
            <div className="inline-flex items-center gap-2 mb-8 -ml-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="text-[11.5px] font-medium text-muted-foreground tracking-wide">
                {isDa ? 'Live · AI-agenter til salg, HR & marketing' : 'Live · AI agents for sales, HR & marketing'}
              </span>
            </div>

            {/* Editorial headline — mixed weights + serif italic accent, slightly off-axis */}
            <h1 className="font-display text-foreground tracking-[-0.04em] leading-[0.92] mb-7 max-w-[700px]">
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold">
                {isDa ? 'Mindre stack.' : 'Less stack.'}
              </span>
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold pl-[0.06em]">
                {isDa ? 'Mere ' : 'More '}
                <span
                  className="italic font-normal text-foreground/90 pr-1"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.01em' }}
                >
                  {isDa ? 'forretning' : 'business'}
                </span>
                <span className="text-primary">.</span>
              </span>
            </h1>

            {/* Subtitle — narrower, editorial line length */}
            <p className="text-[16.5px] lg:text-[17.5px] text-muted-foreground/90 max-w-[510px] mb-10 leading-[1.55]">
              {isDa ? (
                <>
                  CRM, HR, finans, marketing og AI-agenter — samlet i ét system.
                  <span className="text-foreground/70"> Bygget i Danmark, til teams der har fået nok af 8 forskellige værktøjer.</span>
                </>
              ) : (
                <>
                  CRM, HR, finance, marketing and AI agents — unified in a single system.
                  <span className="text-foreground/70"> Built in Denmark, for teams done juggling 8 disconnected tools.</span>
                </>
              )}
            </p>

            {/* Tactile CTAs */}
            <div className="flex flex-wrap items-center gap-3 mb-12">
              <Button
                asChild
                size="lg"
                className="h-[46px] px-5 text-[13.5px] font-medium rounded-[7px] bg-foreground text-background hover:bg-foreground border-0 group relative overflow-hidden transition-all
                  shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(222_47%_11%/0.25),0_8px_24px_-6px_hsl(222_47%_11%/0.25)]
                  hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),0_2px_4px_hsl(222_47%_11%/0.3),0_14px_32px_-8px_hsl(222_47%_11%/0.35)]
                  hover:-translate-y-px"
              >
                <Link to={`/${locale}/auth/register-company`}>
                  {isDa ? 'Start gratis prøve' : 'Start free trial'}
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-[46px] px-4 text-[13.5px] font-medium text-foreground rounded-[7px] hover:bg-foreground/[0.04] group"
              >
                <a href="#features">
                  <span className="border-b border-foreground/25 group-hover:border-foreground/70 transition-colors pb-px">
                    {isDa ? 'Se hvordan det virker' : 'See how it works'}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </a>
              </Button>
              <SalesPdfDownload />
            </div>

            {/* Proof — editorial split row */}
            <div className="flex items-center gap-6 pt-7 border-t border-foreground/[0.08] max-w-[520px]">
              <div className="flex -space-x-2">
                {[
                  'bg-[hsl(221_83%_53%)]',
                  'bg-[hsl(258_90%_66%)]',
                  'bg-[hsl(160_84%_39%)]',
                  'bg-[hsl(38_92%_50%)]',
                ].map((c, i) => (
                  <div
                    key={i}
                    className={`w-7 h-7 rounded-full border-2 border-background ${c} flex items-center justify-center text-[10px] font-semibold text-white shadow-sm`}
                  >
                    {['M', 'K', 'A', 'L'][i]}
                  </div>
                ))}
              </div>
              <div className="text-[12.5px] text-muted-foreground leading-[1.45]">
                <span className="text-foreground font-semibold">200+ teams</span>{' '}
                {isDa ? 'kører forretningen herinde · ' : 'run their business in here · '}
                <span className="text-foreground/80">4.9/5</span>
              </div>
            </div>
          </div>

          {/* RIGHT — refined floating cluster */}
          <div className="col-span-12 lg:col-span-5 relative h-[560px] hidden lg:block">
            {/* Soft halo behind cluster */}
            <div className="absolute top-10 right-0 w-[500px] h-[500px] rounded-full bg-primary/[0.06] blur-[100px] pointer-events-none" />

            {/* Card 1 — Pipeline (back, primary) */}
            <div
              className="absolute top-2 right-[-10px] w-[400px] bg-card rounded-[14px] overflow-hidden rotate-[1.2deg] origin-top-right backdrop-blur-md
                border border-foreground/[0.06]
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_30px_60px_-20px_hsl(222_47%_11%/0.22),0_18px_36px_-18px_hsl(222_47%_11%/0.18)]"
            >
              <div className="px-4 py-3 border-b border-foreground/[0.06] flex items-center justify-between bg-gradient-to-b from-white/60 to-transparent">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <span className="text-[10.5px] font-mono text-muted-foreground ml-2 tracking-tight">pipeline / Q2 · live</span>
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-success" />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
                      {isDa ? 'Pipeline værdi' : 'Pipeline value'}
                    </div>
                    <div className="font-display text-[30px] font-semibold text-foreground tracking-[-0.03em] leading-none">
                      kr 2.847.200
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                      {isDa ? 'vs. forrige kvartal' : 'vs. last quarter'}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-md">+24%</span>
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-1.5 h-[68px] pt-1">
                  {[40, 65, 45, 80, 55, 92, 70, 100, 85, 95, 78, 88].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[2px] bg-gradient-to-t from-primary/25 to-primary"
                      style={{ height: `${h}%`, opacity: 0.55 + (h / 200) }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-foreground/[0.06]">
                  {[
                    { l: isDa ? 'Leads' : 'Leads', v: '1.2k' },
                    { l: isDa ? 'Aftaler' : 'Deals', v: '47' },
                    { l: isDa ? 'Win rate' : 'Win rate', v: '32%' },
                  ].map(s => (
                    <div key={s.l}>
                      <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{s.l}</div>
                      <div className="text-[15px] font-semibold text-foreground font-mono mt-0.5">{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 2 — AI Suggestions (mid, offset left) */}
            <div
              className="absolute top-[260px] -left-6 w-[310px] bg-card rounded-[14px] overflow-hidden -rotate-[2.5deg] backdrop-blur-md
                border border-foreground/[0.06]
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_24px_50px_-18px_hsl(222_47%_11%/0.22)]"
            >
              <div className="px-4 py-3 border-b border-foreground/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-[12px] font-semibold text-foreground tracking-tight">
                    {isDa ? 'AI-anbefalinger' : 'AI suggestions'}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">3 {isDa ? 'nye' : 'new'}</span>
              </div>
              <div className="divide-y divide-foreground/[0.05]">
                {[
                  { d: isDa ? 'Ring til Mads (varm lead)' : 'Call Mads (warm lead)', t: '2m', icon: Phone, c: true },
                  { d: isDa ? 'Send opfølgning til Acme A/S' : 'Send follow-up to Acme A/S', t: '15m', icon: Mail, c: false },
                  { d: isDa ? 'Godkend faktura #2847' : 'Approve invoice #2847', t: '1h', icon: Zap, c: false },
                ].map((task, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    {task.c ? (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12.5px] font-medium truncate ${task.c ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {task.d}
                      </div>
                    </div>
                    <task.icon className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{task.t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3 — Live activity (front, dark, no rotate) */}
            <div
              className="absolute bottom-0 right-6 w-[280px] bg-[hsl(222_47%_9%)] text-background rounded-[14px] overflow-hidden
                border border-white/[0.06]
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.08)_inset,0_30px_60px_-15px_hsl(222_47%_11%/0.45)]"
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.18em] font-mono opacity-60">live</span>
                  <span className="text-[10px] font-mono opacity-40 ml-auto">now</span>
                </div>
                <div className="text-[13.5px] leading-snug">
                  <span className="font-semibold">Sofia</span>{' '}
                  <span className="opacity-70">{isDa ? 'lukkede en aftale på' : 'closed a deal worth'}</span>{' '}
                  <span className="font-semibold text-success">kr 48.000</span>
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[10.5px]">
                  <span className="opacity-55 font-mono">Acme A/S · Enterprise</span>
                  <span className="opacity-40 font-mono">+2s</span>
                </div>
              </div>
            </div>

            {/* Floating uptime tag */}
            <div className="absolute -top-3 left-12 px-2.5 py-1 bg-card border border-foreground/[0.07] rounded-md shadow-[0_8px_20px_-8px_hsl(222_47%_11%/0.2)] text-[10px] font-mono text-muted-foreground -rotate-[4deg]">
              <span className="text-success">●</span> 99.98% uptime
            </div>
          </div>
        </div>

        {/* Logo strip — editorial bottom rule */}
        <div className="mt-24 lg:mt-32 pt-8 border-t border-foreground/[0.07]">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-14">
            <div className="text-[10.5px] uppercase tracking-[0.22em] font-semibold text-muted-foreground/70 lg:max-w-[180px] leading-relaxed">
              {isDa ? 'Brugt af teams hos' : 'Trusted by teams at'}
            </div>
            <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
              {['NORDIC.IO', 'Lumen&Co', 'Kindred', 'Halcyon', 'Vector', 'Northwind'].map(name => (
                <span
                  key={name}
                  className="font-display text-[15px] font-semibold text-foreground/55 hover:text-foreground/90 transition-colors tracking-tight"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
