import { XMLParser } from 'fast-xml-parser';

import { getClassificationLabel } from '@/src/features/calendar/calendarFilters';
import { formatDisplayDate } from '@/src/services/dateService';
import { EventDetail, EventDocument, EventItem } from '@/src/types/eventor';
import { AuthenticatedUser } from '@/src/types/user';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export function mapEventListXml(xml: string): EventItem[] {
  const parsed = parser.parse(xml) as {
    EventList?: {
      Event?: unknown;
    };
  };

  const items = toArray<Record<string, unknown>>(parsed.EventList?.Event);

  return items
    .flatMap((item) => mapEventItems(item))
    .sort((left, right) => `${left.startDate}${left.startClock ?? ''}`.localeCompare(`${right.startDate}${right.startClock ?? ''}`));
}

export function mapPersonXml(xml: string, username: string): AuthenticatedUser {
  const parsed = parser.parse(xml) as {
    Person?: Record<string, unknown>;
  };

  const person = parsed.Person ?? {};
  const personName = getRecord(person.PersonName) ?? getRecord(person.Name);
  const firstName = getNodeText(firstOf(personName?.Given)) ?? getString(person.GivenName) ?? null;
  const lastName = getString(personName?.Family) ?? getString(person.FamilyName) ?? null;
  const fallbackFullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const organisationIds = extractOrganisationIds(person);

  return {
    accessLevel: 'free',
    birthDate: extractDate(person.BirthDate),
    email: extractEmail(person),
    firstName,
    fullName: fallbackFullName ?? getString(person.PersonName) ?? null,
    gender: mapPersonGender(getString(person.sex)),
    lastName,
    organisationIds,
    organisationName: null,
    personId: getString(person.PersonId) ?? getString(person.Id) ?? null,
    username,
  };
}

export function mapEventDetailXml(xml: string, selectedEventRaceId?: string | null): EventDetail {
  const parsed = parser.parse(xml) as {
    Event?: Record<string, unknown>;
  };

  const eventItems = mapEventItems(parsed.Event ?? {});
  const event = (selectedEventRaceId ? eventItems.find((item) => item.eventRaceId === selectedEventRaceId) : null) ?? eventItems[0];

  if (!event) {
    throw new Error('Eventor returnerade en ofullständig tävlingsdetalj.');
  }

  // The Livelox configurations (one id per stage) are ordered by stage, i.e.
  // chronologically — but Eventor does NOT list the <EventRace> elements in that
  // order, so the stage index must be derived from the race dates (tie-broken by
  // EventRaceId), not from the position in the XML.
  const stageOrder = [...eventItems].sort((left, right) => {
    const dateCmp = (left.eventRaceDate ?? '').localeCompare(right.eventRaceDate ?? '');
    return dateCmp !== 0 ? dateCmp : Number(left.eventRaceId) - Number(right.eventRaceId);
  });
  const stageIndex = stageOrder.findIndex((item) => item.eventRaceId === event.eventRaceId);
  const liveloxStageIndex = stageIndex >= 0 ? stageIndex : 0;

  const rawEvent = parsed.Event ?? {};
  const hashEntries = toArray<Record<string, unknown>>(rawEvent.HashTableEntry);
  const hashKeys = hashEntries.map((entry) => getString(entry.Key)).filter((key): key is string => Boolean(key));

  return {
    ...event,
    comment: getString(rawEvent.Comment),
    finishDate: extractDate(rawEvent.FinishDate),
    hasPublishedResults: raceHasPublishedList(hashKeys, ['officialResult', 'preliminaryResult'], event.eventRaceId),
    hasPublishedStarts: raceHasPublishedList(hashKeys, ['officialStart', 'startList'], event.eventRaceId),
    liveloxEventId: extractLiveloxEventId(hashEntries, liveloxStageIndex),
    modifyDate: extractDate(rawEvent.ModifyDate),
    organiserNames: extractOrganisationNames(rawEvent),
    webUrl: getString(rawEvent.WebURL),
    ...extractEntryBreakDates(rawEvent.EntryBreak),
  };
}

export function mapEventDocumentsXml(xml: string): EventDocument[] {
  const parsed = parser.parse(xml) as {
    DocumentList?: {
      Document?: unknown;
    };
  };

  const documents = toArray<Record<string, unknown>>(parsed.DocumentList?.Document);

  return documents
    .map((document) => {
      const url = getString(document.url);
      const id = getString(document.id);
      const name = getString(document.name);

      if (!url || !id || !name) {
        return null;
      }

      return {
        id,
        modifyDate: normalizeModifyDate(getString(document.modifyDate)),
        name,
        referenceId: getString(document.referenceId),
        type: getString(document.type),
        url,
      } satisfies EventDocument;
    })
    .filter((document): document is EventDocument => Boolean(document));
}

