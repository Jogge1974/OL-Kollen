import { buildEventorUrl, getEventorApiKey } from '@/src/services/env';
import { formatApiDateTime } from '@/src/services/dateService';
import { EventDetail, EventDocument, EventFilterValues, EventItem, EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';
import { mapEventDetailXml, mapEventDocumentsXml, mapEventListXml } from '@/src/utils/mapEventorResponse';

export async function fetchEventorEvents(filters: EventFilterValues): Promise<EventItem[]> {
  const apiKey = getEventorApiKey();
  const searchParams = new URLSearchParams({
    fromDate: formatApiDateTime(filters.fromDate, 'start'),
    toDate: formatApiDateTime(filters.toDate, 'end'),
  });
  const requestUrl = buildEventorUrl(`/events?${searchParams.toString()}`);

  console.log('[Eventor] GET /events request', {
    headers: {
      Accept: 'application/xml',
      ApiKey: '[masked]',
    },
    query: {
      fromDate: formatApiDateTime(filters.fromDate, 'start'),
      toDate: formatApiDateTime(filters.toDate, 'end'),
    },
    localClassificationFilter: filters.classificationIds,
    url: requestUrl,
  });

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: apiKey,
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] GET /events failed', {
      status: response.status,
      url: requestUrl,
    });
    throw new Error(mapEventorError(response.status, xml));
  }

  console.log('[Eventor] GET /events success', {
    status: response.status,
    url: requestUrl,
  });

  const mappedEvents = mapEventListXml(xml);
  const filteredEvents = filterEventsByClassification(mappedEvents, filters.classificationIds);

  console.log('[Eventor] Local classification filter applied', {
    after: filteredEvents.length,
    before: mappedEvents.length,
    selectedClassificationIds: filters.classificationIds,
  });

  return filteredEvents;
}

function filterEventsByClassification(events: EventItem[], selectedClassificationIds: number[]) {
  return events.filter((event) => {
    if (selectedClassificationIds.includes(event.classificationId)) {
      return true;
    }

    if (event.classificationId === 0 && selectedClassificationIds.includes(1)) {
      return true;
    }

    return false;
  });
}

export async function fetchEventorEventById(eventId: string): Promise<EventDetail> {
  const requestUrl = buildEventorUrl(`/event/${eventId}`);

  console.log('[Eventor] GET /event/{id} request', {
    eventId,
    headers: {
      Accept: 'application/xml',
      ApiKey: '[masked]',
    },
    url: requestUrl,
  });

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] GET /event/{id} failed', {
      eventId,
      status: response.status,
      url: requestUrl,
    });
    throw new Error(mapEventorError(response.status, xml));
  }

  console.log('[Eventor] GET /event/{id} success', {
    eventId,
    status: response.status,
    url: requestUrl,
  });

  return mapEventDetailXml(xml);
}

export async function fetchEventDocumentsForEvent(eventId: string): Promise<EventDocument[]> {
  const searchParams = new URLSearchParams({
    eventIds: eventId,
  });
  const requestUrl = buildEventorUrl(`/events/documents?${searchParams.toString()}`);

  console.log('[Eventor] GET /events/documents request', {
    eventId,
    headers: {
      Accept: 'application/xml',
      ApiKey: '[masked]',
    },
    query: {
      eventIds: eventId,
    },
    url: requestUrl,
  });

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] GET /events/documents failed', {
      eventId,
      status: response.status,
      url: requestUrl,
    });
    throw new Error(mapEventorError(response.status, xml));
  }

  const documents = mapEventDocumentsXml(xml);

  console.log('[Eventor] GET /events/documents success', {
    count: documents.length,
    eventId,
    status: response.status,
  });

  return documents;
}

export async function fetchEventPublishedListXml(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId?: string,
) {
  const request = buildPublishedListRequest(kind, scope, eventId, organisationId);

  console.log('[Eventor] Published list request', {
    endpoint: request.endpoint,
    headers: {
      Accept: 'application/xml',
      ApiKey: '[masked]',
    },
    query: request.params,
  });

  const response = await fetch(request.endpoint, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] Published list failed', {
      endpoint: request.endpoint,
      kind,
      scope,
      status: response.status,
    });
    throw new Error(mapEventorError(response.status, xml));
  }

  return xml;
}

function buildPublishedListRequest(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId?: string,
) {
  if (kind === 'entries') {
    const params = new URLSearchParams({
      eventIds: eventId,
      includeOrganisationElement: 'true',
      includePersonElement: 'true',
    });

    if (scope === 'organisation' && organisationId) {
      params.set('organisationIds', organisationId);
    }

    return {
      endpoint: buildEventorUrl(`/entries?${params.toString()}`),
      params: Object.fromEntries(params.entries()),
    };
  }

  if (kind === 'starts') {
    const params = new URLSearchParams({ eventId });

    return {
      endpoint: buildEventorUrl(`/starts/event/iofxml?${params.toString()}`),
      params: Object.fromEntries(params.entries()),
    };
  }

  const params = new URLSearchParams({ eventId });

  return {
    endpoint: buildEventorUrl(`/results/event/iofxml?${params.toString()}`),
    params: Object.fromEntries(params.entries()),
  };
}

function mapEventorError(status: number, body: string) {
  if (status === 401 || status === 403) {
    return 'Eventor-anropet nekades. Kontrollera lokal API-konfiguration.';
  }

  if (status === 404) {
    return 'Eventor-endpointen kunde inte hittas.';
  }

  if (body.includes('<html')) {
    return 'Eventor svarade med ett oväntat HTML-fel.';
  }

  return `Eventor svarade med felkod ${status}.`;
}
