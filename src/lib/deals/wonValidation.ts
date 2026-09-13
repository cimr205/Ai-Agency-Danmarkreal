// Shared between the Board/List/Calendar deal views and the deal detail
// sheet — extracted so the "can this deal be marked won" rule and its
// error copy can't drift between views the way it did when Pipeline and
// Deals were separate pages.

export function canMarkDealWon(deal?: { customer_id?: string | null; expected_close_date?: string | null } | null): boolean {
  return Boolean(deal?.customer_id && deal?.expected_close_date);
}

export function getWonValidationMessage(locale: string): string {
  return locale === 'da'
    ? 'Tilknyt en kunde og vælg forventet lukkedato, før dealen kan markeres som vundet.'
    : locale === 'de'
      ? 'Verknüpfe zuerst einen Kunden und ein erwartetes Abschlussdatum, bevor der Deal gewonnen werden kann.'
      : 'Link a customer and set an expected close date before marking the deal as won.';
}

// The update_deal_stage RPC (see useUpdateDealStage) reports `changed`
// server-side (old stage vs new stage, row-locked), so this is the only
// place that decides whether to fire the outbound deal.won/deal.lost
// webhook — a no-op re-save (double submit, retry on an already-won deal)
// never produces one, unlike the raw `.update()` + unconditional
// fireWebhookEvent call it replaces.
export function stageWebhookEvent(data: { changed: boolean; stage: string }): 'deal.won' | 'deal.lost' | null {
  if (!data.changed) return null;
  if (data.stage === 'won') return 'deal.won';
  if (data.stage === 'lost') return 'deal.lost';
  return null;
}
