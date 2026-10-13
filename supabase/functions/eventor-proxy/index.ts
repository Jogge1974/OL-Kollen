import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// eventor-proxy (Phase 1)
//
// A server-side proxy so the Eventor API key never ships in the app. The app
// POSTs { endpoint, params }; the proxy validates the endpoint against a
// whitelist, serves from a TTL cache when possible, and otherwise makes ONE
// Eventor call (with the server-side key) that every other user then reuses via
// the cache. Only shared, high-volume endpoints are proxied in this phase.
//
// Mapping mode has ended: a cache miss now makes a real Eventor call (with the
// server-side EVENTOR_API_KEY) that every other user then reuses via the
// cache. A cache hit logs nothing — so the log shows how much the cache saves.
//
// Auth is a real per-user (anonymous Supabase session) JWT + rate limit — see
// below.
// ---------------------------------------------------------------------------

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

// Per-user request budget (fixed window). Generous enough for browsing a friend
// detail view (~14 calls) yet low enough to stop scripted abuse.
const RATE_LIMIT_MAX = 300;
const RATE_LIMIT_WINDOW_SECONDS = 60;

type WhitelistEntry = { basePath: string; allowedParams: string[]; ttlSeconds: number; pathParam?: string; noCache?: boolean };

const WHITELIST: Record<string, WhitelistEntry> = {
  events: { basePath: '/events', allowedParams: ['fromDate', 'toDate'], ttlSeconds: 600 },
  competitorcount: { basePath: '/competitorcount', allowedParams: ['eventIds', 'organisationIds'], ttlSeconds: 180 },
  organisations: { basePath: '/organisations', allowedParams: [], ttlSeconds: 86400 },
  eventclasses: { basePath: '/eventclasses', allowedParams: ['eventId'], ttlSeconds: 3600 },
  events_documents: { basePath: '/events/documents', allowedParams: ['eventIds'], ttlSeconds: 3600 },
  event: { basePath: '/event', pathParam: 'eventId', allowedParams: [], ttlSeconds: 600 },
  starts_person: { basePath: '/starts/person', allowedParams: ['personId', 'fromDate', 'toDate', 'includeOrganisationElement', 'includePersonElement'], ttlSeconds: 45 },
  results_person: { basePath: '/results/person', allowedParams: ['personId', 'fromDate', 'toDate', 'includeOrganisationElement', 'includePersonElement'], ttlSeconds: 45 },
  entries: { basePath: '/entries', allowedParams: ['eventIds', 'personIds', 'organisationIds', 'includeEventElement', 'includeOrganisationElement', 'includePersonElement', 'fromEventDate', 'toEventDate'], ttlSeconds: 120 },
  starts_event: { basePath: '/starts/event/iofxml', allowedParams: ['eventId', 'eventRaceId'], ttlSeconds: 60 },
  // Split times / full result lists can be very large (tens of MB); never cache them.
  results_event: { basePath: '/results/event/iofxml', allowedParams: ['eventId', 'eventRaceId', 'includeOrganisationElement', 'includePersonElement', 'includeSplitTimes'], ttlSeconds: 0, noCache: true },
  activities: { basePath: '/activities', allowedParams: ['organisationId', 'from', 'to', 'includeRegistrations'], ttlSeconds: 300 },
  persons_organisations: { basePath: '/persons/organisations', pathParam: 'organisationId', allowedParams: [], ttlSeconds: 86400 },
};

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) {
    return null;
  }
  cachedClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cachedClient;
}

/** Build the Eventor path from ONLY the whitelisted params (never relays arbitrary input). */
function buildPath(entry: WhitelistEntry, params: Record<string, unknown>): string | null {
  let base = entry.basePath;
  if (entry.pathParam) {
    const value = params[entry.pathParam];
    if (value === undefined || value === null || `${value}` === '') {
      return null; // required path segment missing
    }
    base = `${entry.basePath}/${encodeURIComponent(`${value}`)}`;
  }
  const search = new URLSearchParams();
  for (const key of entry.allowedParams) {
    const value = params[key];
    if (value !== undefined && value !== null && `${value}` !== '') {
      search.set(key, `${value}`);
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

async function logEventorCall(client: SupabaseClient, source: string, endpoint: string) {
  try {
    await client.from('eventor_api_call_log').insert({ origin: 'proxy', source, endpoint });
  } catch (_error) {
    // Counting must never break the proxy.
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Placeholder caller auth (shared secret). Replace with per-user auth in Phase 2/3.
    const proxySecret = Deno.env.get('PROXY_SECRET');
    if (proxySecret && request.headers.get('x-proxy-secret') !== proxySecret) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Use POST.' }, 405);
    }

    const client = getServiceClient();
    if (!client) {
      return json({ error: 'Server not configured.' }, 500);
    }

    // Per-user auth (anonymous Supabase session) + rate limit — stops the proxy
    // from being an open Eventor gateway if the publishable key leaks.
    const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await client.auth.getUser(jwt) : { data: { user: null } };
    if (!user) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    const { data: allowed } = await client.rpc('proxy_rate_limit_hit', {
      p_identity: user.id,
      p_limit: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (allowed === false) {
      return json({ error: 'Rate limit exceeded. Försök igen om en stund.' }, 429);
    }

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string; params?: Record<string, unknown> };
    const endpoint = body.endpoint ?? '';
    const params = body.params ?? {};

    const entry = WHITELIST[endpoint];
    if (!entry) {
      return json({ error: `Endpoint '${endpoint}' is not allowed.` }, 400);
    }

    const path = buildPath(entry, params);
    if (!path) {
      return json({ error: `Missing required parameter for '${endpoint}'.` }, 400);
    }
    const cacheKey = path;

    // 1. Serve from cache when a fresh entry exists (skipped for no-cache endpoints).
    if (!entry.noCache) {
      const { data: cached } = await client
        .from('eventor_proxy_cache')
        .select('payload, expires_at')
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return json({ xml: cached.payload, cached: true });
      }
    }

    // 2. Cache miss → this is where a real Eventor call happens. Count it.
    await logEventorCall(client, `eventor-proxy:${endpoint}`, path);

    const apiKey = Deno.env.get('EVENTOR_API_KEY');
    if (!apiKey) {
      return json({ error: 'Missing EVENTOR_API_KEY.' }, 500);
    }
    const response = await fetch(`${EVENTOR_BASE_URL}${path}`, {
      headers: { ApiKey: apiKey, Accept: 'application/xml' },
    });
    const xml = await response.text();
    if (!response.ok) {
      return json({ error: `Eventor ${path} → ${response.status}` }, 502);
    }

    // 3. Store in cache with the endpoint's TTL (skipped for no-cache endpoints).
    if (!entry.noCache) {
      try {
        await client
          .from('eventor_proxy_cache')
          .upsert(
            {
              cache_key: cacheKey,
              endpoint,
              payload: xml,
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + entry.ttlSeconds * 1000).toISOString(),
            },
            { onConflict: 'cache_key' },
          );
      } catch (_error) {
        // A cache write failure must not fail the response.
      }
    }

    return json({ xml, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error.';
    return json({ error: message }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
