/**
 * Zod issue messages are raw English strings. Map the ones used by the auth
 * forms to translation keys instead of leaking English into a Danish/German UI.
 */
const MESSAGE_KEYS: Record<string, string> = {
  'First name is required': 'auth.firstNameRequired',
  'Last name is required': 'auth.lastNameRequired',
  'Invalid email': 'auth.invalidEmail',
  'Password must be at least 8 characters': 'auth.passwordMinLength',
  'Password must contain a lowercase letter': 'auth.passwordNeedsLowercase',
  'Password must contain an uppercase letter': 'auth.passwordNeedsUppercase',
  'Password must contain a number': 'auth.passwordNeedsNumber',
  'Please confirm your password': 'auth.confirmPasswordRequired',
  'You must accept the terms to continue': 'auth.mustAcceptTerms',
  'Passwords do not match': 'auth.passwordsNoMatch',
};

export function describeValidationError(message: string, t: (key: string) => string): string {
  const key = MESSAGE_KEYS[message];
  return key ? t(key) : message;
}
