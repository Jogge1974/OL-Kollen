import * as React from 'react';

import { CompetitorCountEntry, fetchBatchCompetitorCounts } from '@/src/api/eventorApi';
import { useAuthStore } from '@/src/store/authStore';
import { EventItem } from '@/src/types/eventor';
import { normalizeEventId } from '@/src/utils/eventId';

export function useCalendarEntryCounts(events: EventItem[], enabled: boolean) {
  const user = useAuthStore((state) => state.user);
  const organisationId = user?.organisationIds?.[0] ?? null;
  const [counts, setCounts] = React.useState<Record<string, CompetitorCountEntry>>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const eventIds = React.useMemo(() => {
    if (!enabled) return [];
    return events.map((e) => normalizeEventId(e.id));
  }, [enabled, events]);

  React.useEffect(() => {
    if (eventIds.length === 0) {
      setCounts({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchBatchCompetitorCounts(eventIds, organisationId)
      .then((result) => {
        if (!cancelled) setCounts(result);
      })
      .catch(() => {
        if (!cancelled) setCounts({});
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [eventIds.join(','), organisationId]);

  return { counts, isLoading };
}
