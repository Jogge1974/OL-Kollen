import { XMLParser } from 'fast-xml-parser';

import { fetchOrganisationDirectory } from '@/src/api/eventorApi';
import { buildEventorUrl, getEventorApiKey } from '@/src/services/env';
import { getStoredJson, setStoredJson } from '@/src/services/secureStorage';
import { hasSupabaseRuntimeConfig, invokeSupabaseFunction } from '@/src/services/supabase';
import {
  ActivityAttributeDefinition,
  ActivityAttributeType,
  ActivityRegistration,
  ActivityRegistrationAttribute,
  ClubActivity,
} from '@/src/types/eventorActivities';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  // Activity <Information> fields are HTML with many entities (&auml; etc.). The
  // default entity-expansion guard (1000) trips on large clubs, so raise the
  // limits well above what a legitimate response needs.
  processEntities: {
    enabled: true,
    maxEntityCount: 5_000_000,
    maxExpandedLength: 500_000_000,
    maxTotalExpansions: 5_000_000,
  },
  textNodeName: '#text',
  trimValues: true,
});

// Parsed activities are cached per organisation + year for the session so the
// detail screen can reuse the list fetch without hitting the network again.
const ACTIVITIES_TTL_MS = 5 * 60 * 1000;
const activitiesCache = new Map<string, { data: ClubActivity[]; fetchedAt: number }>();

// Member directory (personId -> name) is cached in memory and on disk.
const MEMBERS_TTL_MS = 24 * 60 * 60 * 1000;
const memberCache = new Map<string, { fetchedAt: number; names: Record<string, string> }>();

type MembersStorage = {
  fetchedAt: number;
  names: Record<string, string>;
};

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function fetchOrganisationActivities(organisationId: string, year: number): Promise<ClubActivity[]> {
  const cacheKey = `${organisationId}:${year}`;
  const cached = activitiesCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < ACTIVITIES_TTL_MS) {
    return cached.data;
  }

  const from = encodeURIComponent(`${year}-01-01 00:00:00`);
  const to = encodeURIComponent(`${year}-12-31 23:59:59`);
  const requestUrl = buildEventorUrl(
    `/activities?organisationId=${organisationId}&from=${from}&to=${to}&includeRegistrations=true`,
  );

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  const xml = await response.text();

  if (!response.ok) {
    console.error('[Eventor] GET /activities failed', { status: response.status, url: requestUrl });
    throw new Error(
      response.status === 403
        ? 'Du har inte behörighet att se klubbens aktiviteter.'
        : 'Det gick inte att hämta klubbaktiviteterna just nu.',
    );
  }

  const names = await fetchOrganisationMemberNames(organisationId).catch(() => ({} as Record<string, string>));
  const orgNames = await fetchOrganisationDirectory()
    .then((directory) => directory.organisationNameById)
    .catch(() => ({} as Record<string, string>));
  const activities = parseActivitiesXml(xml, names, orgNames);
  await resolveMissingPersonNames(activities);

  activitiesCache.set(cacheKey, { data: activities, fetchedAt: Date.now() });
  return activities;
}

// Registrants that aren't members of the querying club can't be resolved via the
// Eventor API key, so fill in their names from the Supabase person registry.
async function resolveMissingPersonNames(activities: ClubActivity[]): Promise<void> {
  if (!hasSupabaseRuntimeConfig()) {
    return;
  }

  const missingIds = new Set<string>();
  for (const activity of activities) {
    for (const registration of activity.registrations) {
      if (!registration.personName && registration.personId) {
        missingIds.add(registration.personId);
      }
    }
  }

  if (missingIds.size === 0) {
    return;
  }

  try {
    const response = await invokeSupabaseFunction<{ names?: Record<string, { club?: string; name?: string }> }>(
      'person-names',
      { ids: [...missingIds] },
    );
    const names = response?.names ?? {};

    for (const activity of activities) {
      for (const registration of activity.registrations) {
        if (!registration.personName) {
          const resolved = names[registration.personId];
          if (resolved?.name) {
            registration.personName = resolved.name;
          }
        }
      }
    }
  } catch {
    // Best-effort: fall back to "Deltagare {id}" if the lookup fails.
  }
}

export function getCachedActivity(organisationId: string, year: number, activityId: string): ClubActivity | null {
  const cached = activitiesCache.get(`${organisationId}:${year}`);
  return cached?.data.find((activity) => activity.id === activityId) ?? null;
}

function parseActivitiesXml(xml: string, memberNames: Record<string, string>, orgNames: Record<string, string>): ClubActivity[] {
  const parsed = parser.parse(xml) as { ActivityList?: { Activity?: unknown } };
  const rawActivities = toArray(parsed.ActivityList?.Activity) as Record<string, unknown>[];

  const activities = rawActivities.map((raw) => mapActivity(raw, memberNames, orgNames));
  return sortActivities(activities);
}

function mapActivity(raw: Record<string, unknown>, memberNames: Record<string, string>, orgNames: Record<string, string>): ClubActivity {
  const activityOrgId = String(raw.organisationId ?? '');
  const attributes = toArray(raw.ActivityAttribute as unknown).map(mapAttributeDefinition);
  const attributeById = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const registrations = toArray(raw.ActivityRegistration as unknown).map((registration) =>
    mapRegistration(registration as Record<string, unknown>, attributeById, memberNames, orgNames, activityOrgId),
  );

  const informationHtml = asString(raw.Information);

  return {
    attributes,
    id: String(raw.id ?? ''),
    informationHtml,
    informationText: informationHtml ? htmlToPlainText(informationHtml) : null,
    name: asString(raw.Name) ?? 'Aktivitet',
    registrationCount: Number(raw.registrationCount ?? registrations.length) || registrations.length,
    registrationDeadline: asString(raw.registrationDeadline),
    registrations,
    startTime: asString(raw.startTime),
    url: asString(raw.url) ?? `https://eventor.orientering.se/Activities/Show/${String(raw.id ?? '')}`,
    visibleFrom: asString(raw.visibleFrom),
    visibleTo: asString(raw.visibleTo),
  };
}

