// employee_profiles.employee_id is UNIQUE across ALL companies
// (employee_profiles_employee_id_key), but RLS only lets a company see its own
// rows. A per-company counter like "EMP-001" therefore collides with whichever
// company took that number first, and the insert fails with 23505.
// Generate a random ID instead (same shape as the DB's generate_employee_id)
// and retry on the rare collision.

// Crockford-style alphabet: no I, L, O, U, so IDs are easy to read aloud.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 6; // 32^6 ≈ 1.07 billion combinations

export const EMPLOYEE_ID_PATTERN = /^EMP-[0-9A-HJKMNP-TV-Z]{6}$/;
export const EMPLOYEE_ID_ATTEMPTS = 5;

export function generateEmployeeId(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  return `EMP-${out}`;
}

/** True when a Postgres error is the employee_id unique violation (worth retrying with a new ID). */
export function isEmployeeIdConflict(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error || error.code !== '23505') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  return /employee_id/.test(text);
}
