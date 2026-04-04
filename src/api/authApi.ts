import { buildEventorUrl, getEventorApiKey } from '@/src/services/env';
import { AuthenticatedUser, EventorLoginInput } from '@/src/types/user';
import { mapPersonXml } from '@/src/utils/mapEventorResponse';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export async function authenticateEventorPerson(input: EventorLoginInput) {
  const requestUrl = buildEventorUrl('/authenticatePerson');

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
      Password: input.password,
      Username: input.username,
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] GET /authenticatePerson failed', {
      status: response.status,
      url: requestUrl,
    });
    throw new Error(mapAuthError(response.status));
  }

  const mappedUser = mapPersonXml(xml, input.username);
  const primaryOrganisationId = mappedUser.organisationIds[0] ?? null;
  let organisationName: string | null = null;

  if (primaryOrganisationId) {
    try {
      organisationName = await fetchOrganisationName(primaryOrganisationId);
    } catch (organisationError) {
      console.warn('[Eventor] GET /organisation/{id} failed after login', {
        organisationId: primaryOrganisationId,
        reason: organisationError instanceof Error ? organisationError.message : 'unknown',
      });
    }
  }

  return {
    ...mappedUser,
    organisationName,
  } satisfies AuthenticatedUser;
}

async function fetchOrganisationName(organisationId: string) {
  const requestUrl = buildEventorUrl(`/organisation/${organisationId}`);

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(mapAuthError(response.status));
  }

  const parsed = parser.parse(xml) as {
    Organisation?: {
      Name?: string;
      ShortName?: string;
    };
  };

  return parsed.Organisation?.ShortName ?? parsed.Organisation?.Name ?? null;
}

function mapAuthError(status: number) {
  if (status === 401 || status === 403 || status === 404) {
    return 'Inloggningen misslyckades. Kontrollera användarnamn och lösenord.';
  }

  return `Kunde inte logga in mot Eventor just nu (felkod ${status}).`;
}
