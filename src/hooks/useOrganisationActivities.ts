import * as React from 'react';

import { fetchOrganisationActivities } from '@/src/api/eventorActivities';
import { ClubActivity } from '@/src/types/eventorActivities';

type UseOrganisationActivitiesResult = {
  activities: ClubActivity[];
  availableYears: number[];
  error: string | null;
  isLoading: boolean;
  reload: () => void;
  selectedYear: number;
  setSelectedYear: React.Dispatch<React.SetStateAction<number>>;
};

const YEARS_BACK = 3;

export function useOrganisationActivities(organisationId: string | null): UseOrganisationActivitiesResult {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  const [activities, setActivities] = React.useState<ClubActivity[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const requestIdRef = React.useRef(0);

  const availableYears = React.useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear + 1; year >= currentYear - YEARS_BACK; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  React.useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!organisationId) {
      setActivities([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchOrganisationActivities(organisationId, selectedYear)
      .then((result) => {
        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }
        setActivities(result);
      })
      .catch((caught: unknown) => {
        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }
        setActivities([]);
        setError(caught instanceof Error ? caught.message : 'Det gick inte att hämta klubbaktiviteterna.');
      })
      .finally(() => {
        if (isMounted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [organisationId, selectedYear, refreshKey]);

  const reload = React.useCallback(() => setRefreshKey((key) => key + 1), []);

  return { activities, availableYears, error, isLoading, reload, selectedYear, setSelectedYear };
}
