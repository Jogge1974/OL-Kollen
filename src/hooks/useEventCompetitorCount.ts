import * as React from 'react';

import { fetchEventCompetitorCount } from '@/src/api/eventorApi';
import { EventCompetitorCount } from '@/src/types/eventor';

const emptyCounts: EventCompetitorCount = {
  organisationEntries: null,
  organisationStarts: null,
  totalEntries: null,
  totalStarts: null,
};

export function useEventCompetitorCount(eventId: string | null, organisationId: string | null) {
  const normalizedId = React.useMemo(() => eventId?.split('::')[0] ?? null, [eventId]);
  const [counts, setCounts] = React.useState<EventCompetitorCount>(emptyCounts);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadCounts = React.useCallback(async () => {
    if (!normalizedId) {
      setCounts(emptyCounts);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextCounts = await fetchEventCompetitorCount(normalizedId, organisationId);
      setCounts(nextCounts);
    } catch (loadError) {
      setCounts(emptyCounts);
      setError(loadError instanceof Error ? loadError.message : 'Okant fel vid hamtning av antal deltagare.');
    } finally {
      setIsLoading(false);
    }
  }, [normalizedId, organisationId]);

  React.useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  return {
    counts,
    error,
    isLoading,
    reload: loadCounts,
  };
}
