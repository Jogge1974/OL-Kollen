import * as React from 'react';

import { fetchPersonResultsXml, fetchPersonStartsXml } from '@/src/api/eventorApi';
import { filterPersonResultSections, parsePersonResultsXml, parsePersonStartsXml } from '@/src/services/personEventorListParser';
import { PersonActivitySection, PersonResultsFilter } from '@/src/types/personLists';

type UsePersonEventorListsInput = {
  personId: string | null;
};

type UsePersonEventorListsResult = {
  availableYears: number[];
  excludeEventIds: Set<string>;
  isLoadingResults: boolean;
  isLoadingStarts: boolean;
  organisationId: string | null;
  resultsCompetitionCount: number;
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
  const [allResultEventIds, setAllResultEventIds] = React.useState<Set<string>>(new Set());
  const [resultsCompetitionCount, setResultsCompetitionCount] = React.useState(0);
  const [rawStartsSections, setRawStartsSections] = React.useState<PersonActivitySection[]>([]);
  const [resultsError, setResultsError] = React.useState<string | null>(null);
  const [startsError, setStartsError] = React.useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = React.useState(false);
  const [isLoadingStarts, setIsLoadingStarts] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const loadStarts = async () => {
      if (!personId) {
        if (!isMounted) {
          return;
        }

        setRawStartsSections([]);
        setStartsError(null);
        setIsLoadingStarts(false);
        return;
      }

      setRawStartsSections([]);
      setIsLoadingStarts(true);
      setStartsError(null);

      try {
        const { fromDate, toDate } = getStartsDateRange();
        const startsXml = await fetchPersonStartsXml(personId, fromDate, toDate);
        const nextStarts = parsePersonStartsXml(startsXml);

        if (!isMounted) {
          return;
        }

        setRawStartsSections(nextStarts);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Okänt fel vid hämtning av personlistor.';
        setStartsError(message);
        setRawStartsSections([]);
      } finally {
        if (isMounted) {
          setIsLoadingStarts(false);
        }
      }
    };

    void loadStarts();

    return () => {
      isMounted = false;
    };
  }, [personId, refreshKey]);

  React.useEffect(() => {
    let isMounted = true;

    const loadResults = async () => {
      if (!personId) {
        if (!isMounted) {
          return;
        }

        setResultsSections([]);
        setResultsCompetitionCount(0);
        setResultsError(null);
        setIsLoadingResults(false);
        return;
      }

      setIsLoadingResults(true);
      setResultsError(null);

      try {
        const resultsXml = await fetchPersonResultsXml(personId, formatYearStart(resultsYear), formatYearEnd(resultsYear));
        const parsedResults = parsePersonResultsXml(resultsXml);
        const nextResults = filterPersonResultSections(parsedResults, resultsYear, resultsFilter);

        if (!isMounted) {
          return;
        }

        setResultsCompetitionCount(parsedResults.filter((section) => Number(section.eventDate.slice(0, 4)) === resultsYear).length);
        setAllResultEventIds(new Set(parsedResults.map((s) => s.eventId)));
        setResultsSections(nextResults);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Okänt fel vid hämtning av personlistor.';
        setResultsError(message);
        setResultsSections([]);
        setResultsCompetitionCount(0);
      } finally {
        if (isMounted) {
          setIsLoadingResults(false);
        }
      }
    };

    void loadResults();

    return () => {
      isMounted = false;
    };
  }, [personId, refreshKey, resultsFilter, resultsYear]);

  // Derive filtered starts: keep until result exists or event date passes
  const startsSections = React.useMemo(() => {
    return filterPastStarts(rawStartsSections, allResultEventIds);
  }, [rawStartsSections, allResultEventIds]);

  // Derive organisationId from any available row
  const organisationId = React.useMemo(() => {
    for (const section of rawStartsSections) {
      for (const row of section.rows) {
        if (row.organisationId) return row.organisationId;
      }
    }
    for (const section of resultsSections) {
      for (const row of section.rows) {
        if (row.organisationId) return row.organisationId;
      }
    }
    return null;
  }, [rawStartsSections, resultsSections]);

  // Combine eventIds from starts and results for exclusion in entries
  const excludeEventIds = React.useMemo(() => {
    const ids = new Set(allResultEventIds);
    for (const section of startsSections) {
      ids.add(section.eventId);
    }
    return ids;
  }, [allResultEventIds, startsSections]);

  return {
    availableYears: buildAvailableYears(resultsYear),
    excludeEventIds,
    isLoadingResults,
    isLoadingStarts,
    organisationId,
    resultsCompetitionCount,
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

function getStartsDateRange() {
  return {
    fromDate: formatYesterdayBoundary(),
    toDate: formatFutureBoundary(30),
  };
}

function filterPastStarts(sections: PersonActivitySection[], resultEventIds: Set<string>): PersonActivitySection[] {
  const todayStr = formatLocalIsoDate(new Date());

  return sections
    .map((section) => {
      // Hide if a result already exists for this event
      if (resultEventIds.has(section.eventId)) {
        return { ...section, rows: [] };
      }

      const rows = section.rows.filter((row) => {
        // Keep the start as long as the event date hasn't passed
        return row.eventDate >= todayStr;
      });

      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);
}
