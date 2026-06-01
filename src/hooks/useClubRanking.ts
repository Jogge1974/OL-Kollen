import * as React from 'react';

import { getSupabaseClient } from '@/src/services/supabase';

export type ClubRankingRow = {
  avgPoints: number;
  club: string;
  clubId: number | null;
  gender: 'D' | 'H';
  month: string;
  rank: number;
  runnerCount: number;
};

export type ClubRankingTrend = {
  current: ClubRankingRow;
  previousRank: number | null;
  trend: 'up' | 'down' | 'same' | 'new';
};

type UseClubRankingResult = {
  error: string | null;
  isLoading: boolean;
  rankings: Record<'H' | 'D', ClubRankingTrend[]>;
  refetch: () => Promise<void>;
};

export function useClubRanking(options: { enabled?: boolean } = {}): UseClubRankingResult {
  const enabled = options.enabled ?? true;
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [rankings, setRankings] = React.useState<Record<'H' | 'D', ClubRankingTrend[]>>({ H: [], D: [] });

  const load = React.useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);

      // Get the two most recent months
      const { data: months } = await client
        .from('club_ranking')
        .select('month')
        .order('month', { ascending: false })
        .limit(1);

      if (!months || months.length === 0) {
        setRankings({ H: [], D: [] });
        setIsLoading(false);
        return;
      }

      const currentMonth = months[0].month;

      // Calculate previous month
      const currentDate = new Date(currentMonth + 'T00:00:00');
      currentDate.setMonth(currentDate.getMonth() - 1);
      const prevMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;

      // Fetch current month rankings
      const { data: currentData } = await client
        .from('club_ranking')
        .select('gender, club, club_id, avg_points, runner_count, rank, month')
        .eq('month', currentMonth)
        .order('rank', { ascending: true });

      // Fetch previous month rankings for trend
      const { data: prevData } = await client
        .from('club_ranking')
        .select('gender, club, rank, month')
        .eq('month', prevMonth);

      const prevMap = new Map<string, number>();
      for (const row of prevData ?? []) {
        prevMap.set(`${row.gender}::${row.club}`, row.rank);
      }

      const result: Record<'H' | 'D', ClubRankingTrend[]> = { H: [], D: [] };

      for (const row of currentData ?? []) {
        const gender = row.gender as 'H' | 'D';
        const prevRank = prevMap.get(`${gender}::${row.club}`) ?? null;
        let trend: ClubRankingTrend['trend'] = 'new';
        if (prevRank !== null) {
          if (prevRank > row.rank) trend = 'up';
          else if (prevRank < row.rank) trend = 'down';
          else trend = 'same';
        }

        result[gender].push({
          current: {
            avgPoints: row.avg_points,
            club: row.club,
            clubId: row.club_id,
            gender,
            month: row.month,
            rank: row.rank,
            runnerCount: row.runner_count,
          },
          previousRank: prevRank,
          trend,
        });
      }

      setRankings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta klubbranking.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (enabled) {
      void load();
    }
  }, [enabled, load]);

  return { error, isLoading, rankings, refetch: load };
}
