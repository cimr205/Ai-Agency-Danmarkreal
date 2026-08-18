import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isLocale } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';

export default function AdminGatePage() {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-admin-code', {
        body: { code: accessCode.trim() },
      });
      if (error) throw new Error('Verifikation fejlede');
      if (!data?.valid) {
        toast.error('Ugyldig adgangskode');
        return;
      }
      sessionStorage.setItem('admin_verified', Date.now().toString());
      sessionStorage.setItem('admin_code', accessCode.trim());
      navigate(`/${locale}/admin/overview`);
    } catch (err) {
      toast.error((getErrorMessage(err) || 'Fejl ved verifikation'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto rounded-full bg-destructive/10 p-3 w-fit">
            <KeyRound className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">System Admin</CardTitle>
          <CardDescription>Indtast din hemmelige adgangskode</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-code">Adgangskode</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="access-code"
                  type="password"
                  placeholder="••••••••••"
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value)}
                  required
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Åbn Admin Panel
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
