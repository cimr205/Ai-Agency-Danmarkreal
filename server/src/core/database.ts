import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { ServiceUnavailableError } from './serviceUnavailable';

if (!env.databaseUrl) {
  console.log('DATABASE_URL is not set. Database-backed routes will return 503 until configured.');
}

const useSsl = env.databaseUrl && !env.databaseUrl.includes('localhost') && !env.databaseUrl.includes('127.0.0.1');

export const pool: Pool | null = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    })
  : null;

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  if (!pool) {
    throw new ServiceUnavailableError('Database is not configured (missing DATABASE_URL).');
  }
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  if (!pool) {
    throw new ServiceUnavailableError('Database is not configured (missing DATABASE_URL).');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
