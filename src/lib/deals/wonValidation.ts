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
