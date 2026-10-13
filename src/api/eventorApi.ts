import { XMLParser } from 'fast-xml-parser';

import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { formatApiDateTime } from '@/src/services/dateService';
import { DistrictOption, EventCompetitorCount, EventDetail, EventDocument, EventFilterValues, EventItem, EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';
import { mapEventDetailXml, mapEventDocumentsXml, mapEventListXml } from '@/src/utils/mapEventorResponse';
import { fetchViaEventorProxy, EventorProxyEndpoint } from '@/src/services/eventorProxyClient';

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
  // Fetched via the server-side proxy so the Eventor API key never ships in the app.
  const xml = await fetchViaEventorProxy('events', {
    fromDate: formatApiDateTime(filters.fromDate, 'start'),
    toDate: formatApiDateTime(filters.toDate, 'end'),
  });

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
  const xml = await fetchViaEventorProxy('event', { eventId: normalizeEventId(eventId) });
  return mapEventDetailXml(xml, selectedEventRaceId);
}

export async function fetchEventDocumentsForEvent(eventId: string): Promise<EventDocument[]> {
  const xml = await fetchViaEventorProxy('events_documents', { eventIds: normalizeEventId(eventId) });
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

  options.onAttempt?.(1);
  return fetchViaEventorProxy(request.endpoint, request.params);
}

export async function fetchEventSplitTimesXml(
  eventId: string,
  eventRaceId?: string | null,
  options: { onAttempt?: (attempt: number) => void } = {},
) {
  const params: Record<string, unknown> = {
    eventId: normalizeEventId(eventId),
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    includeSplitTimes: 'true',
  };
  // For multi-stage events Eventor only attaches the per-race <Course> (course
  // length) to the stage named by eventRaceId; without it the nested course is
  // only present on race 1, so other stages get no length (and no km-time).
  if (eventRaceId) {
    params.eventRaceId = eventRaceId;
  }

  options.onAttempt?.(1);
  return fetchViaEventorProxy('results_event', params);
}

export async function fetchEventClassNameMap(eventId: string) {
  const xml = await fetchViaEventorProxy('eventclasses', { eventId: normalizeEventId(eventId) });
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
  const result: Record<string, CompetitorCountEntry> = {};

  // Chunk eventIds so the comma-joined query never produces an over-long URL.
  for (const chunk of chunkIdsByLength(normalizedIds)) {
    const params: Record<string, unknown> = { eventIds: chunk.join(',') };
    if (organisationId) {
      params.organisationIds = organisationId;
    }

    // Fetched via the server-side proxy (key stays server-side; shared cache).
    const xml = await fetchViaEventorProxy('competitorcount', params);

    const parsed = parser.parse(xml) as {
      CompetitorCountList?: {
        CompetitorCount?: unknown;
      };
    };

    for (const node of toArray<Record<string, unknown>>(parsed.CompetitorCountList?.CompetitorCount)) {
      const eventId = String(node.eventId ?? '');
      if (!eventId) continue;

      const orgNode = toArray<Record<string, unknown>>(node.OrganisationCompetitorCount)[0] ?? null;

      result[eventId] = {
        totalEntries: toNullableNumber(node.numberOfEntries) ?? 0,
        organisationEntries: orgNode ? (toNullableNumber(orgNode.numberOfEntries) ?? 0) : null,
      };
    }
  }

  return result;
}

function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
}

/**
 * Split ids into chunks whose comma-joined length stays within a safe URL budget,
 * so batching many eventIds never produces an over-long request URL.
 */
