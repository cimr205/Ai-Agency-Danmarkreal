import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkforceReport, useTimeEntries, type AttendanceLog } from '@/hooks/api/useWorkforce';
import { BarChart3, Download, Clock, TrendingUp, TrendingDown, Target, Users, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { toast } from 'sonner';

export default function WorkforceReportsPage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const today = new Date();
  const start = period === 'week' ? startOfWeek(today, { weekStartsOn: 1 }) : startOfMonth(today);
  const end = period === 'week' ? endOfWeek(today, { weekStartsOn: 1 }) : endOfMonth(today);

  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  const { data: report, isLoading } = useWorkforceReport({ startDate: startStr, endDate: endStr });
  const { data: allEntries } = useTimeEntries({ startDate: startStr, endDate: endStr });

  const handleExportCSV = () => {
    if (!report?.employees?.length) return;
    const headers = ['Name', 'Department', 'Actual Hours', 'Planned Hours', 'Deviation', 'Adherence %', 'Days Worked'];
    const rows = report.employees.map(e => [
      e.name, e.department, e.actualHours, e.plannedHours, e.deviation, e.adherence ?? 'N/A', e.daysWorked,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workforce-report-${startStr}-${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!allEntries?.length) { toast.error('Ingen data at eksportere'); return; }
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape' });
      const periodLabel = `${format(start, 'dd/MM/yyyy')} — ${format(end, 'dd/MM/yyyy')}`;

      // Title
      doc.setFontSize(18);
      doc.text('Tidsregistrering — Rapport', 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Periode: ${periodLabel}`, 14, 28);
      doc.text(`Genereret: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 34);

      // Summary KPIs
      if (report) {
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Faktiske timer: ${report.totalActual}h  |  Planlagte timer: ${report.totalPlanned}h  |  Afvigelse: ${report.totalDeviation >= 0 ? '+' : ''}${report.totalDeviation}h`, 14, 42);
      }

      // Detailed time entries table
      const tableData = allEntries.map((entry: AttendanceLog) => {
        const ci = new Date(entry.check_in);
        const co = entry.check_out ? new Date(entry.check_out) : null;
        const hrs = co ? ((co.getTime() - ci.getTime()) / 3600000).toFixed(1) : 'Aktiv';
        return [
          entry.employee_profiles?.full_name || 'Ukendt',
          entry.employee_profiles?.department || '-',
          format(ci, 'dd/MM/yyyy'),
          format(ci, 'HH:mm'),
          co ? format(co, 'HH:mm') : '-',
          hrs === 'Aktiv' ? hrs : `${hrs}h`,
        ];
      });

      autoTable(doc, {
        startY: 48,
        head: [['Medarbejder', 'Afdeling', 'Dato', 'Clock ind', 'Clock ud', 'Timer']],
        body: tableData,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      // Employee summary table on new page if report exists
      if (report?.employees?.length) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text('Medarbejderoversigt', 14, 20);

        const summaryData = report.employees.map(e => [
          e.name,
          e.department,
          `${e.actualHours}h`,
          `${e.plannedHours}h`,
          `${e.deviation >= 0 ? '+' : ''}${e.deviation}h`,
          e.adherence != null ? `${e.adherence}%` : 'N/A',
          String(e.daysWorked),
        ]);

        autoTable(doc, {
          startY: 26,
          head: [['Medarbejder', 'Afdeling', 'Faktisk', 'Planlagt', 'Afvigelse', 'Overholdelse', 'Dage']],
          body: summaryData,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 250] },
        });
      }

      doc.save(`tidsrapport-${startStr}-${endStr}.pdf`);
      toast.success('PDF rapport downloadet');
    } catch (err) {
      console.error('PDF generation failed', err);
      toast.error('Kunne ikke generere PDF');
    }
  };

  const kpis = [
    { label: t('workforce.totalActualHours'), value: `${report?.totalActual ?? 0}h`, icon: Clock, color: 'text-primary', bg: 'bg-primary/10' },
    { label: t('workforce.totalPlannedHours'), value: `${report?.totalPlanned ?? 0}h`, icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    {
      label: t('workforce.totalDeviation'),
      value: `${(report?.totalDeviation ?? 0) >= 0 ? '+' : ''}${report?.totalDeviation ?? 0}h`,
      icon: (report?.totalDeviation ?? 0) >= 0 ? TrendingUp : TrendingDown,
      color: (report?.totalDeviation ?? 0) >= 0 ? 'text-emerald-500' : 'text-destructive',
      bg: (report?.totalDeviation ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-destructive/10',
    },
    {
      label: t('workforce.adherence'),
      value: report?.averageAdherence != null ? `${report.averageAdherence}%` : 'N/A',
      icon: Users,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('workforce.reportsTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('workforce.reportsSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-border rounded-lg overflow-hidden">
            <Button variant={period === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod('week')}>{t('workforce.thisWeek')}</Button>
            <Button variant={period === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod('month')}>{t('workforce.thisMonth')}</Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!report?.employees?.length}>
            <Download className="h-4 w-4 mr-1" /><span className="hidden sm:inline">{t('workforce.exportCSV')}</span><span className="sm:hidden">CSV</span>
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={!allEntries?.length} className="bg-primary text-primary-foreground">
            <FileText className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border-border/50">
            <CardContent className="pt-6">
              {isLoading ? <Skeleton className="h-16 w-full" /> : (
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                    <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employee Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {t('workforce.employeeBreakdown')}
            <Badge variant="secondary" className="ml-auto">{report?.employees?.length ?? 0} {t('workforce.employees')}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (report?.employees?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">{t('workforce.noReportData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.employee')}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.department')}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{t('workforce.actualHours')}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{t('workforce.plannedHours')}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{t('workforce.deviation')}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{t('workforce.adherence')}</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">{t('workforce.daysWorked')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.employees.map(emp => (
                    <tr key={emp.id} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="p-3 font-medium">{emp.name}</td>
                      <td className="p-3 text-muted-foreground">{emp.department}</td>
                      <td className="p-3 text-right font-mono">{emp.actualHours}h</td>
                      <td className="p-3 text-right font-mono">{emp.plannedHours}h</td>
                      <td className="p-3 text-right font-mono">
                        <span className={emp.deviation >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                          {emp.deviation >= 0 ? '+' : ''}{emp.deviation}h
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {emp.adherence != null ? (
                          <Badge variant={emp.adherence >= 90 ? 'default' : emp.adherence >= 75 ? 'secondary' : 'destructive'}>
                            {emp.adherence}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{emp.daysWorked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
