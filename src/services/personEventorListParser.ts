import { XMLParser } from 'fast-xml-parser';

import { PersonActivityRow, PersonActivitySection, PersonResultsFilter } from '@/src/types/personLists';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export function parsePersonStartsXml(xml: string): PersonActivitySection[] {
  return parsePersonActivityXml(xml, 'starts');
}

export function parsePersonResultsXml(xml: string): PersonActivitySection[] {
  return parsePersonActivityXml(xml, 'results');
}

export function filterPersonResultSections(sections: PersonActivitySection[], year: number, filter: PersonResultsFilter) {
  return sections
    .filter((section) => Number(section.eventDate.slice(0, 4)) === year)
    .filter((section) => {
      if (filter === 'national') {
        return [0, 1, 2, 6].includes(section.classificationId);
      }

      return [3, 4, 5].includes(section.classificationId);
    });
}

function parsePersonActivityXml(xml: string, kind: 'results' | 'starts'): PersonActivitySection[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const listNodes = extractListNodes(parsed, kind);
  const sections: PersonActivitySection[] = [];

  listNodes.forEach((listNode, listIndex) => {
    const event = getRecord(listNode.Event) ?? getRecord(listNode.EventInfo) ?? getRecord(listNode);
    const eventId = getNodeText(event?.EventId) ?? getNodeText(listNode.EventId) ?? `${kind}-${listIndex}`;
    const eventName = getString(event?.Name) ?? getString(listNode.Name) ?? 'Tävling';
    const eventDate = extractDate(event?.StartDate) ?? extractDate(listNode.StartDate) ?? extractDate(event?.Date) ?? extractDate(listNode.Date) ?? '';
    const classificationId = toNumber(event?.EventClassificationId ?? listNode.EventClassificationId ?? event?.ClassificationId ?? listNode.ClassificationId);
    const classNodes = extractClassNodes(listNode, kind);

    const rows = classNodes.flatMap((classNode, classIndex) =>
      extractRowsFromClassNode(classNode, kind, {
        classFallback: `Klass ${classIndex + 1}`,
        eventDate,
        eventId,
        eventName,
        classificationId,
      }),
    );

    if (rows.length === 0) {
      const rowsFromList = extractRowsFromClassNode(listNode, kind, {
        classFallback: 'Klass',
        eventDate,
        eventId,
        eventName,
        classificationId,
      });

      rows.push(...rowsFromList);
    }

    if (rows.length === 0) {
      return;
    }

    const sectionEntriesCount = rows.find((row) => row.classEntriesCount !== null && row.classEntriesCount !== undefined)?.classEntriesCount;
    const sectionMeta = [
      eventDate ? formatShortDisplayDate(eventDate) : null,
      kind === 'results' && sectionEntriesCount !== undefined ? `Ant. start. ${sectionEntriesCount}` : null,
    ]
      .filter(Boolean)
      .join(' • ');

    sections.push({
      classificationId,
      eventDate,
      eventId,
      meta: sectionMeta || null,
      rows: rows.sort((left, right) => compareRows(left, right, kind)),
      title: eventName,
    });
  });

  return sections
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.title.localeCompare(right.title, 'sv'))
    .filter((section) => section.rows.length > 0);
}

function extractListNodes(parsed: Record<string, unknown>, kind: 'results' | 'starts') {
  const root = kind === 'results' ? getRecord(parsed.ResultListList) : getRecord(parsed.StartListList);
  const listKey = kind === 'results' ? 'ResultList' : 'StartList';

  return toArray<Record<string, unknown>>(root?.[listKey] ?? parsed[listKey] ?? root);
}

function extractClassNodes(listNode: Record<string, unknown>, kind: 'results' | 'starts') {
  const key = kind === 'results' ? 'ClassResult' : 'ClassStart';
  const direct = toArray<Record<string, unknown>>(listNode[key]);

  if (direct.length > 0) {
    return direct;
  }

  return [];
}

