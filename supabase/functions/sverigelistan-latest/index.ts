import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

type SverigelistanRow = {
  BirthYear: number | null;
  Club: string;
  ClubId: number | null;
  Gender: string;
  Name: string;
  PageIndex: number;
  Points: number;
  Rank: number;
  RunnerId: number | null;
  Updated: string;
};

const PAGE_SIZE = 1000;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
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

    const latestUpdated = await fetchLatestUpdatedValue(supabase);

    if (!latestUpdated) {
      return jsonResponse({
        rows: [],
        updated: null,
      });
    }

    const rows = await fetchAllLatestRows(supabase, latestUpdated);

    return jsonResponse({
      rows,
      updated: latestUpdated,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown Sverigelistan endpoint error.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function fetchLatestUpdatedValue(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('Sverigelistan').select('Updated').order('Updated', { ascending: false }).limit(1).maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.Updated as string | null | undefined) ?? null;
}

async function fetchAllLatestRows(supabase: SupabaseClient, latestUpdated: string) {
  const rows: SverigelistanRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('Sverigelistan')
      .select('BirthYear, Club, ClubId, Gender, Name, PageIndex, Points, Rank, RunnerId, Updated')
      .eq('Updated', latestUpdated)
      .order('Rank', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as SverigelistanRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
