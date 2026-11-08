import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID_PATTERN, generateEmployeeId, isEmployeeIdConflict } from '@/lib/employeeId';

describe('generateEmployeeId', () => {
  it('produces EMP- plus six readable characters', () => {
    for (let i = 0; i < 500; i++) expect(generateEmployeeId()).toMatch(EMPLOYEE_ID_PATTERN);
  });

  it('covers the alphabet edges without going out of range', () => {
    expect(generateEmployeeId(() => 0)).toBe('EMP-000000');
    expect(generateEmployeeId(() => 0.999999)).toBe('EMP-ZZZZZZ');
  });

  it('does not repeat in practice', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generateEmployeeId()));
    expect(ids.size).toBe(2000);
  });
});

describe('isEmployeeIdConflict', () => {
  it('matches the employee_id unique violation', () => {
    expect(isEmployeeIdConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "employee_profiles_employee_id_key"',
    })).toBe(true);
  });

  it('ignores other unique violations and other errors', () => {
    expect(isEmployeeIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "employee_profiles_email_key"' })).toBe(false);
    expect(isEmployeeIdConflict({ code: '42501', message: 'employee_id not allowed' })).toBe(false);
    expect(isEmployeeIdConflict(null)).toBe(false);
  });
});
