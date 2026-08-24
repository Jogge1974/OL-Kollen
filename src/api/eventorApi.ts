import { XMLParser } from 'fast-xml-parser';

import { buildEventorUrl, getEventorApiKey } from '@/src/services/env';
import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { formatApiDateTime } from '@/src/services/dateService';
import { DistrictOption, EventCompetitorCount, EventDetail, EventDocument, EventFilterValues, EventItem, EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';
import { mapEventDetailXml, mapEventDocumentsXml, mapEventListXml } from '@/src/utils/mapEventorResponse';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type OrganisationDirectory = {
  districtOptions: DistrictOption[];
  organisationNameById: Record<string, string>;
  organisationToDistrictId: Record<string, number>;
};

type StoredOrganisationDirectory = OrganisationDirectory & {
  fetchedAt: string;
};

const ORGANISATION_DIRECTORY_STORAGE_KEY = 'eventor-organisation-directory';
const ORGANISATION_DIRECTORY_TTL_MS = 1000 * 60 * 60 * 24 * 61;

let organisationDirectoryCache: OrganisationDirectory | null = null;
let organisationDirectoryPromise: Promise<OrganisationDirectory> | null = null;

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

  let mappedEvents = mapEventListXml(xml);
  const needsOrganisationDirectory = filters.districtIds.length > 0 || mappedEvents.some(needsOrganiserNameHydration);

  if (needsOrganisationDirectory) {
    const directory = await fetchOrganisationDirectory();
    mappedEvents = hydrateEventOrganisers(mappedEvents, directory.organisationNameById);
  }

  return filterEvents(mappedEvents, filters).sort(sortEventsByDateThenName);
}

function sortEventsByDateThenName(left: EventItem, right: EventItem) {
  const byDate = left.startDate.localeCompare(right.startDate);
  if (byDate !== 0) {
    return byDate;
  }

  return left.name.localeCompare(right.name, 'sv');
}

function filterEvents(events: EventItem[], filters: EventFilterValues) {
  const { classificationIds, districtIds } = filters;
  const disciplineIds = filters.disciplineIds ?? [];

  return events.filter((event) => {
    const matchesClassification =
      classificationIds.length === 0 ||
      classificationIds.includes(event.classificationId) ||
      (event.classificationId === 0 && classificationIds.includes(1));

    if (!matchesClassification) {
      return false;
    }

    // No discipline selected means "all disciplines". Eventor has no server-side
    // discipline filter, so filter the response on the event's DisciplineId.
    if (disciplineIds.length > 0 && !disciplineIds.includes(event.disciplineId)) {
      return false;
    }

    if (districtIds.length === 0) {
      return true;
    }

    return event.organiserIds.some((organisationId) => {
      const districtId = organisationDirectoryCache?.organisationToDistrictId[organisationId];
      return districtId ? districtIds.includes(districtId) : false;
    });
  });
}

export async function fetchEventorEventById(eventId: string, selectedEventRaceId?: string | null): Promise<EventDetail> {
  const normalizedEventId = normalizeEventId(eventId);
  const requestUrl = buildEventorUrl(`/event/${normalizedEventId}`);

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
      eventId: normalizedEventId,
      status: response.status,
      url: requestUrl,
    });
    throw new Error(mapEventorError(response.status, xml));
  }

  return mapEventDetailXml(xml, selectedEventRaceId);
}

