/**
 * Compliance Checklist Component
 * Shows setup requirements from Railway API (array-based checklist)
 */

import { useCompanyStatus, type ComplianceItem } from '@/hooks/useCompanyStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Lock,
  Unlock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export function ComplianceChecklist() {
  const { t } = useI18n();
  const {
    company,
    isAdmin,
    isSetupComplete,
    completedItems,
    totalItems,
    checklist,
    updateComplianceItem,
    activateCompany,
    setCompanyMode,
    isUpdating,
  } = useCompanyStatus();

  if (!company) return null;

  const LABELS: Record<string, { title: string; description: string }> = {
    company_profile: { title: t('compliance.companyProfile'), description: t('compliance.companyProfileDesc') },
    connect_email: { title: t('compliance.connectEmail'), description: t('compliance.connectEmailDesc') },
    connect_meta: { title: t('compliance.connectMeta'), description: t('compliance.connectMetaDesc') },
    import_leads: { title: t('compliance.importLeads'), description: t('compliance.importLeadsDesc') },
    create_workflow: { title: t('compliance.createWorkflow'), description: t('compliance.createWorkflowDesc') },
  };

  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const handleActivate = () => {
    if (!isSetupComplete) {
      toast.error(t('compliance.completeAllFirst'));
      return;
    }
    activateCompany();
    toast.success(t('compliance.companyActivated'));
  };

  const handleToggleItem = (item: ComplianceItem) => {
    if (!isAdmin) return;
    updateComplianceItem({ item: item.id, value: !item.completed });
  };

  const handleLock = () => {
    setCompanyMode('locked');
    toast.success(t('system.lockedForChanges'));
  };

  const handleUnlock = () => {
    setCompanyMode('live');
    toast.success(t('system.unlocked'));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {company.status === 'pending' ? (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {t('compliance.systemSetup')}
            </CardTitle>
            <CardDescription>
              {company.status === 'pending'
                ? t('compliance.requirementsPending')
                : t('compliance.systemConfigured')
              }
            </CardDescription>
          </div>
          {isAdmin && company.status === 'active' && (
            <div className="flex gap-2">
              {company.mode === 'locked' ? (
                <Button variant="outline" size="sm" onClick={handleUnlock} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                  {t('system.unlock')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleLock} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  {t('system.lockSystem')}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              {completedItems} / {totalItems} {t('compliance.requirementsMet')}
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {checklist.map((item) => {
          const label = LABELS[item.id] || { title: item.label, description: '' };

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-4 p-3 rounded-lg border transition-colors",
                isAdmin && "cursor-pointer",
                item.completed
                  ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
                  : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
              )}
              onClick={() => handleToggleItem(item)}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                item.completed
                  ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                  : "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400"
              )}>
                {item.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <span className={cn(
                  "font-medium",
                  item.completed && "text-green-700 dark:text-green-400"
                )}>
                  {label.title}
                </span>
                {label.description && (
                  <p className="text-sm text-muted-foreground">{label.description}</p>
                )}
              </div>
              {!item.completed && (
                <Circle className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          );
        })}

        {isAdmin && company.status === 'pending' && (
          <div className="pt-4 border-t">
            <Button
              className="w-full"
              size="lg"
              disabled={!isSetupComplete || isUpdating}
              onClick={handleActivate}
            >
              {isUpdating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {t('compliance.activateCompany')}
            </Button>
            {!isSetupComplete && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {t('compliance.completeToActivate')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
