import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

// Returns the organisation tree branch for a given organisation id: the
// organisation itself plus every ancestor up to the root, each with id + name.
// Usage: GET /organisation-tree?organisationId=416
//        POST /organisation-tree { "organisationId": 416 }
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  let rawId = '';
  if (request.method === 'GET') {
    const url = new URL(request.url);
    rawId = url.searchParams.get('organisationId') ?? url.searchParams.get('id') ?? '';
  } else {
    const body = await request.json().catch(() => ({}));
    rawId = String(body?.organisationId ?? body?.id ?? '');
  }
  const organisationId = Number.parseInt(rawId.trim(), 10);

  if (!Number.isInteger(organisationId)) {
    return new Response(JSON.stringify({ error: 'organisationId must be an integer.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.rpc('get_organisation_tree', {
      p_id: organisationId,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const rows = (data ?? []) as Array<{
      depth: number;
      id: number;
      name: string;
      parent_organisation_id: number | null;
      short_name: string | null;
      type: string;
    }>;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Organisation not found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const toNode = (row: (typeof rows)[number]) => ({
      id: row.id,
      name: row.name,
      parentOrganisationId: row.parent_organisation_id,
      shortName: row.short_name,
      type: row.type,
    });

    const organisation = toNode(rows[0]);
    const ancestors = rows.slice(1).map(toNode);

    return new Response(
      JSON.stringify({
        ancestors, // nearest parent first, up to the root
        organisation,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
