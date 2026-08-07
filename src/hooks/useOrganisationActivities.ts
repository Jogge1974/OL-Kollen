import * as React from 'react';

import { fetchOrganisationActivities } from '@/src/api/eventorActivities';
import { ActivitySections } from '@/src/types/eventorActivities';

type UseOrganisationActivitiesResult = {
  error: string | null;
  isLoading: boolean;
  reload: () => void;
  sections: ActivitySections | null;
};

export function useOrganisationActivities(organisationId: string | null): UseOrganisationActivitiesResult {
  const [sections, setSections] = React.useState<ActivitySections | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!organisationId) {
      setSections(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchOrganisationActivities(organisationId)
      .then((result) => {
        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }
        setSections(result);
      })
      .catch((caught: unknown) => {
        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }
        setSections(null);
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
  }, [organisationId, refreshKey]);

  const reload = React.useCallback(() => setRefreshKey((key) => key + 1), []);

  return { error, isLoading, reload, sections };
}