export async function fetchEventDocumentsForEvent(eventId: string): Promise<EventDocument[]> {
  const normalizedEventId = normalizeEventId(eventId);
  const searchParams = new URLSearchParams({
    eventIds: normalizedEventId,
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
      eventId: normalizedEventId,
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
  eventRaceId?: string | null,
  options: { onAttempt?: (attempt: number) => void } = {},
) {
  const normalizedEventId = normalizeEventId(eventId);
  const request = buildPublishedListRequest(kind, scope, normalizedEventId, organisationId, eventRaceId);

  return fetchEventorXmlWithRetry(request.endpoint, `Published list ${kind}/${scope}`, {
    onAttempt: options.onAttempt,
  });
}

export async function fetchEventSplitTimesXml(
  eventId: string,
  eventRaceId?: string | null,
  options: { onAttempt?: (attempt: number) => void } = {},
) {
  const normalizedEventId = normalizeEventId(eventId);
  const searchParams = new URLSearchParams({
    eventId: normalizedEventId,
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    includeSplitTimes: 'true',
  });
  // For multi-stage events Eventor only attaches the per-race <Course> (course
  // length) to the stage named by eventRaceId; without it the nested course is
  // only present on race 1, so other stages get no length (and no km-time).
  if (eventRaceId) {
    searchParams.set('eventRaceId', eventRaceId);
  }
  const requestUrl = buildEventorUrl(`/results/event/iofxml?${searchParams.toString()}`);

  return fetchEventorXmlWithRetry(requestUrl, 'Split times', { onAttempt: options.onAttempt });
}

export async function fetchEventClassNameMap(eventId: string) {
  const normalizedEventId = normalizeEventId(eventId);
  const params = new URLSearchParams({ eventId: normalizedEventId });
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

export async function fetchOrganisationDirectory() {
  if (organisationDirectoryCache) {
    return organisationDirectoryCache;
  }

  if (organisationDirectoryPromise) {
    return organisationDirectoryPromise;
  }

  organisationDirectoryPromise = loadOrganisationDirectory().then((directory) => {
    organisationDirectoryCache = directory;
    organisationDirectoryPromise = null;
    return directory;
  });

  return organisationDirectoryPromise;
}

export async function fetchEventCompetitorCount(eventId: string, organisationId: string | null, eventForm?: string | null, eventRaceId?: string | null): Promise<EventCompetitorCount> {
  const normalizedEventId = normalizeEventId(eventId);
  if (isRelayEventForm(eventForm)) {
    const relayCounts = await fetchRelayTeamCounts(normalizedEventId, organisationId);

    return {
      organisationEntries: relayCounts.organisation,
      organisationStarts: relayCounts.organisation,
      totalEntries: relayCounts.total,
      totalStarts: relayCounts.total,
    };
  }

  const counts = await fetchSingleCompetitorCount(normalizedEventId, organisationId, eventRaceId);

  return {
    organisationEntries: counts.organisationNumberOfEntries,
    organisationStarts: counts.organisationNumberOfStarts,
    totalEntries: counts.numberOfEntries,
    totalStarts: counts.numberOfStarts,
  };
}

export type CompetitorCountEntry = {
  totalEntries: number;
  organisationEntries: number | null;
};

export async function fetchBatchCompetitorCounts(
  eventIds: string[],
  organisationId: string | null,
): Promise<Record<string, CompetitorCountEntry>> {
  if (eventIds.length === 0) return {};

  const normalizedIds = eventIds.map(normalizeEventId);
  const params = new URLSearchParams({ eventIds: normalizedIds.join(',') });

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

  const parsed = parser.parse(xml) as {
    CompetitorCountList?: {
      CompetitorCount?: unknown;
    };
  };

  const result: Record<string, CompetitorCountEntry> = {};

  for (const node of toArray<Record<string, unknown>>(parsed.CompetitorCountList?.CompetitorCount)) {
    const eventId = String(node.eventId ?? '');
    if (!eventId) continue;

    const orgNode = toArray<Record<string, unknown>>(node.OrganisationCompetitorCount)[0] ?? null;

    result[eventId] = {
      totalEntries: toNullableNumber(node.numberOfEntries) ?? 0,
      organisationEntries: orgNode ? (toNullableNumber(orgNode.numberOfEntries) ?? 0) : null,
    };
  }

  return result;
}

function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
}

export async function fetchPersonStartsXml(personId: string, fromDate: string, toDate: string) {
  const searchParams = new URLSearchParams({
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    fromDate,
    personId,
    toDate,
  });
  const requestUrl = buildEventorUrl(`/starts/person?${searchParams.toString()}`);

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

  return xml;
}

export async function fetchPersonResultsXml(personId: string, fromDate: string, toDate: string) {
  const searchParams = new URLSearchParams({
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    fromDate,
    personId,
    toDate,
  });
  const requestUrl = buildEventorUrl(`/results/person?${searchParams.toString()}`);

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

  return xml;
}

export async function fetchPersonEntriesXml(personId: string, organisationId: string | null, fromDate: string, toDate: string) {
  const searchParams = new URLSearchParams({
    includeEventElement: 'true',
    personIds: personId,
    fromEventDate: fromDate,
    toEventDate: toDate,
  });
  if (organisationId) {
    searchParams.set('organisationIds', organisationId);
  }
  const requestUrl = buildEventorUrl(`/entries?${searchParams.toString()}`);

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

  return xml;
}

export async function fetchEventClassesXml(eventId: string) {
  const normalizedEventId = normalizeEventId(eventId);
  const params = new URLSearchParams({ eventId: normalizedEventId });
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

  return xml;
}

function buildPublishedListRequest(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId?: string,
  eventRaceId?: string | null,
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

    // For multi-stage events the per-race course length is only included when
    // the specific race is requested, so pass eventRaceId when we have it.
    if (eventRaceId) {
      params.set('eventRaceId', eventRaceId);
    }

    return {
      endpoint: buildEventorUrl(`/starts/event/iofxml?${params.toString()}`),
      params: Object.fromEntries(params.entries()),
    };
  }

  const params = new URLSearchParams({ eventId });

  if (eventRaceId) {
    params.set('eventRaceId', eventRaceId);
  }

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

async function fetchSingleCompetitorCount(eventId: string, organisationId: string | null, eventRaceId?: string | null) {
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

  return mapCompetitorCountXml(xml, eventRaceId);
}

async function loadOrganisationDirectory(): Promise<OrganisationDirectory> {
  const storedDirectory = await getStoredOrganisationDirectory();

  if (storedDirectory) {
    organisationDirectoryCache = storedDirectory;
    return storedDirectory;
  }

  const requestUrl = buildEventorUrl('/organisations');
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

  const parsed = parser.parse(xml) as {
    OrganisationList?: {
      Organisation?: unknown;
    };
  };
  const organisations = toArray<Record<string, unknown>>(parsed.OrganisationList?.Organisation).map((organisation) => {
    return {
      id: getNodeText(organisation.OrganisationId) ?? '',
      name: getString(organisation.Name) ?? '',
      parentId: getNodeText(getRecord(organisation.ParentOrganisation)?.OrganisationId),
      typeId: toNullableNumber(organisation.OrganisationTypeId) ?? 0,
    };
  });
  const organisationById = new Map(organisations.map((organisation) => [organisation.id, organisation]));
  const organisationNameById = organisations.reduce<Record<string, string>>((result, organisation) => {
    if (organisation.id && organisation.name) {
      result[organisation.id] = organisation.name;
    }

    return result;
  }, {});
  const districtOptions = organisations
    .filter((organisation) => organisation.typeId === 2 && organisation.parentId === '1')
    .sort((left, right) => left.name.localeCompare(right.name, 'sv'))
    .map((district) => ({
      id: Number(district.id),
      label: sanitizeDistrictLabel(district.name),
    }));
  const organisationToDistrictId = organisations.reduce<Record<string, number>>((result, organisation) => {
    const districtId = resolveDistrictId(organisation.id, organisationById);

    if (districtId) {
      result[organisation.id] = districtId;
    }

    return result;
  }, {});

  const directory = {
    districtOptions,
    organisationNameById,
    organisationToDistrictId,
  };

  await setStoredJson(ORGANISATION_DIRECTORY_STORAGE_KEY, {
    ...directory,
    fetchedAt: new Date().toISOString(),
  } satisfies StoredOrganisationDirectory);

  return directory;
}

function mapCompetitorCountXml(xml: string, eventRaceId?: string | null) {
  const parsed = parser.parse(xml) as {
    CompetitorCountList?: {
      CompetitorCount?: unknown;
    };
  };
  const allNodes = toArray<Record<string, unknown>>(parsed.CompetitorCountList?.CompetitorCount);

  // If an eventRaceId is specified, prefer the node that matches it;
  // otherwise fall back to the node without eventRaceId (the event total).
  const countNode = eventRaceId
    ? allNodes.find((node) => String(node.eventRaceId ?? '') === eventRaceId) ?? allNodes.find((node) => !node.eventRaceId) ?? allNodes[0] ?? {}
    : allNodes.find((node) => !node.eventRaceId) ?? allNodes[0] ?? {};
  const organisationNode = toArray<Record<string, unknown>>(countNode.OrganisationCompetitorCount)[0] ?? {};

  return {
    numberOfEntries: toNullableNumber(countNode.numberOfEntries),
    numberOfStarts: toNullableNumber(countNode.numberOfStarts),
    organisationNumberOfEntries: toNullableNumber(organisationNode.numberOfEntries),
    organisationNumberOfStarts: toNullableNumber(organisationNode.numberOfStarts),
  };
}

async function fetchRelayTeamCounts(eventId: string, organisationId: string | null): Promise<{ total: number; organisation: number | null }> {
  // Count entered teams from the entries list — the results list is empty until
  // the event is over, which made the "Anmälningar" counter show 0.
  const xml = await fetchEventPublishedListXml('entries', 'public', eventId);
  const parsed = parser.parse(xml) as {
    EntryList?: {
      Entry?: unknown;
    };
  };
  const entries = toArray<Record<string, unknown>>(parsed.EntryList?.Entry);
  const organisation = organisationId
    ? entries.filter((entry) => {
        const firstOrg = getRecord(toArray<Record<string, unknown>>(entry.TeamCompetitor)[0]?.Organisation);
        const orgId = getNodeText(entry.OrganisationId) ?? getNodeText(firstOrg?.OrganisationId);
        return orgId === organisationId;
      }).length
    : null;
  return { organisation, total: entries.length };
}

function isRelayEventForm(eventForm?: string | null) {
  return eventForm === 'RelaySingleDay' || eventForm === 'Relay';
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Fetches XML from Eventor with a request timeout and automatic retries.
 *
 * Large events (e.g. O-ringen, ~36 MB result list / ~90 MB with split times)
 * regularly make Eventor time out or return a 5xx HTML error page under load
 * ("Eventor svarade med ett oväntat HTML-fel"). A couple of retries with
 * exponential backoff clears the vast majority of those transient failures.
 */
async function fetchEventorXmlWithRetry(
  url: string,
  logLabel: string,
  { maxAttempts = 3, timeoutMs = 120000, onAttempt }: { maxAttempts?: number; timeoutMs?: number; onAttempt?: (attempt: number) => void } = {},
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttempt?.(attempt);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    let xml: string;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/xml',
          ApiKey: getEventorApiKey(),
        },
        method: 'GET',
        signal: controller.signal,
      });
      xml = await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      const normalized = error instanceof Error ? error : new Error(String(error));
      const timedOut = normalized.name === 'AbortError';
      lastError = timedOut ? new Error('Eventor svarade inte i tid. Försök igen om en stund.') : normalized;
      console.error(`[Eventor] ${logLabel} network error`, { attempt, timedOut, message: normalized.message });
      if (attempt === maxAttempts) {
        throw lastError;
      }
      await delay(Math.min(1000 * 2 ** (attempt - 1), 5000));
      continue;
    }
    clearTimeout(timeoutId);

    if (response.ok) {
      return xml;
    }

    // 5xx and HTML error pages are transient server-side overload; retry them.
    const retryable = response.status >= 500 || response.status === 429 || xml.includes('<html');
    lastError = new Error(mapEventorError(response.status, xml));
    console.error(`[Eventor] ${logLabel} failed`, { attempt, status: response.status, retryable });

    if (!retryable || attempt === maxAttempts) {
      throw lastError;
    }

    await delay(Math.min(1000 * 2 ** (attempt - 1), 5000));
  }

  throw lastError ?? new Error('Eventor-anropet misslyckades.');
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

function getRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
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

function resolveDistrictId(
  organisationId: string,
  organisationById: Map<string, { id: string; name: string; parentId: string | null; typeId: number }>,
) {
  let current = organisationById.get(organisationId);
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    if (current.typeId === 2 && current.parentId === '1') {
      return Number(current.id);
    }

    if (!current.parentId) {
      return null;
    }

    current = organisationById.get(current.parentId);
  }

  return null;
}

function sanitizeDistrictLabel(label: string) {
  return label.replace('s OF', '').replace(' OF', '').trim();
}

async function getStoredOrganisationDirectory(): Promise<OrganisationDirectory | null> {
  const stored = await getStoredJson<StoredOrganisationDirectory>(ORGANISATION_DIRECTORY_STORAGE_KEY);

  if (!stored || typeof stored !== 'object' || !stored.fetchedAt || isOrganisationDirectoryExpired(stored.fetchedAt)) {
    return null;
  }

  if (
    !Array.isArray(stored.districtOptions) ||
    typeof stored.organisationToDistrictId !== 'object' ||
    stored.organisationToDistrictId === null ||
    typeof stored.organisationNameById !== 'object' ||
    stored.organisationNameById === null
  ) {
    return null;
  }

  return {
    districtOptions: stored.districtOptions.map((option) => ({
      ...option,
      label: sanitizeDistrictLabel(option.label),
    })),
    organisationNameById: stored.organisationNameById,
    organisationToDistrictId: stored.organisationToDistrictId,
  };
}

function isOrganisationDirectoryExpired(fetchedAt: string) {
  const fetchedAtMs = Date.parse(fetchedAt);

  if (!Number.isFinite(fetchedAtMs)) {
    return true;
  }

  return Date.now() - fetchedAtMs > ORGANISATION_DIRECTORY_TTL_MS;
}

function hydrateEventOrganisers(events: EventItem[], organisationNameById: Record<string, string>) {
  if (!organisationNameById || typeof organisationNameById !== 'object') {
    return events;
  }

  return events.map((event) => {
    if (!needsOrganiserNameHydration(event)) {
      return event;
    }

    const organiserNames = event.organiserIds
      .map((organisationId) => organisationNameById[organisationId])
      .filter((name): name is string => Boolean(name));

    if (organiserNames.length === 0) {
      return event;
    }

    return {
      ...event,
      organiserNames,
    };
  });
}

function needsOrganiserNameHydration(event: EventItem) {
  if (event.organiserNames.length === 0) {
    return true;
  }

  return event.organiserNames.every((name) => /^\d+$/.test(name.trim()));
}
