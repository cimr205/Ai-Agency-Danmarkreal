import { useParams, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { isLocale } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';

// Admin access is the same `system_admin` database role every admin page and
// RLS policy already trusts (public.has_role) — there is no separate secret
// to enter. This page just resolves where a visitor to /admin should land:
// straight into the panel if they hold the role, a clear "no access" message
// if they're logged in without it, or the normal login if they're signed out.
export default function AdminGatePage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { user, isSystemAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${locale}/auth/login`} replace />;
  }

  if (isSystemAdmin) {
    return <Navigate to={`/${locale}/admin/overview`} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto rounded-full bg-destructive/10 p-3 w-fit">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Ingen adgang</CardTitle>
          <CardDescription>
            Din konto har ikke system-admin-rettigheder. Kontakt en eksisterende
            system-admin, hvis du mener det er en fejl.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
