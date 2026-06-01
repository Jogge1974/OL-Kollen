const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://hvscmyudneihjbtitffy.supabase.co', 'sb_publishable_rpCcNEKGIGt2RVDxwe1z0Q_gujFKho7');

(async () => {
  // Check Sverigelistan for Stora Tuna, Dam, April 2026
  const { data, error } = await sb
    .from('Sverigelistan')
    .select('Name, Club, Gender, Points, Rank, Updated')
    .ilike('Club', '%Stora Tuna%')
    .eq('Gender', 'D')
    .gte('Updated', '2026-04-01')
    .lt('Updated', '2026-05-01')
    .order('Points', { ascending: true })
    .limit(5);
  console.log('Sverigelistan Stora Tuna D april count:', data?.length);
  console.log('First 5:', error?.message || JSON.stringify(data, null, 2));

  // Count all Stora Tuna D in april
  const { count } = await sb
    .from('Sverigelistan')
    .select('*', { count: 'exact', head: true })
    .ilike('Club', '%Stora Tuna%')
    .eq('Gender', 'D')
    .gte('Updated', '2026-04-01')
    .lt('Updated', '2026-05-01');
  console.log('Total Stora Tuna D april:', count);

  // Check club_ranking for Stora Tuna
  const { data: cr, error: e2 } = await sb
    .from('club_ranking')
    .select('*')
    .ilike('club', '%Stora Tuna%');
  console.log('club_ranking Stora Tuna:', e2?.message || JSON.stringify(cr, null, 2));

  // Check all distinct clubs in club_ranking for april D
  const { data: aprilD } = await sb
    .from('club_ranking')
    .select('club, rank, avg_points, runner_count')
    .eq('gender', 'D')
    .eq('month', '2026-04-01')
    .order('rank', { ascending: true })
    .limit(5);
  console.log('club_ranking D april top 5:', JSON.stringify(aprilD, null, 2));

  // Check distinct Updated dates in April
  const { data: dates } = await sb
    .from('Sverigelistan')
    .select('Updated')
    .gte('Updated', '2026-04-01')
    .lt('Updated', '2026-05-01')
    .order('Updated', { ascending: false })
    .limit(5);
  const uniqueDates = [...new Set(dates?.map(d => d.Updated))];
  console.log('Distinct Updated dates in April:', uniqueDates);

  // Check what Gender values exist
  const { data: genders } = await sb
    .from('Sverigelistan')
    .select('Gender')
    .ilike('Club', '%Stora Tuna%')
    .gte('Updated', '2026-04-01')
    .lt('Updated', '2026-05-01');
  const uniqueGenders = [...new Set(genders?.map(g => g.Gender))];
  console.log('Stora Tuna genders in april:', uniqueGenders);
})();
