import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  Megaphone,
  Phone,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isLocale } from '@/lib/i18n';
import { SalesPdfDownload } from './SalesPdfDownload';

const operationalAreas = [
  { icon: Users, da: 'Kunder & salg', en: 'Customers & sales' },
  { icon: Building2, da: 'Team & drift', en: 'Team & operations' },
  { icon: Receipt, da: 'Økonomi', en: 'Finance' },
  { icon: Megaphone, da: 'Marketing', en: 'Marketing' },
];

export function Hero() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  return (
    <section className="relative overflow-hidden border-b border-border pt-24 lg:pt-28" aria-label="Hero">
      <div className="pointer-events-none absolute inset-0 premium-grid opacity-70" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1480px] px-5 lg:px-10">
        <div className="flex items-center justify-between border-b border-border py-5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>01 / {isDa ? 'Virksomhedsplatform' : 'Business platform'}</span>
          <span className="hidden sm:block">København / DK</span>
        </div>

        <div className="grid items-stretch lg:grid-cols-[minmax(0,0.95fr)_minmax(480px,1.05fr)]">
          <div className="flex min-h-[610px] flex-col justify-between border-border py-12 lg:border-r lg:py-16 lg:pr-14">
            <div>
              <div className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span className="h-2 w-2 bg-primary" />
                {isDa ? 'Ét system. Hele virksomheden.' : 'One system. The whole business.'}
              </div>

              <h1 className="max-w-[720px] text-[clamp(3.35rem,7vw,6.8rem)] font-semibold leading-[0.86] tracking-[-0.065em] text-foreground">
                {isDa ? 'Mindre friktion.' : 'Less friction.'}
                <span className="mt-3 block font-display font-normal italic tracking-[-0.035em]">
                  {isDa ? 'Mere forretning.' : 'More business.'}
                </span>
              </h1>

              <p className="mt-9 max-w-xl text-base leading-7 text-muted-foreground lg:text-[17px]">
                {isDa
                  ? 'Saml salg, medarbejdere, økonomi og marketing i én skarp arbejdsflade. Færre systemskift, bedre beslutninger og en drift, der kan skaleres.'
                  : 'Bring sales, people, finance and marketing into one focused workspace. Fewer system changes, better decisions and operations built to scale.'}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 rounded-sm bg-foreground px-6 text-background shadow-none hover:bg-foreground/90">
                  <Link to={`/${locale}/auth/register-company`}>
                    {isDa ? 'Start gratis' : 'Start for free'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 rounded-sm border-border bg-background/70 px-6 shadow-none">
                  <a href="#features">
                    {isDa ? 'Se platformen' : 'Explore the platform'}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <SalesPdfDownload />
              </div>
            </div>

            <div className="mt-14 grid grid-cols-2 border-y border-border sm:grid-cols-4">
              {operationalAreas.map(({ icon: Icon, da, en }, index) => (
                <div
                  key={en}
                  className={`flex min-h-20 items-center gap-3 px-3 ${index < 3 ? 'sm:border-r sm:border-border' : ''}`}
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em]">{isDa ? da : en}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex min-h-[610px] items-center py-12 lg:py-16 lg:pl-14">
            <div className="w-full border border-border bg-card shadow-[14px_14px_0_hsl(var(--foreground)/0.055)]">
              <div className="flex h-12 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 bg-primary" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    {isDa ? 'Driftsoverblik' : 'Operations overview'}
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Live / CPH</span>
              </div>

              <div className="grid sm:grid-cols-[1fr_168px]">
                <div className="border-border p-6 sm:border-r">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    {isDa ? 'Pipeline denne måned' : 'Pipeline this month'}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <strong className="text-4xl font-semibold tracking-[-0.05em]">2.847.200</strong>
                    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-3.5 w-3.5" /> +24%
                    </span>
                  </div>

                  <div className="mt-9 flex h-32 items-end gap-2 border-b border-border pb-px">
                    {[38, 54, 42, 67, 58, 82, 74, 95, 70, 88, 79, 100].map((height, index) => (
                      <div key={index} className="flex-1 bg-foreground/15" style={{ height: `${height}%` }}>
                        <div className="h-1.5 w-full bg-primary" />
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 grid grid-cols-3 divide-x divide-border border-y border-border">
                    {[
                      [isDa ? 'Leads' : 'Leads', '1.2K'],
                      [isDa ? 'Aftaler' : 'Deals', '47'],
                      [isDa ? 'Konvertering' : 'Conversion', '32%'],
                    ].map(([label, value]) => (
                      <div key={label} className="px-3 py-4 first:pl-0">
                        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                        <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-border">
                  <div className="p-5">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="mt-5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                      {isDa ? 'Systemstatus' : 'System status'}
                    </p>
                    <p className="mt-1 text-sm font-medium">{isDa ? 'Alt kører' : 'All operational'}</p>
                  </div>
                  <div className="p-5">
                    <Phone className="h-4 w-4 text-primary" />
                    <p className="mt-5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Power Dialer</p>
                    <p className="mt-1 text-sm font-medium">12 {isDa ? 'opkald' : 'calls'}</p>
                  </div>
                  <div className="p-5">
                    <Check className="h-4 w-4 text-primary" />
                    <p className="mt-5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                      {isDa ? 'Handlinger' : 'Actions'}
                    </p>
                    <p className="mt-1 text-sm font-medium">08 {isDa ? 'afsluttet' : 'completed'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-4 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                <span>{isDa ? 'Samlet arbejdsflade' : 'Unified workspace'}</span>
                <span>Agency / 01</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
