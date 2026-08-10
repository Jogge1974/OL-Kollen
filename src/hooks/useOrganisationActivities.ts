import * as React from 'react';

import { fetchOrganisationActivities } from '@/src/api/eventorActivities';
import { ActivitySections } from '@/src/types/eventorActivities';

type UseOrganisationActivitiesResult = {
  error: string | null;
  isLoading: boolean;
  reload: (force?: boolean) => Promise<void>;
  sections: ActivitySections | null;
};

export function useOrganisationActivities(organisationId: string | null): UseOrganisationActivitiesResult {
  const [sections, setSections] = React.useState<ActivitySections | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const load = React.useCallback(
    async (force = false) => {
      if (!organisationId) {
        setSections(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchOrganisationActivities(organisationId, force);
        if (requestId === requestIdRef.current) {
          setSections(result);
        }
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setSections(null);
          setError(caught instanceof Error ? caught.message : 'Det gick inte att hämta klubbaktiviteterna.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [organisationId],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  return { error, isLoading, reload: load, sections };
}
