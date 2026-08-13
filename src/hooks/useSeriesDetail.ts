import * as React from 'react';

import { fetchSeriesDetail } from '@/src/api/eventorSeries';
import { SeriesDetail, SeriesScoreMode } from '@/src/types/eventorSeries';

type UseSeriesDetailResult = {
  detail: SeriesDetail | null;
  error: string | null;
  isLoading: boolean;
  reload: (force?: boolean) => Promise<void>;
};

export function useSeriesDetail(seriesId: string | null, mode: SeriesScoreMode): UseSeriesDetailResult {
  const [detail, setDetail] = React.useState<SeriesDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const load = React.useCallback(
    async (force = false) => {
      if (!seriesId) {
        setDetail(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchSeriesDetail(seriesId, mode, force);
        if (requestId === requestIdRef.current) {
          setDetail(result);
        }
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setDetail(null);
          setError(caught instanceof Error ? caught.message : 'Det gick inte att hämta serien.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [seriesId, mode],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  return { detail, error, isLoading, reload: load };
}
