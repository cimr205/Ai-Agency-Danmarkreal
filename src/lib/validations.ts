import { z } from 'zod';

/** Contact form — public endpoint, strict validation */
export const contactFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().email('Invalid email').max(255, 'Email too long'),
  phone: z.string().trim().max(20, 'Phone too long').optional().or(z.literal('')),
  message: z.string().trim().min(1, 'Message is required').max(1000, 'Message too long (max 1000 chars)'),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

/** Auth forms */
export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** At least one lowercase, one uppercase, one digit — enforced on top of the 8-char minimum. */
export const strongPasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255),
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  acceptTerms: z.literal(true, { message: 'You must accept the terms to continue' }),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
