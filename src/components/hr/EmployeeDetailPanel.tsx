import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';
import { Mail, Phone, Building2, Briefcase, Calendar, Hash, User, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  MODULE_KEYS, MODULE_LABELS, type ModuleKey,
  useUserModuleRestrictions, useSetModuleRestrictions,
} from '@/hooks/api/useModuleAccess';
import { t3 } from '@/lib/inlineI18n';

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

  const canEdit = roles.some(r => ['system_admin', 'company_admin', 'owner', 'manager'].includes(r.role));
  const qc = useQueryClient();
  const [edit, setEdit] = useState({ full_name: '', position: '', department: '', phone: '', is_active: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (employee) setEdit({ full_name: employee.full_name ?? '', position: employee.position ?? '', department: employee.department ?? '', phone: employee.phone ?? '', is_active: employee.is_active !== false });
  }, [employee]);

  // The sheet used to be read-only (column grants only allow phone), so a
  // wrong or duplicate employee could never be corrected or deactivated.
  const saveEmployee = async () => {
    if (!employee) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_employee', {
      _employee_id: employee.id, _full_name: edit.full_name, _position: edit.position,
      _department: edit.department, _phone: edit.phone, _is_active: edit.is_active,
    });
    if (error && (error as { code?: string }).code === 'PGRST202') {
      // The RPC ships in migration 20261028000005; until it is applied only
      // the phone column is client-writable, so save that and say why the
      // rest has to wait instead of showing a raw "function not found".
      const onlyPhoneChanged = edit.full_name === (employee.full_name ?? '') && edit.position === (employee.position ?? '')
        && edit.department === (employee.department ?? '') && edit.is_active === (employee.is_active !== false);
      if (onlyPhoneChanged) {
        const { error: phoneErr } = await supabase.from('employee_profiles').update({ phone: edit.phone.trim() || null }).eq('id', employee.id);
        setSaving(false);
        if (phoneErr) { toast.error(getErrorMessage(phoneErr) || t('common.error')); return; }
      } else {
        setSaving(false);
        toast.error(t3('Ændring af navn, stilling, afdeling og status bliver mulig, når databasen er opdateret (supabase db push). Telefonnummer kan allerede gemmes.', 'Changing name, position, department and status becomes available once the database is updated (supabase db push). The phone number can already be saved.', 'Name, Position, Abteilung und Status lassen sich ändern, sobald die Datenbank aktualisiert ist (supabase db push). Die Telefonnummer kann bereits gespeichert werden.'));
        return;
      }
    } else {
      setSaving(false);
      if (error) { toast.error(getErrorMessage(error) || t('common.error')); return; }
    }
    toast.success(t('common.saved'));
    qc.invalidateQueries({ queryKey: ['employees'] });
    onClose();
  };

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

          {canEdit && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('hr.editEmployee')}</h3>
                <div className="grid gap-3">
                  <div className="space-y-1"><Label htmlFor="emp-name" className="text-xs">{t('hr.fullName')}</Label><Input id="emp-name" value={edit.full_name} onChange={e => setEdit({ ...edit, full_name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label htmlFor="emp-pos" className="text-xs">{t('hr.positionLabel') || 'Position'}</Label><Input id="emp-pos" value={edit.position} onChange={e => setEdit({ ...edit, position: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor="emp-dept" className="text-xs">{t('hr.departmentLabel') || 'Department'}</Label><Input id="emp-dept" value={edit.department} onChange={e => setEdit({ ...edit, department: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label htmlFor="emp-phone" className="text-xs">{t('common.phone')}</Label><Input id="emp-phone" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
                  <label className="flex items-center gap-3 text-sm cursor-pointer">
                    <Checkbox checked={edit.is_active} onCheckedChange={v => setEdit({ ...edit, is_active: v === true })} />
                    {t('hr.active') || 'Active'}
                  </label>
                </div>
                <Button size="sm" onClick={saveEmployee} disabled={saving || !edit.full_name.trim()}>{t('common.save') || 'Save'}</Button>
              </div>
            </>
          )}

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
