import * as React from 'react';

import { fetchOrganisationSeries } from '@/src/api/eventorSeries';
import { fetchOrganisationTree } from '@/src/api/organisationTree';
import { OrganisationSeries, OrganisationTreeNode } from '@/src/types/eventorSeries';

// Svenska Orienteringsförbundet – used when no user (and therefore no club) is
// signed in.
export const DEFAULT_ORGANISATION_ID = 1;

type UseOrganisationSeriesResult = {
  availableYears: number[];
  error: string | null;
  groups: OrganisationSeries[];
  isLoading: boolean;
  reload: (force?: boolean) => Promise<void>;
};

export function useOrganisationSeries(organisationId: number | null): UseOrganisationSeriesResult {
  const orgId = organisationId ?? DEFAULT_ORGANISATION_ID;

  const [groups, setGroups] = React.useState<OrganisationSeries[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const load = React.useCallback(
    async (force = false) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const tree = await fetchOrganisationTree(orgId);
        const nodes: OrganisationTreeNode[] = [tree.organisation, ...tree.ancestors];

        const settled = await Promise.allSettled(
          nodes.map((node) => fetchOrganisationSeries(node.id, node.name, node.type, force)),
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        const resolved: OrganisationSeries[] = [];
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            resolved.push(result.value);
          } else {
            const node = nodes[index];
            resolved.push({ organisationId: node.id, organisationName: node.name, series: [], type: node.type });
          }
        });

        setGroups(resolved);
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setGroups([]);
          setError(caught instanceof Error ? caught.message : 'Det gick inte att hämta serierna.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [orgId],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    for (const group of groups) {
      for (const item of group.series) {
        const start = item.startYear;
        const end = item.endYear ?? item.startYear;
        if (start === null) {
          continue;
        }
        for (let year = start; year <= (end ?? start); year += 1) {
          years.add(year);
        }
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [groups]);

  return { availableYears, error, groups, isLoading, reload: load };
}

// True when the series' date span covers the given year.
export function seriesSpansYear(startYear: number | null, endYear: number | null, year: number): boolean {
  if (startYear === null) {
    return false;
  }
  const end = endYear ?? startYear;
  return year >= startYear && year <= end;
}
