import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from '@/src/services/env';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseRuntimeConfig() {
  return getSupabaseConfig();
}

export function hasSupabaseRuntimeConfig() {
  const config = getSupabaseRuntimeConfig();
  return Boolean(config.url && config.publishableKey);
}

export function getSupabaseClient() {
  if (!hasSupabaseRuntimeConfig()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const config = getSupabaseRuntimeConfig();

  cachedClient = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

export async function invokeSupabaseFunction<TResponse>(name: string, body: Record<string, unknown>) {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error('Supabase är inte konfigurerat i appens miljövariabler.');
  }

  const { data, error } = await client.functions.invoke<TResponse>(name, {
    body,
  });

  if (error) {
    throw new Error(error.message || `Supabase-funktionen ${name} kunde inte köras.`);
  }

  return data;
}
