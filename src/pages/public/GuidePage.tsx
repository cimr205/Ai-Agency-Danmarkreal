import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import seo from '@/lib/seo/seo-copy.json';

// Articles the SEO autopilot published (or a person approved) for this site.
// Public: read through growth_seo_published_articles(), no login needed.
export interface PublishedArticle { path: string; title: string; meta_description: string | null; h1: string | null; body: string; published_at: string; lang?: string | null }

const db = supabase as unknown as SupabaseClient;

function usePublishedArticles() {
  return useQuery({
    queryKey: ['public', 'guides'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('growth_seo_published_articles', { _company: seo.articlesCompanyId });
      if (error) throw new Error(error.message);
      return (data ?? []) as PublishedArticle[];
    },
  });
}

function setHead(title: string, description: string | null) {
  document.title = title;
  if (description) document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
}

export default function GuidePage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const path = params['*'] ? `/${params['*'].replace(/\/+$/, '')}` : '';
  const { data: all, isLoading, isError } = usePublishedArticles();
  // Each language has its own articles; rows from before lang existed are Danish.
  const data = all?.filter((a) => (a.lang ?? 'da') === locale);
  const article = path ? data?.find((a) => a.path === path) : undefined;
  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  useEffect(() => {
    if (article) setHead(`${article.title} | AI Agency Danmark`, article.meta_description);
  }, [article]);

  // An empty guide index or an unknown guide path is a thin page: keep it out
  // of the index until there is something to show (SeoManager defaults to index).
  const isThin = !isLoading && !isError && (path ? !article : !data?.length);
  useEffect(() => {
    if (isThin) document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
  }, [isThin]);

  return (
    <div className="light min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6">
        {path ? (
          <Link to={`/${locale}/guide`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {t('guide.back')}
          </Link>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">{t('guide.title')}</h1>
            </div>
            <p className="text-muted-foreground">{t('guide.subtitle')}</p>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">{t('guide.loading')}</p>
        ) : isError || (path && !article) ? (
          <p className="text-muted-foreground">{path ? t('guide.notFound') : t('guide.empty')}</p>
        ) : article ? (
          <article lang={locale} className="prose dark:prose-invert max-w-none">
            <h1>{article.h1 || article.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t('guide.published').replace('{date}', new Date(article.published_at).toLocaleDateString(dateLocale))}
            </p>
            <ReactMarkdown>{article.body}</ReactMarkdown>
          </article>
        ) : !data?.length ? (
          <p className="text-muted-foreground">{t('guide.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {data.map((a) => (
              <li key={a.path} className="rounded-lg border border-border bg-card p-4">
                <Link to={`/${locale}/guide${a.path}`} className="font-semibold text-foreground hover:text-primary">{a.h1 || a.title}</Link>
                {a.meta_description && <p className="mt-1 text-sm text-muted-foreground">{a.meta_description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
