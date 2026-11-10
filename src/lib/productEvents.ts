import { supabase } from '@/integrations/supabase/client';

export type ProductEvent =
  | 'onboarding_started'
  | 'company_created'
  | 'subscription_activated'
  | 'onboarding_completed'
  | 'first_value_action_completed';

/**
 * Fire-and-forget activation event log. No PII: only IDs and a closed
 * event-name set (enforced by the table's own CHECK constraint, not just
 * the type here).
 */
export async function logProductEvent(eventName: ProductEvent, companyId?: string | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('product_events').insert({
      event_name: eventName,
      company_id: companyId ?? null,
      user_id: user.id,
    });
  } catch {
    // Analytics must never break the calling flow.
  }
}

/**
 * Logs 'first_value_action_completed' at most once per company — checks
 * for an existing row before inserting. Accepts a small race window
 * (two near-simultaneous first actions could both pass the check) as an
 * acceptable tradeoff for activation analytics, not billing-critical data.
 */
export async function logFirstValueActionOnce(companyId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('product_events')
      .select('id')
      .eq('company_id', companyId)
      .eq('event_name', 'first_value_action_completed')
      .limit(1);
    if (data && data.length > 0) return;
    await logProductEvent('first_value_action_completed', companyId);
  } catch {
    // Analytics must never break the calling flow.
  }
}
