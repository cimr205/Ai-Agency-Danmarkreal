import { t3 } from '@/lib/inlineI18n';

// workspace_events.type is a machine code (lead.status_changed) — never show it as-is.
const LABELS: Record<string, [da: string, en: string, de: string]> = {
  'lead.created': ['Nyt lead', 'New lead', 'Neuer Lead'],
  'lead.updated': ['Lead opdateret', 'Lead updated', 'Lead aktualisiert'],
  'lead.status_changed': ['Leadstatus ændret', 'Lead status changed', 'Lead-Status geändert'],
  'deal.created': ['Ny deal', 'New deal', 'Neuer Deal'],
  'deal.updated': ['Deal opdateret', 'Deal updated', 'Deal aktualisiert'],
  'deal.won': ['Deal vundet', 'Deal won', 'Deal gewonnen'],
  'deal.lost': ['Deal tabt', 'Deal lost', 'Deal verloren'],
  'deal.stage_changed': ['Dealfase ændret', 'Deal stage changed', 'Deal-Phase geändert'],
  'invoice.created': ['Faktura oprettet', 'Invoice created', 'Rechnung erstellt'],
  'invoice.paid': ['Faktura betalt', 'Invoice paid', 'Rechnung bezahlt'],
  'payment.received': ['Betaling modtaget', 'Payment received', 'Zahlung erhalten'],
  'task.created': ['Opgave oprettet', 'Task created', 'Aufgabe erstellt'],
  'task.completed': ['Opgave fuldført', 'Task completed', 'Aufgabe erledigt'],
  'meeting.booked': ['Møde booket', 'Meeting booked', 'Termin gebucht'],
};

export function workspaceEventLabel(type: string): string {
  const label = LABELS[type];
  if (label) return t3(label[0], label[1], label[2]);
  const words = type.replace(/[._]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "name: from → to", without printing "null" for a record's first status. */
export function statusChangeSummary(name: unknown, from: unknown, to: unknown): string {
  const change = [from, to].filter((v) => v !== null && v !== undefined && v !== '').join(' → ');
  return [name, change].filter(Boolean).join(': ');
}

/** Readable text for an arbitrary payload value — no raw JSON in the UI. */
export function payloadValueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(payloadValueText).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key.replace(/_/g, ' ')}: ${payloadValueText(entry)}`)
      .join(' · ');
  }
  return String(value);
}
