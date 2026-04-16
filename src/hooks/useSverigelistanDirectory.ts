import * as React from 'react';

import { getRankingClassDefinition } from '@/src/services/rankingClassService';
import { getSupabaseClient } from '@/src/services/supabase';
import { SverigelistanRow } from '@/src/types/sverigelistan';

type UseSverigelistanDirectoryResult = {
  error: string | null;
  hasSupabase: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  latestUpdated: string | null;
  refetch: () => Promise<void>;
  rows: SverigelistanRow[];
};

export function useSverigelistanDirectory(): UseSverigelistanDirectoryResult {
  const [error, setError] = React.useState<string | null>(null);
  const [hasSupabase, setHasSupabase] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [latestUpdated, setLatestUpdated] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<SverigelistanRow[]>([]);

  const load = React.useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        setHasSupabase(false);
        setLatestUpdated(null);
        setRows([]);
        setError('Supabase är inte konfigurerat i appen.');
        return;
      }

      setHasSupabase(true);

      const latestResponse = await client
        .from('Sverigelistan')
        .select('Updated')
        .order('Updated', { ascending: false })
        .limit(1);

      if (latestResponse.error) {
        throw new Error(latestResponse.error.message || 'Det gick inte att hitta senaste Sverigelistan.');
      }

      const nextLatestUpdated = latestResponse.data?.[0]?.Updated ?? null;
      setLatestUpdated(nextLatestUpdated);

      if (!nextLatestUpdated) {
        setRows([]);
        return;
      }

      const nextRows = await fetchAllSverigelistanRows(client, nextLatestUpdated);
      setRows(nextRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Det gick inte att hämta Sverigelistan.');
      setLatestUpdated(null);
      setRows([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load(false);
  }, [load]);

  return {
    error,
    hasSupabase,
    isLoading,
    isRefreshing,
    latestUpdated,
    refetch: () => load(true),
    rows,
  };
}

async function fetchAllSverigelistanRows(client: NonNullable<ReturnType<typeof getSupabaseClient>>, latestUpdated: string) {
  const pageSize = 1000;
  const rows: SverigelistanRow[] = [];
  let offset = 0;

  while (true) {
    const response = await client
      .from('Sverigelistan')
      .select('BirthYear, Club, ClubId, Gender, Name, PageIndex, Points, Rank, RunnerId, Updated')
      .eq('Updated', latestUpdated)
      .order('Rank', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (response.error) {
      throw new Error(response.error.message || 'Det gick inte att läsa Sverigelistan.');
    }

    const batch = (response.data ?? []) as SverigelistanRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}

export function getSverigelistanClassLabel(row: SverigelistanRow, rankingYear: number) {
  if (row.BirthYear === null || (row.Gender !== 'D' && row.Gender !== 'H')) {
    return '-';
  }

  return getRankingClassDefinition(row.Gender, row.BirthYear, rankingYear).className;
}
