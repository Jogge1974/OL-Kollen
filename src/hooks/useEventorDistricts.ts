import * as React from 'react';

import { fetchOrganisationDirectory } from '@/src/api/eventorApi';
import { DistrictOption } from '@/src/types/eventor';

type DistrictState = {
  districtOptions: DistrictOption[];
  error: string | null;
  isLoading: boolean;
  organisationToDistrictId: Record<string, number>;
};

const emptyState: DistrictState = {
  districtOptions: [],
  error: null,
  isLoading: false,
  organisationToDistrictId: {},
};

export function useEventorDistricts(enabled = true) {
  const [state, setState] = React.useState<DistrictState>(emptyState);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function loadDirectory() {
      setState((current) => ({
        ...current,
        error: null,
        isLoading: true,
      }));

      try {
        const directory = await fetchOrganisationDirectory();

        if (!isMounted) {
          return;
        }

        setState({
          districtOptions: directory.districtOptions,
          error: null,
          isLoading: false,
          organisationToDistrictId: directory.organisationToDistrictId,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState({
          districtOptions: [],
          error: error instanceof Error ? error.message : 'Okänt fel vid hämtning av distrikt.',
          isLoading: false,
          organisationToDistrictId: {},
        });
      }
    }

    void loadDirectory();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return state;
}
