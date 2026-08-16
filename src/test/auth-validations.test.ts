import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema } from '@/lib/validations';

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
      const result = signupSchema.safeParse({
        fullName: 'John Smith',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mismatched passwords', () => {
      const result = signupSchema.safeParse({
        fullName: 'John Smith',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'different123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty full name', () => {
      const result = signupSchema.safeParse({
        fullName: '',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });
      expect(result.success).toBe(false);
    });
  });
});