function extractRowsFromClassNode(
  classNode: Record<string, unknown>,
  kind: 'results' | 'starts',
  context: {
    classFallback: string;
    eventDate: string;
    eventId: string;
    eventName: string;
    classificationId: number;
  },
) {
  const eventClass = getRecord(classNode.Class) ?? getRecord(classNode.EventClass);
  const classRaceInfo = getRecord(classNode.ClassRaceInfo);
  const course = getRecord(classNode.Course);
  const courseLengthMeters = toNumber(course?.Length);
  const classLabel = getString(eventClass?.Name) ?? getString(eventClass?.ClassShortName) ?? getString(classNode.Name) ?? context.classFallback;
  const classEntriesCount =
    toNullableNumber(classRaceInfo?.noOfStarts) ??
    toNullableNumber(classRaceInfo?.NoOfStarts) ??
    toNullableNumber(classRaceInfo?.numberOfStarts) ??
    toNullableNumber(classRaceInfo?.NumberOfStarts) ??
    toNullableNumber(classRaceInfo?.numberOfEntries) ??
    toNullableNumber(classRaceInfo?.NumberOfEntries) ??
    toNullableNumber(eventClass?.numberOfEntries) ??
    toNullableNumber(eventClass?.NumberOfEntries) ??
    toNullableNumber(eventClass?.numberOfCompetitors) ??
    toNullableNumber(eventClass?.NumberOfCompetitors) ??
    toNullableNumber(classNode.numberOfEntries) ??
    toNullableNumber(classNode.NumberOfEntries) ??
    toNullableNumber(classNode.numberOfCompetitors) ??
    toNullableNumber(classNode.NumberOfCompetitors) ??
    null;
  const personNodes = toArray<Record<string, unknown>>(kind === 'results' ? classNode.PersonResult : classNode.PersonStart);

  return personNodes.map((personNode) => {
    const person = getRecord(personNode.Person);
    const personName = getPersonNameParts(person);
    const organisation = getRecord(personNode.Organisation);
    const organisationId = getNodeText(organisation?.OrganisationId) ?? getNodeText(organisation?.Id) ?? undefined;
    const personId = getNodeText(person?.PersonId) ?? getNodeText(person?.Id) ?? getNodeText(personNode.PersonId) ?? getNodeText(getRecord(personNode.Person)?.PersonId);

    if (kind === 'results') {
      const result = getRecord(personNode.Result) ?? getRecord(personNode);
      const timeText = getTextValue(result?.Time);
      const timeBehindText = getTextValue(result?.TimeDiff) ?? getTextValue(result?.TimeBehind);
      const timeSeconds = parseClockDurationToSeconds(timeText);
      const timeBehindSeconds = parseClockDurationToSeconds(timeBehindText);
      const position = getNodeText(result?.ResultPosition) ?? getNodeText(result?.Position);
      const status = getStatusText(result?.CompetitorStatus ?? result?.Status);

      return {
        classLabel,
        classEntriesCount,
        courseLengthLabel: formatCourseLength(courseLengthMeters) ?? undefined,
        diff: position ? `+${formatResultDuration(timeBehindSeconds)}` : formatResultStatus(status),
        eventDate: context.eventDate,
        eventId: context.eventId,
        eventName: context.eventName,
        organisation: getString(organisation?.Name) ?? '-',
        organisationId,
        personId: personId ?? undefined,
        pace: calculatePace(timeSeconds, courseLengthMeters),
        position: position ?? '-',
        sortKey: position ? Number(position) : Number.MAX_SAFE_INTEGER,
        status: status ?? undefined,
        time: timeText ?? '-',
      } satisfies PersonActivityRow;
    }

    const start = getRecord(personNode.Start) ?? getRecord(personNode);
    const startTime = getEventorClockValue(start?.StartTime) ?? '-';

    return {
      bibNumber: getNodeText(personNode.BibNumber) ?? getNodeText(start?.BibNumber) ?? undefined,
      classLabel,
      classEntriesCount,
      courseLengthLabel: formatCourseLength(courseLengthMeters) ?? undefined,
      eventDate: context.eventDate,
      eventId: context.eventId,
      eventName: context.eventName,
      favouriteId: context.eventId,
      organisation: getString(organisation?.Name) ?? '-',
      organisationId,
      personId: personId ?? undefined,
      sortKey: getSecondsFromClockValue(startTime) ?? Number.MAX_SAFE_INTEGER,
      startTime,
      time: startTime,
    } satisfies PersonActivityRow;
  });
}

