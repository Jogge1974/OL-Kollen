import { getSupabaseClient } from '@/src/services/supabase';

/**
 * Records that an Eventor API call *would* have been made from the app, while the
 * real network call is disabled (API key revoked / rate-limit mapping mode).
 *
 * Fire-and-forget: never awaited and never throws, so call-counting can never
 * slow down or break the calling screen. The `source` is the API function name,
 * `endpoint` is the Eventor path when known.
 */
export function recordEventorApiCall(source: string, endpoint?: string): void {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    client
      .from('eventor_api_call_log')
      .insert({ origin: 'app', source, endpoint: endpoint ?? null })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // Counting must never affect app behaviour.
  }
}
