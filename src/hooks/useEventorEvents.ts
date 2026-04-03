import * as React from 'react';

import { fetchEventorEvents } from '@/src/api/eventorApi';
import { createDefaultCalendarFilters } from '@/src/features/calendar/calendarFilters';
import { EventFilterValues, EventItem } from '@/src/types/eventor';

export function useEventorEvents() {
  const [events, setEvents] = React.useState<EventItem[]>([]);
  const [filters, setFilters] = React.useState<EventFilterValues>(() => createDefaultCalendarFilters());
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  React.useEffect(() => {
    void loadEvents(filters);
  }, []);

  const loadEvents = async (nextFilters: EventFilterValues, isPullRefresh = false) => {
    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const nextEvents = await fetchEventorEvents(nextFilters);
      console.log('[Calendar] Mapped events from Eventor', {
        count: nextEvents.length,
        ids: nextEvents.map((event) => event.id),
      });
      setEvents(nextEvents);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Okänt fel vid hämtning av tävlingar.';
      setError(message);
      if (!isPullRefresh) {
        setEvents([]);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const applyFilters = async (nextFilters: EventFilterValues) => {
    setFilters(nextFilters);
    await loadEvents(nextFilters);
  };

  const refresh = async () => {
    await loadEvents(filters, true);
  };

  return {
    applyFilters,
    error,
    events,
    filters,
    isLoading,
    isRefreshing,
    refresh,
  };
}
