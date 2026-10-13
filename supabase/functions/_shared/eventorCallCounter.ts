// Shared Eventor API call counter for Supabase edge functions / cron pollers
// (Deno runtime). While the Eventor API key is revoked we comment out the real
// network calls and instead append one row per call site invocation to
// public.eventor_api_call_log, so the request volume can be mapped per minute /
// per source without hitting Eventor.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!url || !serviceRoleKey) {
    return null;
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}

/**
 * Records that an Eventor API call *would* have been made from an edge function
 * or cron poller. `source` is the poller / helper name, `endpoint` the Eventor
 * path when known. Never throws — counting must not break a poller run.
 */
export async function recordEventorApiCall(source: string, endpoint?: string): Promise<void> {
  try {
    const client = getServiceClient();
    if (!client) {
      return;
    }

    await client
      .from('eventor_api_call_log')
      .insert({ origin: 'edge', source, endpoint: endpoint ?? null });
  } catch (_error) {
    // Ignore — counting must never break the poller.
  }
}
