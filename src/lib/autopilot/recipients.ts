// AI drafts sometimes fill in a placeholder recipient ("leverandør@firma.dk").
// Approving would send to a made-up or foreign address, so block those.
const PLACEHOLDER_DOMAINS = /@(example\.(com|org|net|dk)|firma\.dk|virksomhed\.dk|eksempel\.dk|domain\.(com|dk)|domæne\.dk|test\.(com|dk)|email\.(com|dk)|company\.com)$/i;
const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export function invalidRecipient(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  for (const [key, value] of Object.entries(payload)) {
    if (!/^(to|to_email|recipient|recipient_email|email|cc|bcc)$/i.test(key)) continue;
    const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;]/);
    for (const raw of list) {
      const addr = String(raw).trim();
      if (!addr) continue;
      if (!VALID_EMAIL.test(addr) || PLACEHOLDER_DOMAINS.test(addr)) return addr;
    }
  }
  return null;
}
