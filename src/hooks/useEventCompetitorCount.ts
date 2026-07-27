import * as React from 'react';

import { fetchEventCompetitorCount } from '@/src/api/eventorApi';
import { EventCompetitorCount } from '@/src/types/eventor';

const emptyCounts: EventCompetitorCount = {
  organisationEntries: null,
  organisationStarts: null,
  totalEntries: null,
  totalStarts: null,
};

export function useEventCompetitorCount(eventId: string | null, organisationId: string | null, eventForm: string | null = null, eventRaceId: string | null = null) {
  const normalizedId = React.useMemo(() => eventId?.split('::')[0] ?? null, [eventId]);
  const [counts, setCounts] = React.useState<EventCompetitorCount>(emptyCounts);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const requestIdRef = React.useRef(0);

  const loadCounts = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!normalizedId) {
      setCounts(emptyCounts);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextCounts = await fetchEventCompetitorCount(normalizedId, organisationId, eventForm, eventRaceId);
      if (requestIdRef.current === requestId) {
        setCounts(nextCounts);
      }
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setCounts(emptyCounts);
        setError(loadError instanceof Error ? loadError.message : 'Okant fel vid hamtning av antal deltagare.');
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [normalizedId, organisationId, eventForm, eventRaceId]);

  React.useEffect(() => {
    // Reset immediately when the target event changes so a previous event's
    // count is never shown while the new one is loading.
    setCounts(emptyCounts);
    void loadCounts();
  }, [loadCounts]);

  return {
    counts,
    error,
    isLoading,
    reload: loadCounts,
  };
}
