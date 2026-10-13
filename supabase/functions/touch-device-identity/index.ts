import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// touch-device-identity
//
// Called once per app launch so every device gets a device_identities row —
// even one that never picks a person — giving an accurate device/install
// count and a real "last seen" (updated_at) to prune stale rows by later.
// Only inserts/touches updated_at; never overwrites an existing selection
// (person_id/username/organisation_id/club_name), which select-identity owns.
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
    const deviceId = (body.deviceId ?? '').trim();

    if (!deviceId) {
      return json({ error: 'deviceId krävs.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Only device_id + updated_at are in the payload, so on conflict this only
    // ever touches updated_at — an existing row's person_id/username/etc stay put.
    const { error } = await supabase.from('device_identities').upsert(
      { device_id: deviceId, updated_at: new Date().toISOString() },
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
