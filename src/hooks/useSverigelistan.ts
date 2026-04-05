import * as React from 'react';

import { getRankingClassDefinition } from '@/src/services/rankingClassService';
import { getSupabaseClient } from '@/src/services/supabase';
import { SverigelistanRow, SverigelistanTrendDirection, SverigelistanTrendPoint } from '@/src/types/sverigelistan';

type UseSverigelistanResult = {
  className: string | null;
  classTrend: SverigelistanTrendPoint[];
  currentClassRank: number | null;
  currentEntry: SverigelistanRow | null;
  error: string | null;
  hasSupabase: boolean;
  isLoading: boolean;
  monthlyTrend: SverigelistanTrendPoint[];
  previousClassRank: number | null;
  previousEntry: SverigelistanRow | null;
  refetch: () => Promise<void>;
  trendDirection: SverigelistanTrendDirection;
};

type HookInput = {
  birthDate: string | null;
  gender: 'D' | 'H' | null;
  runnerId: string | null;
};

export function useSverigelistan({ birthDate, gender, runnerId }: HookInput): UseSverigelistanResult {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [state, setState] = React.useState<UseSverigelistanResult>({
    className: null,
    classTrend: buildMonthlyTrend([]),
    currentClassRank: null,
    currentEntry: null,
    error: null,
    hasSupabase: true,
    isLoading: false,
    monthlyTrend: buildMonthlyTrend([]),
    previousClassRank: null,
    previousEntry: null,
    refetch: async () => {
      setRefreshKey((value) => value + 1);
    },
    trendDirection: 'unknown',
  });

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!runnerId) {
        if (!isMounted) {
          return;
        }

        setState(emptyState(setRefreshKey));
        return;
      }

      const numericRunnerId = Number(runnerId);
      const birthYear = extractBirthYear(birthDate);

      if (!Number.isFinite(numericRunnerId)) {
        if (!isMounted) {
          return;
        }

        setState({
          ...emptyState(setRefreshKey),
          error: 'Löpar-id saknas eller har fel format.',
        });
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        if (!isMounted) {
          return;
        }

        setState({
          ...emptyState(setRefreshKey),
          error: 'Supabase är inte konfigurerat i appen.',
          hasSupabase: false,
        });
        return;
      }

      setState((previous) => ({
        ...previous,
        error: null,
        hasSupabase: true,
        isLoading: true,
      }));

      const oldestIncludedDate = getMonthStartOffset(11);
      const currentClassName = birthYear && gender ? getRankingClassDefinition(gender, birthYear, new Date().getFullYear()).className : null;

      const userRowsPromise = client
        .from('Sverigelistan')
        .select('BirthYear, Club, ClubId, Gender, Name, PageIndex, Points, Rank, RunnerId, Updated')
        .eq('RunnerId', numericRunnerId)
        .order('Updated', { ascending: true });

      const classRowsPromise =
        birthYear && gender
          ? client
              .from('Sverigelistan')
              .select('BirthYear, Gender, Rank, RunnerId, Updated')
              .eq('Gender', gender)
              .gte('Updated', oldestIncludedDate)
              .not('BirthYear', 'is', null)
              .order('Updated', { ascending: true })
          : Promise.resolve({ data: [], error: null });

      const [userRowsResponse, classRowsResponse] = await Promise.all([userRowsPromise, classRowsPromise]);

      if (!isMounted) {
        return;
      }

      if (userRowsResponse.error) {
        setState({
          ...emptyState(setRefreshKey),
          error: userRowsResponse.error.message || 'Det gick inte att läsa Sverigelistan.',
        });
        return;
      }

      if (classRowsResponse.error) {
        setState({
          ...emptyState(setRefreshKey),
          error: classRowsResponse.error.message || 'Det gick inte att läsa klassplaceringar från Sverigelistan.',
        });
        return;
      }

      const rows = ((userRowsResponse.data ?? []) as SverigelistanRow[]).sort((left, right) => left.Updated.localeCompare(right.Updated));
      const currentEntry = rows.length > 0 ? rows[rows.length - 1] : null;
      const previousEntry = rows.length > 1 ? rows[rows.length - 2] : null;
      const monthlyTrend = buildMonthlyTrend(rows);
      const trendDirection = getTrendDirection(monthlyTrend);
      const classTrend =
        birthYear && gender ? buildClassTrend(monthlyTrend, (classRowsResponse.data ?? []) as SverigelistanRow[], birthYear, gender, numericRunnerId) : buildMonthlyTrend([]);
      const currentClassRank = getLatestRank(classTrend);
      const previousClassRank = getPreviousRank(classTrend);

      setState({
        className: currentClassName,
        classTrend,
        currentClassRank,
        currentEntry,
        error: null,
        hasSupabase: true,
        isLoading: false,
        monthlyTrend,
        previousClassRank,
        previousEntry,
        refetch: async () => {
          setRefreshKey((value) => value + 1);
        },
        trendDirection,
      });
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [birthDate, gender, refreshKey, runnerId]);

  return state;
}

