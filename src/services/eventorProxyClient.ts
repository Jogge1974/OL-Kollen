import { getSupabaseConfig } from '@/src/services/env';
import { ensureAnonymousSession } from '@/src/services/supabase';

/**
 * Phase 1 client for the server-side eventor-proxy, so shared Eventor endpoints
 * (events, competitorcount, organisations) can be fetched WITHOUT shipping the
 * Eventor API key in the app. Returns the Eventor XML string.
 *
 * Not yet wired into eventorApi.ts — while the app is in mapping mode the direct
 * Eventor calls there are disabled anyway. Rewiring is the next Phase 1 step.
 */
export type EventorProxyEndpoint =
  | 'events'
  | 'competitorcount'
  | 'organisations'
  | 'eventclasses'
  | 'events_documents'
  | 'event'
  | 'starts_person'
  | 'results_person'
  | 'entries'
  | 'starts_event'
  | 'results_event'
  | 'activities'
  | 'persons_organisations';

export async function fetchViaEventorProxy(endpoint: EventorProxyEndpoint, params: Record<string, unknown> = {}): Promise<string> {
  const { publishableKey, url } = getSupabaseConfig();
  if (!url || !publishableKey) {
    throw new Error('Supabase är inte konfigurerat i appens miljövariabler.');
  }

  // The proxy requires a real (anonymous) user JWT so it can rate-limit per
  // identity; fall back to the publishable key only if sign-in is unavailable.
  const accessToken = (await ensureAnonymousSession()) ?? publishableKey;

  const response = await fetch(`${url}/functions/v1/eventor-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ endpoint, params }),
  });

  const data = (await response.json().catch(() => ({}))) as { xml?: string; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || `eventor-proxy svarade med ${response.status}.`);
  }

  return data.xml ?? '';
}