function mapEventItems(item: Record<string, unknown>): EventItem[] {
  const id = getString(item.EventId);
  const name = getString(item.Name);
  const startDateNode = getRecord(item.StartDate);
  const eventForm = getString(item.eventForm) ?? '';
  const eventRaces = toArray<Record<string, unknown>>(item.EventRace);
  const organiser = getRecord(item.Organiser);

  if (!id || !name || !startDateNode) {
    return [];
  }

  const classificationId = toNumber(item.EventClassificationId);
  const disciplineId = toNumber(item.DisciplineId);
  const hashEntries = toArray<Record<string, unknown>>(item.HashTableEntry);
  const hashKeys = hashEntries.map((entry) => getString(entry.Key)).filter((key): key is string => Boolean(key));
  const statusId = toNumber(item.EventStatusId);
  const message = extractHashValue(item.HashTableEntry, 'Eventor_Message');
  const organiserNames = extractOrganisationNames(item);
  const organiserIds = toArray<string | Record<string, unknown>>(organiser?.OrganisationId).map((value) => `${value}`);

  return eventRaces.map((eventRace, raceIndex) => {
    const eventRaceId = getString(eventRace.EventRaceId) ?? `${id}-${raceIndex + 1}`;
    const eventRaceName = getString(eventRace.Name) ?? '';
    const eventRaceDate = getString(getRecord(eventRace.RaceDate)?.Date) ?? getString(startDateNode.Date) ?? '';
    const eventRaceClock = getString(getRecord(eventRace.RaceDate)?.Clock) ?? getString(startDateNode.Clock);
    const distanceLabel =
      getString(getRecord(eventRace.WRSInfo)?.Distance) ??
      getString(eventRace.raceDistance) ??
      'Ej angivet';

    return {
      centerPosition: extractCenterPosition(eventRace.EventCenterPosition),
      classificationId,
      classificationLabel: getClassificationLabel(classificationId),
      dateLabel: formatDisplayDate(eventRaceDate),
      disciplineId,
      disciplineLabel: mapDisciplineLabel(disciplineId),
      distanceLabel,
      eventForm,
      eventRaceDate,
      eventRaceId,
      eventRaceName,
      hasPublishedResults: raceHasPublishedList(hashKeys, ['officialResult', 'preliminaryResult'], eventRaceId),
      hasPublishedStarts: raceHasPublishedList(hashKeys, ['officialStart', 'startList'], eventRaceId),
      id: `${id}::${eventRaceId}`,
      message,
      multiStage: eventForm === 'IndMultiStage',
      name: eventRaceName ? `${name} - ${eventRaceName}` : name,
      organiserNames,
      organiserIds,
      startClock: eventRaceClock,
      startDate: eventRaceDate,
      statusId,
      statusLabel: mapStatusLabel(statusId),
    };
  });
}

function extractDate(value: unknown) {
  const record = getRecord(value);
  return getString(record?.Date) ?? getString(value) ?? null;
}

function combineEntryDateTime(value: unknown): string | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const date = getString(record.Date);
  if (!date) {
    return null;
  }

  const clock = getString(record.Clock) ?? '00:00:00';
  return `${date}T${clock}`;
}

function subtractOneMinuteIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  date.setMinutes(date.getMinutes() - 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Eventor exposes entry deadlines as <EntryBreak> elements.
// - A single EntryBreak means there is only ordinary entry (no late entry); its
//   ValidToDate is when ordinary entry closes.
// - With several EntryBreaks the relevant one has BOTH a ValidFromDate and a
//   ValidToDate: ordinary entry closes one minute before late entry opens
//   (ValidFromDate - 1 min), and late entry closes at ValidToDate.
function extractEntryBreakDates(value: unknown): { ordinaryEntryDate: string | null; lateEntryDate: string | null } {
  const entryBreaks = toArray<Record<string, unknown>>(value);

  if (entryBreaks.length === 0) {
    return { ordinaryEntryDate: null, lateEntryDate: null };
  }

  if (entryBreaks.length === 1) {
    return {
      ordinaryEntryDate: combineEntryDateTime(entryBreaks[0].ValidToDate),
      lateEntryDate: null,
    };
  }

  const relevant = entryBreaks.find(
    (entryBreak) => getRecord(entryBreak.ValidFromDate) && getRecord(entryBreak.ValidToDate),
  );

  if (!relevant) {
    return { ordinaryEntryDate: null, lateEntryDate: null };
  }

  const validFrom = combineEntryDateTime(relevant.ValidFromDate);
  const validTo = combineEntryDateTime(relevant.ValidToDate);

  return {
    ordinaryEntryDate: validFrom ? subtractOneMinuteIso(validFrom) : null,
    lateEntryDate: validTo,
  };
}

function extractCenterPosition(value: unknown) {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const longitude = Number(record.x);
  const latitude = Number(record.y);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function extractEmail(person: Record<string, unknown>) {
  const directEmail = getString(person.Email) ?? getString(person.EMail);

  if (directEmail) {
    return directEmail;
  }

  const contact = getRecord(person.Contact);
  return getString(contact?.Email) ?? getString(contact?.EMail) ?? null;
}

function extractHashValue(value: unknown, key: string) {
  const entries = toArray<Record<string, unknown>>(value);
  return entries.find((entry) => getString(entry.Key) === key)?.Value?.toString().trim() ?? null;
}

function extractOrganisationIds(person: Record<string, unknown>) {
  const organisationIds = new Set<string>();
  collectOrganisationIds(person, organisationIds);
  return Array.from(organisationIds);
}

function extractOrganisationNames(event: Record<string, unknown>) {
  const organiser = getRecord(event.Organiser);

  if (!organiser) {
    return [];
  }

  const nestedOrganisations = toArray<Record<string, unknown>>(organiser.Organisation);
  const directOrganiserName = getString(organiser.Name) ?? getString(organiser.ShortName);

  if (nestedOrganisations.length > 0) {
    const names = nestedOrganisations
      .map((organisation) => getString(organisation.Name) ?? getString(organisation.ShortName))
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return names;
    }
  }

  if (directOrganiserName) {
    return [directOrganiserName];
  }

  return toArray<string | Record<string, unknown>>(organiser.OrganisationId).map((value) => `${value}`);
}

function firstOf(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNodeText(value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const record = getRecord(value);
  return getString(record?.['#text']);
}

function collectOrganisationIds(value: unknown, organisationIds: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectOrganisationIds(item, organisationIds));
    return;
  }

  const record = getRecord(value);

  if (!record) {
    return;
  }

  Object.entries(record).forEach(([key, nestedValue]) => {
    if (key === 'OrganisationId') {
      toArray<unknown>(nestedValue).forEach((item) => {
        const identifier = getNodeText(item) ?? `${item}`;

        if (identifier) {
          organisationIds.add(identifier);
        }
      });
      return;
    }

    collectOrganisationIds(nestedValue, organisationIds);
  });
}

function mapDisciplineLabel(id: number) {
  if (id === 1) {
    return 'Orientering';
  }

  if (id === 2) {
    return 'SkidO';
  }

  if (id === 3) {
    return 'MTBO';
  }

  if (id === 4) {
    return 'PreO';
  }

  return `Gren ${id}`;
}

function mapStatusLabel(id: number) {
  if (id === 5) {
    return 'Aktiv';
  }

  if (id === 9) {
    return 'Genomförd';
  }

  if (id === 10) {
    return 'Ändrad';
  }

  return `Status ${id}`;
}

function normalizeModifyDate(value: string | null) {
  if (!value) {
    return null;
  }

  return value.split('T')[0] ?? value;
}

/**
 * True if the event has a published list of the given kind for THIS specific
 * race (stage). Eventor suffixes publication hash keys with the EventRaceId,
 * e.g. `officialResult_58446`, `preliminaryResult_58447`, `startList_58448`.
 * A multi-day event therefore has separate keys per stage; matching only the
 * prefix makes every stage look published the moment any single stage is. We
 * require an exact `<prefix>_<eventRaceId>` match, with a defensive fallback to
 * a bare unsuffixed `<prefix>` so any legacy event that does not suffix its
 * keys keeps its previous behaviour.
 */
function raceHasPublishedList(keys: string[], prefixes: string[], eventRaceId: string) {
  return keys.some((key) => prefixes.some((prefix) => key === prefix || key === `${prefix}_${eventRaceId}`));
}

function extractLiveloxEventId(hashEntries: Record<string, unknown>[], raceIndex = 0) {
  const entry = hashEntries.find((e) => getString(e.Key) === 'Eventor_LiveloxEventConfigurations');
  const value = getString(entry?.Value);

  if (!value) {
    return null;
  }

  // Multi-stage events list one "<liveloxEventId>,<flag>" per stage, separated by
  // ";" in the order the stages occur (e.g. "193998,1;193999,1;194000,1"). Pick
  // the entry matching the selected stage; fall back to the first for single-day
  // events or when the index is out of range.
  const configs = value.split(';').map((part) => part.trim()).filter((part) => part.length > 0);
  const selected = configs[raceIndex] ?? configs[0];
  const id = selected?.split(',')[0]?.trim();
  return id && id.length > 0 ? id : null;
}

function mapPersonGender(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === 'M' || value === 'H') {
    return 'H';
  }

  if (value === 'F' || value === 'D') {
    return 'D';
  }

  return null;
}

function toArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
