/**
 * Whether a company may use the app. An active subscription always may, and so
 * may any company whose trial has not ended, however that trial was granted.
 * A 'trialing' status alone proves nothing: Stripe's end date decides.
 */
export function hasSubscriptionAccess(
  status: string | null,
  trialEndsAt: string | null,
  now: number = Date.now(),
): boolean {
  if (status === 'active') return true;
  return !!trialEndsAt && new Date(trialEndsAt).getTime() > now;
}
