const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits, optional leading +, and common separators — rejects letters.
const PHONE_RE = /^\+?[0-9()\-.\s]{6,20}$/;

export const MAX_NAME_LENGTH = 120;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  if (!value.trim()) return true; // phone is usually optional
  return PHONE_RE.test(value.trim());
}

export function isNonNegativeAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
