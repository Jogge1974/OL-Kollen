import { XMLParser } from 'fast-xml-parser';

import { buildEventorUrl, getEventorApiKey } from '@/src/services/env';
import { formatApiDateTime } from '@/src/services/dateService';
import { EventCompetitorCount, EventDetail, EventDocument, EventFilterValues, EventItem, EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';
import { mapEventDetailXml, mapEventDocumentsXml, mapEventListXml } from '@/src/utils/mapEventorResponse';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export async function fetchEventorEvents(filters: EventFilterValues): Promise<EventItem[]> {
  const apiKey = getEventorApiKey();
  const searchParams = new URLSearchParams({
    fromDate: formatApiDateTime(filters.fromDate, 'start'),
    toDate: formatApiDateTime(filters.toDate, 'end'),
  });
  const requestUrl = buildEventorUrl(`/events?${searchParams.toString()}`);

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

  const mappedEvents = mapEventListXml(xml);
  return filterEventsByClassification(mappedEvents, filters.classificationIds);
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

  return mapEventDetailXml(xml);
}

export async function fetchEventDocumentsForEvent(eventId: string): Promise<EventDocument[]> {
  const searchParams = new URLSearchParams({
    eventIds: eventId,
  });
  const requestUrl = buildEventorUrl(`/events/documents?${searchParams.toString()}`);

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

  return mapEventDocumentsXml(xml);
}

export async function fetchEventPublishedListXml(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId?: string,
) {
  const request = buildPublishedListRequest(kind, scope, eventId, organisationId);

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

export async function fetchEventClassNameMap(eventId: string) {
  const params = new URLSearchParams({ eventId });
  const requestUrl = buildEventorUrl(`/eventclasses?${params.toString()}`);
  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error(mapEventorError(response.status, xml));
  }

  return mapEventClassNamesXml(xml);
}

export async function fetchEventCompetitorCount(eventId: string, organisationId: string | null): Promise<EventCompetitorCount> {
  const counts = await fetchSingleCompetitorCount(eventId, organisationId);

  return {
    organisationEntries: counts.organisationNumberOfEntries,
    organisationStarts: counts.organisationNumberOfStarts,
    totalEntries: counts.numberOfEntries,
    totalStarts: counts.numberOfStarts,
  };
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

function mapEventClassNamesXml(xml: string) {
  const parsed = parser.parse(xml) as {
    EventClassList?: {
      Class?: unknown;
      EventClass?: unknown;
    };
  };
  const classes = toArray<Record<string, unknown>>(parsed.EventClassList?.Class).concat(
    toArray<Record<string, unknown>>(parsed.EventClassList?.EventClass),
  );

  return classes.reduce<Record<string, string>>((result, item) => {
    const classId = getNodeText(item.EventClassId) ?? getNodeText(item.ClassId) ?? getNodeText(item.Id);
    const className = getString(item.Name) ?? getString(item.ClassShortName) ?? null;

    if (classId && className) {
      result[classId] = className;
    }

    return result;
  }, {});
}

async function fetchSingleCompetitorCount(eventId: string, organisationId: string | null) {
  const params = new URLSearchParams({ eventIds: eventId });

  if (organisationId) {
    params.set('organisationIds', organisationId);
  }

  const requestUrl = buildEventorUrl(`/competitorcount?${params.toString()}`);
  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error(mapEventorError(response.status, xml));
  }

  return mapCompetitorCountXml(xml);
}

function mapCompetitorCountXml(xml: string) {
  const parsed = parser.parse(xml) as {
    CompetitorCountList?: {
      CompetitorCount?: unknown;
    };
  };
  const countNode = toArray<Record<string, unknown>>(parsed.CompetitorCountList?.CompetitorCount)[0] ?? {};
  const organisationNode = toArray<Record<string, unknown>>(countNode.OrganisationCompetitorCount)[0] ?? {};

  return {
    numberOfEntries: toNullableNumber(countNode.numberOfEntries),
    numberOfStarts: toNullableNumber(countNode.numberOfStarts),
    organisationNumberOfEntries: toNullableNumber(organisationNode.numberOfEntries),
    organisationNumberOfStarts: toNullableNumber(organisationNode.numberOfStarts),
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

function getNodeText(value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return getString(record['#text']);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function toNullableNumber(value: unknown) {
  const parsedNumber = Number(value);
  return Number.isFinite(parsedNumber) ? parsedNumber : null;
}
