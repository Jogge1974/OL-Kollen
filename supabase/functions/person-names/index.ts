import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

// Resolves Eventor person ids to names/clubs from the full person registry
// (PersonregisterEventor). Used to show real names for registrants that aren't
// members of the querying club (the Eventor API key can't look those up).
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.', names: {} }, 405);
  }

  let rawIds: unknown;
  try {
    rawIds = (await request.json())?.ids;
  } catch {
    rawIds = null;
  }

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return json({ names: {} }, 200);
  }

  const ids = Array.from(
    new Set(rawIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)),
  ).slice(0, 2000);

  if (ids.length === 0) {
    return json({ names: {} }, 200);
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase
      .from('PersonregisterEventor')
      .select('Id, Name, Surname, Club')
      .in('Id', ids);

    if (error) {
      return json({ error: error.message, names: {} }, 500);
    }

    const names: Record<string, { club: string; name: string }> = {};
    for (const row of data ?? []) {
      const name = `${row.Name ?? ''} ${row.Surname ?? ''}`.trim();
      names[String(row.Id)] = { club: row.Club ?? '', name };
    }

    return json({ names }, 200);
  } catch (err) {
    return json({ error: String(err), names: {} }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
