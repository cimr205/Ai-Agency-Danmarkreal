import { describe, expect, it } from 'vitest';
import { relativeAppPath, sectionFromPath } from '@/lib/sections';

describe('sectionFromPath', () => {
  it.each([
    ['/da/app/dashboard', 'home'],
    ['/da/app/clients', 'home'],
    ['/da/app/work/tasks', 'home'],
    ['/da/app/email/emails', 'home'],
    ['/da/app/crm/dashboard', 'crm'],
    ['/en/app/crm/leads', 'crm'],
    ['/en/app/crm/deals', 'crm'],
    ['/da/app/marketing/meta-ads', 'marketing'],
    ['/da/app/email/bulk', 'marketing'],
    ['/da/app/ai/media', 'marketing'],
    ['/de/app/finance/invoices', 'finance'],
    ['/da/app/hr/leave', 'hr'],
    ['/da/app/workspace/control-room', 'control'],
    ['/da/app/workspace/studio', 'control'],
    ['/da/app/autopilot', 'control'],
    ['/da/app/pa', 'control'],
    ['/da/app/settings/company', 'control'],
    ['/da/app/help', 'control'],
  ])('%s -> %s', (path, expected) => {
    expect(sectionFromPath(path)).toBe(expected);
  });

  it('does not confuse work/ with workspace/', () => {
    expect(sectionFromPath('/da/app/work/calendar')).toBe('home');
    expect(sectionFromPath('/da/app/workspace/connected-apps')).toBe('control');
  });

  it('falls back to home for unknown or bare app paths', () => {
    expect(sectionFromPath('/da/app')).toBe('home');
    expect(sectionFromPath('/da/app/onboarding')).toBe('home');
  });

  it('ignores trailing slashes', () => {
    expect(relativeAppPath('/da/app/crm/leads/')).toBe('crm/leads');
    expect(sectionFromPath('/da/app/hr/')).toBe('hr');
  });
});