function emptyState(setRefreshKey: React.Dispatch<React.SetStateAction<number>>): UseSverigelistanResult {
  return {
    className: null,
    classTrend: buildMonthlyTrend([]),
    currentClassRank: null,
    currentEntry: null,
    error: null,
    hasSupabase: true,
    isLoading: false,
    monthlyTrend: buildMonthlyTrend([]),
    previousClassRank: null,
    previousEntry: null,
    refetch: async () => {
      setRefreshKey((value) => value + 1);
    },
    trendDirection: 'unknown',
  };
}

function buildMonthlyTrend(rows: SverigelistanRow[]) {
  const entriesByMonth = new Map<string, SverigelistanRow>();

  for (const row of rows) {
    const monthKey = row.Updated.slice(0, 7);
    const previous = entriesByMonth.get(monthKey);
    if (!previous || previous.Updated < row.Updated) {
      entriesByMonth.set(monthKey, row);
    }
  }

  const points: SverigelistanTrendPoint[] = [];
  const currentMonth = new Date();

  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - offset, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const row = entriesByMonth.get(monthKey);

    points.push({
      className: null,
      label: monthDate.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', ''),
      rank: row?.Rank ?? null,
      updated: row?.Updated ?? null,
    });
  }

  return points;
}

function buildClassTrend(monthlyTrend: SverigelistanTrendPoint[], classRows: SverigelistanRow[], birthYear: number, gender: 'D' | 'H', runnerId: number) {
  const latestByRunnerAndMonth = new Map<string, SverigelistanRow>();

  for (const row of classRows) {
    if (row.BirthYear === null || row.RunnerId === null) {
      continue;
    }

    const monthKey = row.Updated.slice(0, 7);
    const compositeKey = `${monthKey}:${row.RunnerId}`;
    const previous = latestByRunnerAndMonth.get(compositeKey);

    if (!previous || previous.Updated < row.Updated) {
      latestByRunnerAndMonth.set(compositeKey, row);
    }
  }

  return monthlyTrend.map((point) => {
    const rankingYear = point.updated ? Number(point.updated.slice(0, 4)) : inferRankingYear(point.label);
    const classDefinition = getRankingClassDefinition(gender, birthYear, rankingYear);
    const monthKey = point.updated?.slice(0, 7) ?? buildMonthKeyFromLabel(point.label, rankingYear);

    const classMembers = Array.from(latestByRunnerAndMonth.values())
      .filter(
        (row) =>
          row.Updated.slice(0, 7) === monthKey &&
          row.BirthYear !== null &&
          row.BirthYear >= classDefinition.minBirthYear &&
          row.BirthYear <= classDefinition.maxBirthYear,
      )
      .sort((left, right) => left.Rank - right.Rank);

    const classRankIndex = classMembers.findIndex((row) => row.RunnerId === runnerId);

    return {
      className: classDefinition.className,
      label: point.label,
      rank: classRankIndex >= 0 ? classRankIndex + 1 : null,
      updated: point.updated,
    } satisfies SverigelistanTrendPoint;
  });
}

function getLatestRank(points: SverigelistanTrendPoint[]) {
  return [...points].reverse().find((point) => point.rank !== null)?.rank ?? null;
}

function getPreviousRank(points: SverigelistanTrendPoint[]) {
  const reversed = [...points].reverse().filter((point) => point.rank !== null);
  return reversed[1]?.rank ?? null;
}

function getTrendDirection(points: SverigelistanTrendPoint[]): SverigelistanTrendDirection {
  const latest = [...points].reverse().find((point) => point.rank !== null);

  if (!latest) {
    return 'unknown';
  }

  const latestIndex = points.findIndex((point) => point.updated === latest.updated && point.rank === latest.rank);
  const previous = [...points.slice(0, latestIndex)].reverse().find((point) => point.rank !== null);

  if (!previous || latest.rank === null || previous.rank === null) {
    return 'unknown';
  }

  if (latest.rank < previous.rank) {
    return 'better';
  }

  if (latest.rank > previous.rank) {
    return 'worse';
  }

  return 'same';
}

function extractBirthYear(birthDate: string | null) {
  if (!birthDate || birthDate.length < 4) {
    return null;
  }

  const year = Number(birthDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getMonthStartOffset(offset: number) {
  const current = new Date();
  return new Date(current.getFullYear(), current.getMonth() - offset, 1).toISOString().slice(0, 10);
}

function inferRankingYear(label: string) {
  const current = new Date();
  const currentMonthIndex = current.getMonth();
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'].indexOf(label.toLowerCase());

  if (monthIndex < 0) {
    return current.getFullYear();
  }

  return monthIndex > currentMonthIndex ? current.getFullYear() - 1 : current.getFullYear();
}

function buildMonthKeyFromLabel(label: string, year: number) {
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'].indexOf(label.toLowerCase());
  const month = monthIndex >= 0 ? monthIndex + 1 : 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}