function compareRows(left: PersonActivityRow, right: PersonActivityRow, kind: 'results' | 'starts') {
  const byClass = left.classLabel.localeCompare(right.classLabel, 'sv');
  if (byClass !== 0) {
    return byClass;
  }

  if (kind === 'starts') {
    return compareNullableNumbers(left.sortKey, right.sortKey);
  }

  const bySort = compareNullableNumbers(left.sortKey, right.sortKey);
  if (bySort !== 0) {
    return bySort;
  }

  return `${left.eventName}${left.classLabel}${left.time ?? ''}`.localeCompare(`${right.eventName}${right.classLabel}${right.time ?? ''}`, 'sv');
}

function calculatePace(timeSeconds: number, courseLengthMeters: number) {
  if (timeSeconds <= 0 || courseLengthMeters <= 0) {
    return '-';
  }

  const minutesPerKm = timeSeconds / 60 / (courseLengthMeters / 1000);
  return minutesPerKm.toFixed(2);
}

function formatCourseLength(lengthMeters: number) {
  if (lengthMeters <= 0) {
    return null;
  }

  return `${lengthMeters} m`;
}

function formatResultDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseClockDurationToSeconds(value: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace(/^[+-]/, '');
  const parts = normalized.split(':').map((part) => Number(part));

  if (parts.some((part) => !Number.isFinite(part))) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}

function formatResultStatus(status: string | null) {
  if (!status) {
    return '-';
  }

  if (status === 'Missing punch') {
    return 'Felst.';
  }

  if (status === 'DidNotStart') {
    return 'Ej start';
  }

  if (status === 'DidNotFinish') {
    return 'Utgatt';
  }

  if (status === 'Cancelled') {
    return 'Aterb.';
  }

  if (status === 'Disqualified') {
    return 'Disk.';
  }

  return status;
}

function getStatusText(value: unknown) {
  const record = getRecord(value);
  return getString(record?.value) ?? getString(record?.Value) ?? getNodeText(value) ?? getTextValue(value);
}

function getPersonNameParts(person: Record<string, unknown> | null) {
  const personName = getRecord(person?.Name) ?? getRecord(person?.PersonName);
  const family = getString(personName?.Family);
  const given = getNodeText(firstOf(personName?.Given));

  return {
    family,
    fullName: [given, family].filter(Boolean).join(' '),
    given,
  };
}

function getEventorClockValue(value: unknown) {
  const record = getRecord(value);

  if (record) {
    const clock = normalizeClockString(getString(record.Clock));

    if (clock) {
      return clock;
    }
  }

  const rawValue = getString(value);

  if (!rawValue) {
    return null;
  }

  if (rawValue.includes('T') && /(Z|[+-]\d{2}:\d{2})$/.test(rawValue)) {
    return formatIsoDateTimeToLocalClock(rawValue);
  }

  return normalizeClockString(rawValue);
}

function getSecondsFromClockValue(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? '0');
  const minutes = Number(match[2] ?? '0');
  const seconds = Number(match[3] ?? '0');

  return hours * 3600 + minutes * 60 + seconds;
}

function normalizeClockString(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{2}:\d{2}:\d{2}|\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function formatIsoDateTimeToLocalClock(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return normalizeClockString(value);
  }

  return [
    `${parsed.getHours()}`.padStart(2, '0'),
    `${parsed.getMinutes()}`.padStart(2, '0'),
    `${parsed.getSeconds()}`.padStart(2, '0'),
  ].join(':');
}

function extractDate(value: unknown) {
  const record = getRecord(value);
  return getString(record?.Date) ?? getString(value) ?? '';
}

function firstOf(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getNodeText(value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const record = getRecord(value);
  return getString(record?.['#text']) ?? getString(record?.value) ?? getString(record?.Value);
}

function getTextValue(value: unknown) {
  const nodeText = getNodeText(value);
  if (nodeText) {
    return nodeText;
  }

  const record = getRecord(value);
  return (
    getString(record?.['#text']) ??
    getString(record?.value) ??
    getString(record?.Value) ??
    getString(record?.text) ??
    getString(record?.Text) ??
    null
  );
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

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(getNodeText(value) ?? value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumbers(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function formatShortDisplayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  })
    .format(parsed)
    .replace(/\./g, '.')
    .replace(' ', ' ')
    .trim();
}
