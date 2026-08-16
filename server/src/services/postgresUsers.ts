import { Pool } from 'pg';

export interface PostgresUserRecord {
  id: string;
  name?: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: string;
  role: 'admin' | 'user';
  companyId?: string;
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

export async function ensureUsersTable() {
  const db = getPool();
  if (!db) {
    console.warn('Postgres sync skipped: DATABASE_URL not set.');
    return false;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified_at TEXT,
      role TEXT NOT NULL,
      company_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return true;
}

export async function upsertUser(user: PostgresUserRecord) {
  const db = getPool();
  if (!db) return;
  await db.query(
    `
    INSERT INTO app_users (
      id,
      name,
      email,
      password_hash,
      email_verified_at,
      role,
      company_id,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      email_verified_at = EXCLUDED.email_verified_at,
      role = EXCLUDED.role,
      company_id = EXCLUDED.company_id,
      created_at = EXCLUDED.created_at;
    `,
    [
      user.id,
      user.name || null,
      user.email,
      user.passwordHash,
      user.emailVerifiedAt || null,
      user.role,
      user.companyId || null,
      user.createdAt,
    ]
  );
}

export async function syncUsers(users: PostgresUserRecord[]) {
  const enabled = await ensureUsersTable();
  if (!enabled) return;
  console.log(`Postgres sync: syncing ${users.length} users to app_users`);
  for (const user of users) {
    await upsertUser(user);
  }
  console.log('Postgres sync: complete');
}