function chunkIdsByLength(ids: string[], maxJoinedLen = 1500): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let joinedLen = 0;
  for (const id of ids) {
    const addLen = current.length > 0 ? id.length + 1 : id.length;
    if (current.length > 0 && joinedLen + addLen > maxJoinedLen) {
      chunks.push(current);
      current = [];
      joinedLen = 0;
    }
    joinedLen += current.length > 0 ? id.length + 1 : id.length;
    current.push(id);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function fetchPersonStartsXml(personId: string, fromDate: string, toDate: string) {
  return fetchViaEventorProxy('starts_person', {
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    fromDate,
    personId,
    toDate,
  });
}

const inFlightPersonResults = new Map<string, Promise<string>>();

// Coalesce concurrent identical /results/person requests so the friend detail
// view (Head-to-Head + results list request the same person+year) only hits
// Eventor once. Cleared on settle, so pull-to-refresh still refetches.
export function fetchPersonResultsXml(personId: string, fromDate: string, toDate: string): Promise<string> {
  const key = `${personId}|${fromDate}|${toDate}`;
  const existing = inFlightPersonResults.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetchPersonResultsXmlUncached(personId, fromDate, toDate).finally(() => inFlightPersonResults.delete(key));
  inFlightPersonResults.set(key, promise);
  return promise;
}

async function fetchPersonResultsXmlUncached(personId: string, fromDate: string, toDate: string) {
  return fetchViaEventorProxy('results_person', {
    includeOrganisationElement: 'true',
    includePersonElement: 'true',
    fromDate,
    personId,
    toDate,
  });
}

export async function fetchPersonEntriesXml(personId: string, organisationId: string | null, fromDate: string, toDate: string) {
  const params: Record<string, unknown> = {
    includeEventElement: 'true',
    personIds: personId,
    fromEventDate: fromDate,
    toEventDate: toDate,
  };
  if (organisationId) {
    params.organisationIds = organisationId;
  }
  return fetchViaEventorProxy('entries', params);
}

// Batched variant for checking many people's entries in ONE call (e.g. the
// friends list) instead of one call per person — each <Entry> in the response
// carries its own <Competitor><PersonId>, so callers can attribute rows back to
// the right person. personIds should already be chunked to a safe URL length.
export async function fetchPersonsEntriesXml(personIds: string[], fromDate: string, toDate: string) {
  return fetchViaEventorProxy('entries', {
    includeEventElement: 'true',
    personIds: personIds.join(','),
    fromEventDate: fromDate,
    toEventDate: toDate,
  });
}

export async function fetchEventClassesXml(eventId: string) {
  return fetchViaEventorProxy('eventclasses', { eventId: normalizeEventId(eventId) });
}

function buildPublishedListRequest(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId?: string,
  eventRaceId?: string | null,
): { endpoint: EventorProxyEndpoint; params: Record<string, unknown> } {
  if (kind === 'entries') {
    const params: Record<string, unknown> = {
      eventIds: eventId,
      includeOrganisationElement: 'true',
      includePersonElement: 'true',
    };

    if (scope === 'organisation' && organisationId) {
      params.organisationIds = organisationId;
    }

    return { endpoint: 'entries', params };
  }

  if (kind === 'starts') {
    const params: Record<string, unknown> = { eventId };

    // For multi-stage events the per-race course length is only included when
    // the specific race is requested, so pass eventRaceId when we have it.
    if (eventRaceId) {
      params.eventRaceId = eventRaceId;
    }

    return { endpoint: 'starts_event', params };
  }

  const params: Record<string, unknown> = { eventId };

  if (eventRaceId) {
    params.eventRaceId = eventRaceId;
  }

  return { endpoint: 'results_event', params };
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
  const params: Record<string, unknown> = { eventIds: eventId };
  if (organisationId) {
    params.organisationIds = organisationId;
  }

  const xml = await fetchViaEventorProxy('competitorcount', params);
  return mapCompetitorCountXml(xml, eventRaceId);
}

async function loadOrganisationDirectory(): Promise<OrganisationDirectory> {
  const storedDirectory = await getStoredOrganisationDirectory();

  if (storedDirectory) {
    organisationDirectoryCache = storedDirectory;
    return storedDirectory;
  }

  // Fetched via the server-side proxy (key stays server-side; cached 24h across users).
  const xml = await fetchViaEventorProxy('organisations', {});

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
