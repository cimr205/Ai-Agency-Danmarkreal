import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useEmployees } from '@/hooks/api/useEmployees';
import { useI18n } from '@/lib/i18n';
import { Building2, Users } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

export default function OrgChart() {
  const { t } = useI18n();
  const { data: employees } = useEmployees();

  const departments = useMemo(() => {
    const deptMap: Record<string, Tables<'employee_profiles'>[]> = {};
    (employees ?? []).forEach(emp => {
      const dept = emp.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(emp);
    });
    return Object.entries(deptMap).sort(([a], [b]) => a.localeCompare(b));
  }, [employees]);

  if (!employees || employees.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('hr.orgChartEmpty')}</h3>
          <p className="text-muted-foreground">{t('hr.orgChartEmptyDesc')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          {t('hr.orgChart')}
        </h2>
        <p className="text-muted-foreground">{t('hr.orgChartDesc')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {departments.map(([dept, members]) => (
          <Card key={dept}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{dept}</span>
                <Badge variant="secondary">{members.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map(emp => (
                <div key={emp.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={emp.avatar_url || ''} />
                    <AvatarFallback className="text-xs">{emp.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{emp.position || '—'}</p>
                  </div>
                  {emp.is_active !== false && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
