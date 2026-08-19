import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Building2, Briefcase, Calendar, Hash, User, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  MODULE_KEYS, MODULE_LABELS, type ModuleKey,
  useUserModuleRestrictions, useSetModuleRestrictions,
} from '@/hooks/api/useModuleAccess';

interface EmployeeDetail {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  employee_id: string;
  start_date?: string | null;
  is_active?: boolean | null;
  avatar_url?: string | null;
  user_id?: string | null;
}

interface Props {
  employee: EmployeeDetail | null;
  open: boolean;
  onClose: () => void;
}

export default function EmployeeDetailPanel({ employee, open, onClose }: Props) {
  const { t, locale } = useI18n();
  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';
  const { roles } = useAuth();
  const isOwnerLevel = roles.some(r => ['system_admin', 'company_admin', 'owner'].includes(r.role));

  const { data: restrictions } = useUserModuleRestrictions(employee?.user_id ?? null);
  const setRestrictions = useSetModuleRestrictions();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBlocked(new Set(restrictions ?? []));
  }, [restrictions]);

  if (!employee) return null;

  const toggleModule = (mod: ModuleKey) => {
    setBlocked(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  };

  const hasChanges = restrictions && (
    blocked.size !== restrictions.size || [...blocked].some(m => !restrictions.has(m))
  );

  const saveModuleAccess = () => {
    if (!employee.user_id) return;
    setRestrictions.mutate(
      { userId: employee.user_id, blockedModules: [...blocked] as ModuleKey[] },
      { onSuccess: () => toast.success(t('hr.moduleAccessSaved') || 'Module access updated') },
    );
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span>{employee.full_name}</span>
              <Badge variant={employee.is_active !== false ? 'default' : 'secondary'} className="ml-2 text-xs">
                {employee.is_active !== false ? (t('hr.active') || 'Active') : (t('hr.inactive') || 'Inactive')}
              </Badge>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('hr.contactInfo') || 'Contact Information'}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${employee.email}`} className="text-primary hover:underline">{employee.email}</a>
              </div>
              {employee.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${employee.phone}`}>{employee.phone}</a>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Work Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('hr.workInfo') || 'Work Information'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('hr.positionLabel') || 'Position'}</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  {employee.position || '—'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('hr.departmentLabel') || 'Department'}</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {employee.department || '—'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('hr.employeeIdLabel') || 'Employee ID'}</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  {employee.employee_id}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('hr.startDate') || 'Start Date'}</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {employee.start_date ? new Date(employee.start_date).toLocaleDateString(dateLocale) : '—'}
                </div>
              </div>
            </div>
          </div>

          {employee.user_id && isOwnerLevel && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t('hr.moduleAccess') || 'Module Access'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('hr.moduleAccessHint') || 'Uncheck a module to hide it from this employee.'}
                </p>
                <div className="space-y-2">
                  {MODULE_KEYS.map(mod => (
                    <label key={mod} className="flex items-center gap-3 text-sm cursor-pointer">
                      <Checkbox
                        checked={!blocked.has(mod)}
                        onCheckedChange={() => toggleModule(mod)}
                      />
                      {MODULE_LABELS[mod]}
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={saveModuleAccess}
                  disabled={!hasChanges || setRestrictions.isPending}
                >
                  {t('common.save') || 'Save'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
