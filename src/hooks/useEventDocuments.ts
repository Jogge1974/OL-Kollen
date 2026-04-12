import * as React from 'react';

import { fetchEventDocumentsForEvent } from '@/src/api/eventorApi';
import { EventDocument } from '@/src/types/eventor';

export function useEventDocuments(eventId: string | null) {
  const normalizedId = React.useMemo(() => eventId?.split('::')[0] ?? null, [eventId]);
  const [documents, setDocuments] = React.useState<EventDocument[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadDocuments = React.useCallback(async () => {
    if (!normalizedId) {
      setDocuments([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextDocuments = await fetchEventDocumentsForEvent(normalizedId);
      setDocuments(nextDocuments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Okänt fel vid hämtning av dokument.');
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [normalizedId]);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return {
    documents,
    error,
    isLoading,
    reload: loadDocuments,
  };
}
