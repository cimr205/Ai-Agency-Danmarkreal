import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { ServiceUnavailableError } from './serviceUnavailable';

type SupabaseClient = ReturnType<typeof createClient>;

const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey);

if (!hasSupabaseConfig) {
  console.log('Supabase env vars missing: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
}

function createMissingClient(clientName: 'supabaseAnon' | 'supabaseAdmin', reason: string): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new ServiceUnavailableError(`Supabase client ${clientName} is unavailable (${reason}).`);
    },
  });
}

function createSupabaseClientOrFallback(
  clientName: 'supabaseAnon' | 'supabaseAdmin',
  key: string
): SupabaseClient {
  if (!hasSupabaseConfig) {
    return createMissingClient(clientName, 'missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  }

  try {
    return createClient(env.supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Supabase client ${clientName} init failed: ${message}`);
    return createMissingClient(clientName, `invalid Supabase configuration: ${message}`);
  }
}

export const supabaseAnon: SupabaseClient = createSupabaseClientOrFallback('supabaseAnon', env.supabaseAnonKey);

export const supabaseAdmin: SupabaseClient = createSupabaseClientOrFallback(
  'supabaseAdmin',
  env.supabaseServiceRoleKey
);
