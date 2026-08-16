/**
 * System Status Banner
 * Shows current company status and mode at the top of the app
 */

import { useCompanyStatus } from '@/hooks/useCompanyStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, Settings, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

export function SystemStatusBanner() {
  const { company, isAdmin, setCompanyMode, isUpdating } = useCompanyStatus();
  const navigate = useNavigate();
  const { t } = useI18n();

  if (!company) return null;
  if (company.status === 'active' && company.mode === 'live') return null;

  const handleUnlock = () => {
    if (!isAdmin) {
      toast.error(t('system.onlyAdminsCanChange'));
      return;
    }
    setCompanyMode('live');
    toast.success(t('system.unlocked'));
  };

  if (company.mode === 'locked') {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-2 text-amber-600">
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t('system.locked')}
            </span>
            <Badge variant="outline" className="ml-2 text-amber-600 border-amber-500">
              {t('system.readOnly')}
            </Badge>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlock}
              disabled={isUpdating}
              className="text-amber-600 border-amber-500 hover:bg-amber-500/10"
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : t('system.unlock')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (company.status === 'pending') {
    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-2 text-primary">
            <Settings className="w-4 h-4 animate-spin-slow" />
            <span className="text-sm font-medium">
              {t('system.setupMode')}
            </span>
            <Badge variant="outline" className="ml-2 text-primary border-primary">
              Setup
            </Badge>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/app/admin/settings')}
              className="text-primary border-primary hover:bg-primary/10"
            >
              {t('system.continueSetup')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