function mapAttributeDefinition(raw: Record<string, unknown>): ActivityAttributeDefinition {
  return {
    id: String(raw.id ?? ''),
    name: asString(raw.Name) ?? '',
    order: Number(raw.order ?? 0) || 0,
    type: normaliseAttributeType(asString(raw.type)),
    values: toArray(raw.Value as unknown).map((value) => String(value ?? '').trim()).filter((value) => value.length > 0),
  };
}

function normaliseAttributeType(type: string | null): ActivityAttributeType {
  switch (type) {
    case 'CheckBoxes':
    case 'RadioButtons':
    case 'SingleSelectList':
      return type;
    default:
      return 'Text';
  }
}

function mapRegistration(
  raw: Record<string, unknown>,
  attributeById: Map<string, ActivityAttributeDefinition>,
  memberNames: Record<string, string>,
  orgNames: Record<string, string>,
  activityOrgId: string,
): ActivityRegistration {
  const personId = String(raw.personId ?? '');
  const registrantOrgId = asString(raw.organisationId);
  const isExternal = registrantOrgId != null && activityOrgId !== '' && registrantOrgId !== activityOrgId;
  const clubName = isExternal ? orgNames[registrantOrgId] ?? null : null;
  const attributes: ActivityRegistrationAttribute[] = toArray(raw.AttributeValue as unknown)
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      const attributeId = String(record.activityAttributeId ?? '');
      const value = asString(record['#text']);

      if (!value) {
        return null;
      }

      return {
        attributeId,
        attributeName: attributeById.get(attributeId)?.name ?? '',
        value,
      };
    })
    .filter((entry): entry is ActivityRegistrationAttribute => entry != null);

  return {
    attributes,
    clubName,
    modifyDate: asString(raw.modifyDate),
    organisationId: asString(raw.organisationId),
    personId,
    personName: memberNames[personId] ?? null,
  };
}

// Not-yet-expired activities (visibleTo in the future) come first, expired ones
// after. Within each group activities are ordered by start time (ascending).
function sortActivities(activities: ClubActivity[]): ClubActivity[] {
  const now = Date.now();

  const isExpired = (activity: ClubActivity) => {
    if (!activity.visibleTo) {
      return false;
    }

    const visibleTo = new Date(activity.visibleTo).getTime();
    return Number.isFinite(visibleTo) && visibleTo < now;
  };

  return [...activities].sort((left, right) => {
    const leftExpired = isExpired(left);
    const rightExpired = isExpired(right);

    if (leftExpired !== rightExpired) {
      return leftExpired ? 1 : -1;
    }

    const leftStart = left.startTime ? new Date(left.startTime).getTime() : 0;
    const rightStart = right.startTime ? new Date(right.startTime).getTime() : 0;
    return leftStart - rightStart;
  });
}

async function fetchOrganisationMemberNames(organisationId: string): Promise<Record<string, string>> {
  const memory = memberCache.get(organisationId);
  if (memory && Date.now() - memory.fetchedAt < MEMBERS_TTL_MS) {
    return memory.names;
  }

  const storageKey = `eventor-members-${organisationId}`;
  const stored = await getStoredJson<MembersStorage>(storageKey).catch(() => null);
  if (stored && Date.now() - stored.fetchedAt < MEMBERS_TTL_MS) {
    memberCache.set(organisationId, { fetchedAt: stored.fetchedAt, names: stored.names });
    return stored.names;
  }

  const requestUrl = buildEventorUrl(`/persons/organisations/${organisationId}`);
  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/xml',
      ApiKey: getEventorApiKey(),
    },
    method: 'GET',
  });

  if (!response.ok) {
    return stored?.names ?? {};
  }

  const xml = await response.text();
  const names = parseMemberNamesXml(xml);
  const fetchedAt = Date.now();

  memberCache.set(organisationId, { fetchedAt, names });
  await setStoredJson(storageKey, { fetchedAt, names } satisfies MembersStorage).catch(() => undefined);

  return names;
}

function parseMemberNamesXml(xml: string): Record<string, string> {
  const parsed = parser.parse(xml) as { PersonList?: { Person?: unknown } };
  const persons = toArray(parsed.PersonList?.Person) as Record<string, unknown>[];
  const names: Record<string, string> = {};

  for (const person of persons) {
    const personId = asString(person.PersonId);
    if (!personId) {
      continue;
    }

    const nameNode = person.PersonName as Record<string, unknown> | undefined;
    const given = asString((nameNode?.Given as Record<string, unknown>)?.['#text'] ?? nameNode?.Given);
    const family = asString(nameNode?.Family);
    const fullName = [given, family].filter(Boolean).join(' ').trim();

    if (fullName) {
      names[personId] = fullName;
    }
  }

  return names;
}

const HTML_ENTITIES: Record<string, string> = {
  aring: 'å',
  Aring: 'Å',
  auml: 'ä',
  Auml: 'Ä',
  ouml: 'ö',
  Ouml: 'Ö',
  eacute: 'é',
  Eacute: 'É',
  aacute: 'á',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name] ?? match);
}

// Convert the Eventor rich-text HTML into readable plain text with line breaks
// and bullet points, decoding the HTML entities Eventor uses (&auml; etc.).
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
