// Gmail headers are stored as raw comma-split strings (e.g. '"Jane Doe" <jane@x.com>')
// by gmail-sync — this pulls just the address portion for building reply-all recipient lists.
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

export function buildReplyAllCc(toAddresses: string[], ccAddresses: string[], fromAddress: string, ownAddress: string | undefined): string {
  const exclude = new Set([fromAddress.toLowerCase(), (ownAddress || '').toLowerCase()].filter(Boolean));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...toAddresses, ...ccAddresses]) {
    const addr = extractEmailAddress(raw);
    if (!addr || exclude.has(addr) || seen.has(addr)) continue;
    seen.add(addr);
    result.push(addr);
  }
  return result.join(', ');
}
