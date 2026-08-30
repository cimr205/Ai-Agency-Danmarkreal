import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Device Power Dialer architecture contracts', () => {
  it('keeps the device dialer independent from Twilio and manual keypad calling', () => {
    const page = repoFile('src/pages/app/marketing/ColdCallerPage.tsx');
    const hook = repoFile('src/hooks/api/usePowerDialer.ts');

    expect(`${page}\n${hook}`).not.toMatch(/twilio|keypad|make-call|buy-number/i);
    expect(page).toContain('getTelephoneUri');
    expect(page).toContain('useLeads');
  });

  it('keeps AI Voice Agent telephony on a separate function boundary', () => {
    const page = repoFile('src/pages/app/marketing/VoiceAgentPage.tsx');
    const hook = repoFile('src/hooks/api/useVoiceTelephony.ts');

    expect(page).toContain('useVoiceTelephonyAccount');
    expect(hook).toContain('supabase.functions.invoke("voice-telephony"');
    expect(hook).not.toContain('cold-caller');
  });

  it('uses an additive tenant-isolated migration and synchronizes lead workflow fields', () => {
    const migration = repoFile('supabase/migrations/20260830000001_device_power_dialer.sql');

    expect(migration).toMatch(/create table public\.power_dialer_calls/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toContain('get_user_company_id(auth.uid())');
    expect(migration).toContain("record_type = 'lead'");
    expect(migration).toContain('next_followup_at');
    expect(migration).toContain('last_touched_at');
    expect(migration).not.toMatch(/\b(drop|truncate)\b|delete\s+from/i);
  });
});
