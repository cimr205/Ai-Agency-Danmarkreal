import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema, resetPasswordSchema } from '@/lib/validations';

const validSignup = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john@example.com',
  password: 'Password123',
  confirmPassword: 'Password123',
  acceptTerms: true as const,
};

describe('Auth Validations', () => {
  describe('loginSchema', () => {
    it('accepts valid credentials', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' });
      expect(result.success).toBe(true);
    });

    it('rejects empty email', () => {
      const result = loginSchema.safeParse({ email: '', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({ email: 'notanemail', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects password under 8 chars', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com', password: 'short' });
      expect(result.success).toBe(false);
    });
  });

  describe('signupSchema', () => {
    it('accepts valid signup data', () => {
      const result = signupSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('rejects mismatched passwords', () => {
      const result = signupSchema.safeParse({ ...validSignup, confirmPassword: 'Different123' });
      expect(result.success).toBe(false);
    });

    it('rejects empty first name', () => {
      const result = signupSchema.safeParse({ ...validSignup, firstName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects empty last name', () => {
      const result = signupSchema.safeParse({ ...validSignup, lastName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = signupSchema.safeParse({ ...validSignup, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('rejects a password under 8 characters (weak password)', () => {
      const result = signupSchema.safeParse({ ...validSignup, password: 'Pass1', confirmPassword: 'Pass1' });
      expect(result.success).toBe(false);
    });

    it('rejects a password with no uppercase letter (weak password)', () => {
      const result = signupSchema.safeParse({ ...validSignup, password: 'password123', confirmPassword: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects a password with no digit (weak password)', () => {
      const result = signupSchema.safeParse({ ...validSignup, password: 'PasswordOnly', confirmPassword: 'PasswordOnly' });
      expect(result.success).toBe(false);
    });

    it('rejects signup without accepting terms', () => {
      const result = signupSchema.safeParse({ ...validSignup, acceptTerms: false });
      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('accepts a strong matching password pair', () => {
      const result = resetPasswordSchema.safeParse({ password: 'NewPassword123', confirmPassword: 'NewPassword123' });
      expect(result.success).toBe(true);
    });

    it('rejects mismatched passwords', () => {
      const result = resetPasswordSchema.safeParse({ password: 'NewPassword123', confirmPassword: 'Other12345' });
      expect(result.success).toBe(false);
    });

    it('rejects a weak password', () => {
      const result = resetPasswordSchema.safeParse({ password: 'weak', confirmPassword: 'weak' });
      expect(result.success).toBe(false);
    });
  });
});
