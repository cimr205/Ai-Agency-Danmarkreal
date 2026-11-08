// Shared between the Board/List/Calendar deal views and the deal detail
// sheet — extracted so the "can this deal be marked won" rule and its
// error copy can't drift between views the way it did when Pipeline and
// Deals were separate pages.

type WonCheckDeal = { customer_id?: string | null; expected_close_date?: string | null; created_at?: string | null };

// A close date before the deal even existed (e.g. 2020-01-01 on a deal
// created in 2026) is a typo, not a real close — don't let it be won with it.
function closeDateBeforeCreation(deal: WonCheckDeal): boolean {
  if (!deal.expected_close_date || !deal.created_at) return false;
  return deal.expected_close_date < deal.created_at.slice(0, 10);
}

export function canMarkDealWon(deal?: WonCheckDeal | null): boolean {
  return Boolean(deal?.customer_id && deal?.expected_close_date && !closeDateBeforeCreation(deal));
}

export function getWonValidationMessage(locale: string, deal?: WonCheckDeal | null): string {
  if (deal && deal.customer_id && deal.expected_close_date && closeDateBeforeCreation(deal)) {
    return locale === 'da'
      ? 'Den forventede lukkedato ligger før dealen blev oprettet. Ret datoen, før dealen kan markeres som vundet.'
      : locale === 'de'
        ? 'Das erwartete Abschlussdatum liegt vor der Erstellung des Deals. Korrigiere das Datum, bevor der Deal gewonnen werden kann.'
        : 'The expected close date is before the deal was created. Fix the date before marking the deal as won.';
  }
  return locale === 'da'
    ? 'Tilknyt en kunde og vælg forventet lukkedato, før dealen kan markeres som vundet.'
    : locale === 'de'
      ? 'Verknüpfe zuerst einen Kunden und ein erwartetes Abschlussdatum, bevor der Deal gewonnen werden kann.'
      : 'Link a customer and set an expected close date before marking the deal as won.';
}
