import * as React from 'react';

import { fetchEventorEventById } from '@/src/api/eventorApi';
import { EventDetail } from '@/src/types/eventor';

export function useEventorEventDetail(eventId: string | string[] | undefined) {
  const normalizedId = React.useMemo(() => {
    const rawId = Array.isArray(eventId) ? eventId[0] : eventId;
    return rawId?.split('::')[0] ?? rawId ?? null;
  }, [eventId]);
  const selectedEventRaceId = React.useMemo(() => {
    const rawId = Array.isArray(eventId) ? eventId[0] : eventId;
    if (!rawId?.includes('::')) {
      return null;
    }

    return rawId.split('::').slice(1).join('::') || null;
  }, [eventId]);
  const [event, setEvent] = React.useState<EventDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadEvent = React.useCallback(async () => {
    if (!normalizedId) {
      setError('Ingen tävling vald.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextEvent = await fetchEventorEventById(normalizedId, selectedEventRaceId);
      setEvent(nextEvent);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Okänt fel vid hämtning av tävlingsdetaljer.');
    } finally {
      setIsLoading(false);
    }
  }, [normalizedId, selectedEventRaceId]);

  React.useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  return {
    error,
    event,
    isLoading,
    reload: loadEvent,
  };
}
