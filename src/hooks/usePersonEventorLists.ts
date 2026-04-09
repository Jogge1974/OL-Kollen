import * as React from 'react';

import { fetchPersonResultsXml, fetchPersonStartsXml } from '@/src/api/eventorApi';
import { filterPersonResultSections, parsePersonResultsXml, parsePersonStartsXml } from '@/src/services/personEventorListParser';
import { PersonActivitySection, PersonResultsFilter } from '@/src/types/personLists';

type UsePersonEventorListsInput = {
  personId: string | null;
};

type UsePersonEventorListsResult = {
  availableYears: number[];
  isLoadingResults: boolean;
  isLoadingStarts: boolean;
  resultsError: string | null;
  resultsFilter: PersonResultsFilter;
  resultsSections: PersonActivitySection[];
  resultsYear: number;
  refetch: () => Promise<void>;
  setResultsFilter: React.Dispatch<React.SetStateAction<PersonResultsFilter>>;
  setResultsYear: React.Dispatch<React.SetStateAction<number>>;
  startsError: string | null;
  startsSections: PersonActivitySection[];
};

export function usePersonEventorLists({ personId }: UsePersonEventorListsInput): UsePersonEventorListsResult {
  const currentYear = new Date().getFullYear();
  const [resultsYear, setResultsYear] = React.useState(currentYear);
  const [resultsFilter, setResultsFilter] = React.useState<PersonResultsFilter>('national');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [resultsSections, setResultsSections] = React.useState<PersonActivitySection[]>([]);
  const [startsSections, setStartsSections] = React.useState<PersonActivitySection[]>([]);
  const [resultsError, setResultsError] = React.useState<string | null>(null);
  const [startsError, setStartsError] = React.useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = React.useState(false);
  const [isLoadingStarts, setIsLoadingStarts] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!personId) {
        if (!isMounted) {
          return;
        }

        setResultsSections([]);
        setStartsSections([]);
        setResultsError(null);
        setStartsError(null);
        return;
      }

      setIsLoadingResults(true);
      setIsLoadingStarts(true);
      setResultsError(null);
      setStartsError(null);

      try {
        const [startsXml, resultsXml] = await Promise.all([
          fetchPersonStartsXml(personId, formatYesterdayBoundary(), formatFutureBoundary(30)),
          fetchPersonResultsXml(personId, formatYearStart(resultsYear), formatYearEnd(resultsYear)),
        ]);

        const nextStarts = parsePersonStartsXml(startsXml);
        const nextResults = filterPersonResultSections(parsePersonResultsXml(resultsXml), resultsYear, resultsFilter);

        if (!isMounted) {
          return;
        }

        setStartsSections(nextStarts);
        setResultsSections(nextResults);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Okänt fel vid hämtning av personlistor.';
        setStartsError(message);
        setResultsError(message);
        setStartsSections([]);
        setResultsSections([]);
      } finally {
        if (!isMounted) {
          return;
        }

        setIsLoadingResults(false);
        setIsLoadingStarts(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [personId, refreshKey, resultsFilter, resultsYear]);

  return {
    availableYears: buildAvailableYears(resultsYear),
    isLoadingResults,
    isLoadingStarts,
    refetch: async () => {
      setRefreshKey((value) => value + 1);
    },
    resultsError,
    resultsFilter,
    resultsSections,
    resultsYear,
    setResultsFilter,
    setResultsYear,
    startsError,
    startsSections,
  };
}

function buildAvailableYears(selectedYear: number) {
  const currentYear = new Date().getFullYear();
  const earliestYear = Math.min(currentYear, selectedYear) - 4;
  const latestYear = Math.max(currentYear, selectedYear);
  const years: number[] = [];

  for (let year = latestYear; year >= earliestYear; year -= 1) {
    years.push(year);
  }

  return years;
}

function formatYearStart(year: number) {
  return `${year}-01-01 00:00:00`;
}

function formatYearEnd(year: number) {
  return `${year}-12-31 23:59:59`;
}

function formatYesterdayBoundary() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return `${formatLocalIsoDate(yesterday)} 23:59:59`;
}

function formatFutureBoundary(daysAhead: number) {
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);
  return `${formatLocalIsoDate(future)} 23:59:59`;
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}
