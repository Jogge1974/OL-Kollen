import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { getSupabaseConfig } from '@/src/services/env';

let cachedClient: SupabaseClient | null = null;

// SecureStore caps each value at ~2048 bytes; a Supabase session (access +
// refresh JWTs) can exceed that, so we transparently chunk large values.
const SECURE_STORE_CHUNK_SIZE = 1800;

const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(key);
    if (meta == null) return null;
    if (!meta.startsWith('__chunks__:')) return meta;
    const count = Number.parseInt(meta.slice('__chunks__:'.length), 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    let out = '';
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);
    if (value.length <= SECURE_STORE_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      const part = value.slice(i * SECURE_STORE_CHUNK_SIZE, (i + 1) * SECURE_STORE_CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}.${i}`, part);
    }
    await SecureStore.setItemAsync(key, `__chunks__:${count}`);
  },
  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

async function removeChunks(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(key);
  if (meta == null || !meta.startsWith('__chunks__:')) return;
  const count = Number.parseInt(meta.slice('__chunks__:'.length), 10);
  if (!Number.isFinite(count) || count <= 0) return;
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

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
      storage: chunkedSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

let anonSignInPromise: Promise<string | null> | null = null;

/**
 * Ensures there is a Supabase session (anonymous if the user hasn't otherwise
 * signed in), giving the app a stable identity for the eventor-proxy rate limit.
 * Returns the current access token, or null if Supabase isn't configured.
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  if (!anonSignInPromise) {
    anonSignInPromise = (async () => {
      try {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) {
          console.warn('[supabase] Anonym inloggning misslyckades:', error.message);
          return null;
        }
        return data.session?.access_token ?? null;
      } finally {
        anonSignInPromise = null;
      }
    })();
  }

  return anonSignInPromise;
}

/** Current access token if a session exists, otherwise null (no sign-in attempt). */
export async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
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
