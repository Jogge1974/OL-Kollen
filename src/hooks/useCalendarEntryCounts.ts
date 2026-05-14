import * as React from 'react';

import { CompetitorCountEntry, fetchBatchCompetitorCounts } from '@/src/api/eventorApi';
import { useAuthStore } from '@/src/store/authStore';
import { EventItem } from '@/src/types/eventor';
import { normalizeEventId } from '@/src/utils/eventId';

function getLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useCalendarEntryCounts(events: EventItem[], enabled: boolean) {
  const user = useAuthStore((state) => state.user);
  const organisationId = user?.organisationIds?.[0] ?? null;
  const [counts, setCounts] = React.useState<Record<string, CompetitorCountEntry>>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const eligibleEventIds = React.useMemo(() => {
    if (!enabled) return [];
    const today = getLocalIsoDate();
    return events
      .filter((e) => e.startDate >= today && !e.hasPublishedResults && !e.hasPublishedStarts)
      .map((e) => normalizeEventId(e.id));
  }, [enabled, events]);

  React.useEffect(() => {
    if (eligibleEventIds.length === 0) {
      setCounts({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchBatchCompetitorCounts(eligibleEventIds, organisationId)
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
  }, [eligibleEventIds.join(','), organisationId]);

  return { counts, isLoading };
}
