// Mirrors public.normalize_phone_number() in the database — same recognized
// shapes, same "return null rather than a guess" rule so an unparseable
// number never gets stored as garbage (#008) or treated as a real contact.
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;

  const digits = phone.replace(/[^0-9+]/g, "");

  if (/^\+[0-9]{8,15}$/.test(digits)) return digits;
  if (/^00[0-9]{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^[0-9]{8}$/.test(digits)) return `+45${digits}`;

  return null;
}
