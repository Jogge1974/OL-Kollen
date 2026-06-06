import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

/**
 * calculate-club-ranking
 *
 * Computes club rankings from the latest Sverigelistan snapshot.
 * Men: average points of top 10 runners per club.
 * Women: average points of top 7 runners per club.
 *
 * Stores results in `club_ranking` table using the actual Sverigelistan Updated date.
 * Skips calculation if that date already exists in club_ranking.
 * Call this after updating the Sverigelistan data, or let the cron handle it.
 */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: require CRON_SECRET or service role
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingSecret = request.headers.get('x-cron-secret');
    if (cronSecret && incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Optional: accept a "month" query param (YYYY-MM) to calculate for a specific month
    // and optionally a "date" param to use a specific Sverigelistan Updated date
    // "force=1" skips the already-exists check
    const url = new URL(request.url);
    const paramMonth = url.searchParams.get('month'); // e.g. "2026-04"
    const paramDate = url.searchParams.get('date');   // e.g. "2026-04-15" (specific Updated date)
    const forceRecalc = url.searchParams.get('force') === '1';

    // 1. Find the source date in Sverigelistan
    let sourceDate: string;
    if (paramDate) {
      // Use the exact date provided
      sourceDate = paramDate;
    } else if (paramMonth) {
      // Find the latest Updated date within that month
      const monthStart = `${paramMonth}-01`;
      const nextMonth = new Date(`${paramMonth}-01T00:00:00`);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      const { data: monthRow } = await supabase
        .from('Sverigelistan')
        .select('"Updated"')
        .gte('Updated', monthStart)
        .lt('Updated', monthEnd)
        .order('Updated', { ascending: false })
        .limit(1)
        .single();

      if (!monthRow) {
        return jsonOk({ error: `No Sverigelistan data found for month ${paramMonth}.`, ok: false });
      }
      sourceDate = monthRow.Updated;
    } else {
      // Default: latest date
      const { data: latestRow } = await supabase
        .from('Sverigelistan')
        .select('"Updated"')
        .order('Updated', { ascending: false })
        .limit(1)
        .single();

      if (!latestRow) {
        return jsonOk({ error: 'No Sverigelistan data found.', ok: false });
      }
      sourceDate = latestRow.Updated;
    }

    const latestDate = sourceDate;

    // 1b. Check if club_ranking already has this date — if so, skip (unless force)
    if (!forceRecalc) {
      const { data: existingRow } = await supabase
        .from('club_ranking')
        .select('month')
        .eq('month', latestDate)
        .limit(1)
        .maybeSingle();

      if (existingRow) {
        return jsonOk({ ok: true, skipped: true, reason: `club_ranking already exists for ${latestDate}` });
      }
    }

    // 2. Fetch all rows for the latest date
    const allRows: Array<{ Club: string; ClubId: number | null; Gender: string; Points: number }> = [];
    let page = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const { data } = await supabase
        .from('Sverigelistan')
        .select('"Gender", "Club", "ClubId", "Points"')
        .eq('Updated', latestDate)
        .order('Gender', { ascending: true })
        .order('Points', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (!data || data.length === 0) break;
      allRows.push(...(data as typeof allRows));
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // 3. Group by gender + club, take top N runners
    const TOP_N = { H: 10, D: 7 };
    const clubMap = new Map<string, { club: string; clubId: number | null; gender: string; points: number[] }>();

    for (const row of allRows) {
      const key = `${row.Gender}::${row.Club}`;
      let entry = clubMap.get(key);
      if (!entry) {
        entry = { club: row.Club, clubId: row.ClubId, gender: row.Gender, points: [] };
        clubMap.set(key, entry);
      }
      const topN = TOP_N[row.Gender as 'H' | 'D'] ?? 10;
      if (entry.points.length < topN) {
        entry.points.push(row.Points);
      }
    }

    // 4. Calculate averages and rank
    // Rule: if a club has fewer than topN runners, pad with 302 points per missing runner
    const PAD_POINTS = 302;
    type ClubRankEntry = { avgPoints: number; club: string; clubId: number | null; gender: string; runnerCount: number };
    const rankings: ClubRankEntry[] = [];

    for (const entry of clubMap.values()) {
      const topN = TOP_N[entry.gender as 'H' | 'D'] ?? 10;
      // Only include clubs with at least 3 runners (so tiny clubs don't dominate)
      if (entry.points.length < 3) continue;

      // Pad with 302 for missing runners up to topN
      const paddedPoints = [...entry.points];
      while (paddedPoints.length < topN) {
        paddedPoints.push(PAD_POINTS);
      }

      const sum = paddedPoints.reduce((a, b) => a + b, 0);
      const avg = sum / topN;
      rankings.push({
        avgPoints: Math.round(avg * 100) / 100,
        club: entry.club,
        clubId: entry.clubId,
        gender: entry.gender,
        runnerCount: entry.points.length,
      });
    }

    // Sort by avgPoints ascending per gender (lowest = best), assign rank
    const genders = ['H', 'D'] as const;
    const now = new Date();
    // Use the actual Sverigelistan Updated date as the month value
    const monthStr = latestDate;
    const upsertRows: Array<Record<string, unknown>> = [];

    for (const gender of genders) {
      const genderRankings = rankings
        .filter((r) => r.gender === gender)
        .sort((a, b) => a.avgPoints - b.avgPoints);

      for (let i = 0; i < genderRankings.length; i++) {
        const r = genderRankings[i];
        upsertRows.push({
          avg_points: r.avgPoints,
          calculated_at: now.toISOString(),
          club: r.club,
          club_id: r.clubId,
          gender,
          month: monthStr,
          rank: i + 1,
          runner_count: r.runnerCount,
        });
      }
    }

    // 5. Upsert into club_ranking (replace current month's data)
    if (upsertRows.length > 0) {
      // Delete existing entries for this month first (clean slate)
      await supabase
        .from('club_ranking')
        .delete()
        .eq('month', monthStr);

      // Insert in batches
      const BATCH = 500;
      for (let i = 0; i < upsertRows.length; i += BATCH) {
        const batch = upsertRows.slice(i, i + BATCH);
        const { error } = await supabase
          .from('club_ranking')
          .insert(batch);
        if (error) {
          console.error('[calculate-club-ranking] Insert error:', error);
        }
      }
    }

    const herrCount = upsertRows.filter((r) => r.gender === 'H').length;
    const damCount = upsertRows.filter((r) => r.gender === 'D').length;

    return jsonOk({
      clubsRanked: { D: damCount, H: herrCount },
      month: monthStr,
      ok: true,
      sourceDate: latestDate,
    });
  } catch (error) {
    console.error('[calculate-club-ranking] Error:', error);
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}
