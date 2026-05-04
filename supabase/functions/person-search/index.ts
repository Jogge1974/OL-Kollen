import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

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

  const url = new URL(request.url);
  const nameQuery = (url.searchParams.get('name') ?? '').trim();
  const clubQuery = (url.searchParams.get('club') ?? '').trim();

  if (nameQuery.length < 3 && clubQuery.length < 3) {
    return new Response(JSON.stringify({ error: 'Name or club must be at least 3 characters.', results: [] }), {
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

    let builder = supabase
      .from('PersonregisterEventor')
      .select('Id, Name, Surname, Gender, BirthYear, Club, Nationality');

    if (nameQuery.length >= 3) {
      const nameWords = nameQuery.split(/\s+/).filter((w) => w.length > 0);
      for (const word of nameWords) {
        const pattern = `%${word}%`;
        builder = builder.or(`Name.ilike.${pattern},Surname.ilike.${pattern}`);
      }
    }

    if (clubQuery.length >= 3) {
      builder = builder.ilike('Club', `%${clubQuery}%`);
    }

    const { data, error } = await builder
      .order('Surname', { ascending: true })
      .order('Name', { ascending: true })
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ error: error.message, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const results = (data ?? []).map((row) => ({
      birthYear: row.BirthYear ?? null,
      club: row.Club ?? '',
      gender: row.Gender === 'F' ? 'D' : row.Gender === 'M' ? 'H' : row.Gender ?? '',
      name: `${row.Name ?? ''} ${row.Surname ?? ''}`.trim(),
      nationality: row.Nationality ?? '',
      personId: row.Id,
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
