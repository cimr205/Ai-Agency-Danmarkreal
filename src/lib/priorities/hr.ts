import type { PriorityItem, Tr } from './types';

export interface HrInput {
  activeNow: number;
  missingCheckout: number;
  pendingLeave: number;
  employeesActive: number;
  employeesTotal: number;
  tasksPending: number;
}

export function isWorkingHours(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 16;
}

export function hrPriorities(i: HrInput, base: string, tr: Tr, now: Date = new Date()): PriorityItem[] {
  const items: PriorityItem[] = [];
  if (i.missingCheckout > 0) items.push({ id: 'missing-out', tier: 1, score: i.missingCheckout, title: tr('sec.hr.missingCheckout', { n: i.missingCheckout }), detail: tr('sec.hr.missingCheckoutDetail'), href: `${base}/hr/attendance`, cta: tr('sec.cta.openAttendance') });
  if (i.pendingLeave > 0) items.push({ id: 'leave', tier: 2, score: i.pendingLeave, title: tr('sec.hr.pendingLeave', { n: i.pendingLeave }), detail: tr('sec.hr.pendingLeaveDetail'), href: `${base}/hr/leave`, cta: tr('sec.cta.reviewLeave') });
  if (i.activeNow === 0 && i.employeesActive > 0 && isWorkingHours(now)) items.push({ id: 'nobody', tier: 2, score: 1, title: tr('sec.hr.nobodyIn'), detail: tr('sec.hr.nobodyInDetail', { n: i.employeesActive }), href: `${base}/hr/attendance`, cta: tr('sec.cta.openAttendance') });
  if (i.tasksPending > 8) items.push({ id: 'tasks', tier: 3, score: i.tasksPending, title: tr('sec.hr.heavyQueue', { n: i.tasksPending }), detail: tr('sec.hr.heavyQueueDetail'), href: `${base}/work/tasks`, cta: tr('sec.cta.openTasks') });
  if (i.employeesTotal === 0) items.push({ id: 'no-team', tier: 3, score: 1, title: tr('sec.hr.noTeam'), detail: tr('sec.hr.noTeamDetail'), href: `${base}/hr/employees`, cta: tr('sec.cta.openEmployees') });
  return items;
}
