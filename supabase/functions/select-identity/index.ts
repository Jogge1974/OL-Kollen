import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// select-identity
//
// There is no password login against Eventor any more — the app lets a device
// pick "who am I" from the public person directory (see person-search) and
// records that choice here, one row per device_id (overwritten on every new
// choice). Mirrors the simple, no-JWT-check pattern used by push-sync.
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      clubName?: string | null;
      deviceId?: string;
      organisationId?: string | null;
      personId?: string;
      username?: string;
    };

    const deviceId = (body.deviceId ?? '').trim();
    const personId = (body.personId ?? '').trim();
    const username = (body.username ?? '').trim();

    if (!deviceId || !personId || !username) {
      return json({ error: 'deviceId, personId och username krävs.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.from('device_identities').upsert(
      {
        club_name: body.clubName ?? null,
        device_id: deviceId,
        organisation_id: body.organisationId ?? null,
        person_id: personId,
        updated_at: new Date().toISOString(),
        username,
      },
      { onConflict: 'device_id' },
    );

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return json({ error: message }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
