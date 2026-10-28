// Many components translate inline with `locale === 'da' ? '…' : '…'`, which
// silently gave German users the English text. `tl()` keeps those call sites
// readable while adding the German wording in one place. New UI strings
// should still go through useI18n() keys in src/messages/*.json.
import type { Locale } from '@/lib/i18n';

const DE: Record<string, string> = {
  'Contact linked': 'Kontakt verknüpft',
  'Link a contact...': 'Kontakt verknüpfen...',
  'AI Meeting Summary': 'KI-Meeting-Zusammenfassung',
  'All-in-one workspace': 'All-in-one-Workspace',
  'About': 'Über uns',
  'Your business.\nOne system.': 'Dein Unternehmen.\nEin System.',
  'CRM, HR, invoicing, marketing, AI, tasks,\ncalendar and email in one platform.': 'CRM, HR, Rechnungen, Marketing, KI, Aufgaben,\nKalender und E-Mail auf einer Plattform.',
  'The Problem': 'Das Problem',
  'The Solution': 'Die Lösung',
  'Everything Included': 'Alles inklusive',
  'One price. All modules. No hidden fees.': 'Ein Preis. Alle Module. Keine versteckten Gebühren.',
  'Why Us?': 'Warum wir?',
  'Simple and transparent pricing': 'Einfache und transparente Preise',
  'per user / month': 'pro Nutzer / Monat',
  'Everything included. No commitment. No hidden fees.': 'Alles inklusive. Keine Bindung. Keine versteckten Gebühren.',
  'Ready to simplify\nyour business?': 'Bereit, dein Unternehmen\nzu vereinfachen?',
  'Start today and experience the difference from day one.': 'Starte heute und erlebe den Unterschied vom ersten Tag an.',
  'Get started now →': 'Jetzt starten →',
  'Contact': 'Kontakt',
  'No CRM match': 'Kein CRM-Treffer',
  'Create at least one customer before creating a deal': 'Lege mindestens einen Kunden an, bevor du einen Deal erstellst',
  'Customer is required': 'Kunde ist erforderlich',
  'Expected close date is required': 'Erwartetes Abschlussdatum ist erforderlich',
  'Select customer': 'Kunde wählen',
  'You need to create a customer before a deal can be saved.': 'Du musst zuerst einen Kunden anlegen, bevor ein Deal gespeichert werden kann.',
  'Add next steps, objections, and context...': 'Nächste Schritte, Einwände und Kontext hinzufügen...',
  'Download Invoice PDF': 'Rechnungs-PDF herunterladen',
  'Choose invoice design': 'Rechnungsdesign wählen',
  'Find lead': 'Lead finden',
  'Search a lead to invoice…': 'Lead für die Rechnung suchen…',
  'Search name, email, company…': 'Name, E-Mail, Firma suchen…',
  'No leads found': 'Keine Leads gefunden',
  'Picking a lead auto-creates a customer.': 'Bei Auswahl eines Leads wird automatisch ein Kunde angelegt.',
  'Search client…': 'Kunde suchen…',
  'No clients found': 'Keine Kunden gefunden',
  'Phone': 'Telefon',
  'optional': 'optional',
  'Address': 'Adresse',
  'Main St 1, 1000 Copenhagen': 'Hauptstraße 1, 1000 Kopenhagen',
  'Confirm the customer below before you can continue to invoice lines.': 'Bestätige unten den Kunden, bevor du zu den Rechnungspositionen weitergehst.',
  'Open Stripe payment': 'Stripe-Zahlung öffnen',
  'PDF attached as link': 'PDF als Link angehängt',
  'PDF Template': 'PDF-Vorlage',
  'Quote': 'Angebot',
  'All emails verified ✓': 'Alle E-Mails verifiziert ✓',
  'Choose a time in the future': 'Wähle einen Zeitpunkt in der Zukunft',
  'Missing company context': 'Unternehmenskontext fehlt',
  'Analytics': 'Analysen',
  'Verifying emails via SMTP...': 'E-Mails werden per SMTP verifiziert...',
  'verified': 'verifiziert',
  'unchecked': 'ungeprüft',
  'invalid': 'ungültig',
  'Remove invalid': 'Ungültige entfernen',
  'Fill in subject and body first': 'Fülle zuerst Betreff und Text aus',
  'No email found': 'Keine E-Mail gefunden',
  'Send test to me': 'Test an mich senden',
  'Verify emails': 'E-Mails verifizieren',
  'valid': 'gültig',
};

export function tl(locale: Locale | string, da: string, en: string): string {
  if (locale === 'da') return da;
  if (locale === 'de') return DE[en] ?? en;
  return en;
}
