import * as React from 'react';

import { fetchEventDocumentsForEvent } from '@/src/api/eventorApi';
import { EventDocument } from '@/src/types/eventor';

export function useEventDocuments(eventId: string | null) {
  const [documents, setDocuments] = React.useState<EventDocument[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadDocuments = React.useCallback(async () => {
    if (!eventId) {
      setDocuments([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextDocuments = await fetchEventDocumentsForEvent(eventId);
      setDocuments(nextDocuments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Okänt fel vid hämtning av dokument.');
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

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
