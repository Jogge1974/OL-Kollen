import * as React from 'react';

import { getRankingClassDefinition } from '@/src/services/rankingClassService';
import { getSupabaseClient } from '@/src/services/supabase';
import { SverigelistanRow } from '@/src/types/sverigelistan';

type UseSverigelistanDirectoryResult = {
  error: string | null;
  hasSupabase: boolean;
  isLoading: boolean;
  latestUpdated: string | null;
  refetch: () => Promise<void>;
  rows: SverigelistanRow[];
};

export function useSverigelistanDirectory() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [state, setState] = React.useState<UseSverigelistanDirectoryResult>({
    error: null,
    hasSupabase: true,
    isLoading: false,
    latestUpdated: null,
    refetch: async () => {
      setRefreshKey((value) => value + 1);
    },
    rows: [],
  });

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const client = getSupabaseClient();

      if (!client) {
        if (!isMounted) {
          return;
        }

        setState({
          error: 'Supabase är inte konfigurerat i appen.',
          hasSupabase: false,
          isLoading: false,
          latestUpdated: null,
          refetch: async () => {
            setRefreshKey((value) => value + 1);
          },
          rows: [],
        });
        return;
      }

      if (!isMounted) {
        return;
      }

      setState((previous) => ({
        ...previous,
        error: null,
        hasSupabase: true,
        isLoading: true,
      }));

      try {
        const latestResponse = await client.from('Sverigelistan').select('Updated').order('Updated', { ascending: false }).limit(1);
        if (!isMounted) {
          return;
        }

        if (latestResponse.error) {
          throw new Error(latestResponse.error.message || 'Det gick inte att hitta senaste Sverigelistan.');
        }

        const latestUpdated = latestResponse.data?.[0]?.Updated ?? null;
        if (!latestUpdated) {
          setState({
            error: null,
            hasSupabase: true,
            isLoading: false,
            latestUpdated: null,
            refetch: async () => {
              setRefreshKey((value) => value + 1);
            },
            rows: [],
          });
          return;
        }

        const rows = await fetchAllSverigelistanRows(client, latestUpdated);

        if (!isMounted) {
          return;
        }

        setState({
          error: null,
          hasSupabase: true,
          isLoading: false,
          latestUpdated,
          refetch: async () => {
            setRefreshKey((value) => value + 1);
          },
          rows,
        });
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setState({
          error: loadError instanceof Error ? loadError.message : 'Det gick inte att hämta Sverigelistan.',
          hasSupabase: true,
          isLoading: false,
          latestUpdated: null,
          refetch: async () => {
            setRefreshKey((value) => value + 1);
          },
          rows: [],
        });
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  return state;
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
