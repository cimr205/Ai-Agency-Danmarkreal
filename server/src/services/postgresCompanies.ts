import { Pool } from 'pg';

export interface PostgresCompanyRecord {
  id: string;
  name: string;
  ownerUserId?: string;
  userLimit?: number;
  joinCode: string;
  defaultLanguage: string;
  defaultTheme: 'light' | 'dark';
  createdAt: string;
}

let pool: Pool | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const useSsl =
      process.env.DATABASE_SSL === 'true' ||
      /railway|rlwy|render|heroku/i.test(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function ensureCompaniesTable() {
  const db = getPool();
  if (!db) {
    console.warn('Postgres company sync skipped: DATABASE_URL not set.');
    return false;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      user_limit INTEGER,
      join_code TEXT NOT NULL,
      default_language TEXT NOT NULL,
      default_theme TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return true;
}

export async function upsertCompany(company: PostgresCompanyRecord) {
  const db = getPool();
  if (!db) return;
  await db.query(
    `
    INSERT INTO app_companies (
      id,
      name,
      owner_user_id,
      user_limit,
      join_code,
      default_language,
      default_theme,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      owner_user_id = EXCLUDED.owner_user_id,
      user_limit = EXCLUDED.user_limit,
      join_code = EXCLUDED.join_code,
      default_language = EXCLUDED.default_language,
      default_theme = EXCLUDED.default_theme,
      created_at = EXCLUDED.created_at;
    `,
    [
      company.id,
      company.name,
      company.ownerUserId || null,
      company.userLimit ?? null,
      company.joinCode,
      company.defaultLanguage,
      company.defaultTheme,
      company.createdAt,
    ]
  );
}

export async function syncCompanies(companies: PostgresCompanyRecord[]) {
  const enabled = await ensureCompaniesTable();
  if (!enabled) return;
  console.log(`Postgres sync: syncing ${companies.length} companies to app_companies`);
  for (const company of companies) {
    await upsertCompany(company);
  }
  console.log('Postgres company sync: complete');
}

