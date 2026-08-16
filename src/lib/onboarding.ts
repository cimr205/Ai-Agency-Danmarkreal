const ONBOARDING_KEY = 'onboarding_complete';

export function markOnboardingComplete(_tenantId?: string): void {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}
