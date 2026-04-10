import { XMLParser } from 'fast-xml-parser';

import { EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';
import { formatPacePerKmLabel } from '@/src/utils/pace';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export type PublishedListFormatOptions = {
  eventClassNameById?: Record<string, string>;
  organisationId?: string | null;
  scope: EventPublishedListScope;
};

export type PublishedListRow = {
  bibNumber?: string;
  classLabel?: string;
  courseLengthLabel?: string;
  diff?: string;
  familyName?: string;
  givenName?: string;
  organisation?: string;
  organisationId?: string;
  personId?: string;
  pace?: string;
  position?: string;
  primary: string;
  status?: string;
  time?: string;
};

export type PublishedListSection = {
  meta?: string;
  rows: PublishedListRow[];
  title: string;
};

export type PublishedListViewData = {
  emptyMessage: string;
  sections: PublishedListSection[];
};

export function formatPublishedListXml(kind: EventPublishedListKind, xml: string, options: PublishedListFormatOptions): PublishedListViewData {
  if (kind === 'results') {
    return formatResultsXml(xml, options);
  }

  if (kind === 'starts') {
    return formatStartsXml(xml, options);
  }

  return formatEntriesXml(xml, options);
}

function formatEntriesXml(xml: string, options: PublishedListFormatOptions): PublishedListViewData {
  const parsed = parser.parse(xml) as {
    EntryList?: {
      Entry?: unknown;
    };
  };

  const entries = toArray<Record<string, unknown>>(parsed.EntryList?.Entry)
    .map((entry) => {
      const competitor = getRecord(entry.Competitor);
      const organisation = getRecord(competitor?.Organisation);
      const organisationId = getNodeText(competitor?.OrganisationId) ?? getNodeText(organisation?.OrganisationId);
      const person = getRecord(competitor?.Person);
      const personName = getPersonNameParts(person);
      const entryClass = getRecord(entry.EntryClass);
      const eventClass = getRecord(entryClass?.EventClass) ?? getRecord(entry.EventClass);
      const eventClassId =
        getNodeText(entryClass?.EventClassId) ??
        getNodeText(eventClass?.EventClassId) ??
        getNodeText(entry.EventClassId) ??
        getNodeText(eventClass?.ClassId);

      return {
        classLabel:
          (eventClassId ? options.eventClassNameById?.[eventClassId] ?? null : null) ??
          getString(eventClass?.Name) ??
          getString(eventClass?.ClassShortName) ??
          getString(entryClass?.Name) ??
          getString(entryClass?.ClassShortName) ??
          (eventClassId ? `Klass ${eventClassId}` : 'Okand klass'),
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? `Klubb ${organisationId ?? 'okand'}`,
        organisationId: organisationId ?? undefined,
        primary: personName.fullName || `Person ${getNodeText(competitor?.PersonId) ?? 'okand'}`,
      };
    })
    .filter((row) => (options.scope === 'organisation' ? row.organisationId === options.organisationId : true));

  if (options.scope === 'organisation') {
    return {
      emptyMessage: 'Inga anmalningar hittades.',
      sections: [
        {
          meta: `Ant. anm: ${entries.length}`,
          rows: entries
            .sort((left, right) => `${left.classLabel}${left.primary}`.localeCompare(`${right.classLabel}${right.primary}`, 'sv'))
            .map((row) => ({
              classLabel: row.classLabel,
              familyName: row.familyName,
              givenName: row.givenName,
              primary: row.primary,
            })),
          title: 'Min klubb',
        },
      ].filter((section) => section.rows.length > 0),
    };
  }

  const groupedSections = new Map<string, PublishedListRow[]>();

  entries.forEach((row) => {
    groupedSections.set(row.classLabel, [
      ...(groupedSections.get(row.classLabel) ?? []),
      {
        familyName: row.familyName,
        givenName: row.givenName,
        organisation: row.organisation,
        organisationId: row.organisationId,
        primary: row.primary,
      },
    ]);
  });

  return {
    emptyMessage: 'Inga anmalningar hittades.',
    sections: Array.from(groupedSections.entries())
      .map(([title, rows]) => ({
        meta: `Ant. anm: ${rows.length}`,
        rows,
        title,
      }))
      .sort((left, right) => left.title.localeCompare(right.title, 'sv')),
  };
}

function formatStartsXml(xml: string, options: PublishedListFormatOptions): PublishedListViewData {
  const parsed = parser.parse(xml) as {
    StartList?: {
      ClassStart?: unknown;
    };
  };

  const classStarts = toArray<Record<string, unknown>>(parsed.StartList?.ClassStart).map((classStart) => {
    const eventClass = getRecord(classStart.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classStart.Course);
    const courseLengthMeters = toNumber(course?.Length);
    const courseLengthLabel = formatCourseLength(courseLengthMeters);
    const personStarts = toArray<Record<string, unknown>>(classStart.PersonStart).map((personStart) => {
      const person = getRecord(personStart.Person);
      const personName = getPersonNameParts(person);
      const organisation = getRecord(personStart.Organisation);
      const start = getRecord(personStart.Start);
      const bibNumber = getNodeText(personStart.BibNumber) ?? getNodeText(start?.BibNumber) ?? undefined;
      const organisationId = getIdValue(organisation?.Id);
      const startTime = getEventorClockValue(start?.StartTime) ?? '-';

      return {
        bibNumber,
        classLabel,
        courseLengthLabel,
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? '-',
        organisationId: organisationId ?? undefined,
        primary: personName.fullName || 'Namn saknas',
        sortStartSeconds: getSecondsFromClockValue(startTime),
        time: startTime,
      };
    });

    return {
      classLabel,
      courseLengthLabel,
      rows: personStarts,
      startCount: getString(eventClass?.numberOfCompetitors) ?? `${personStarts.length}`,
    };
  });

  if (options.scope === 'organisation') {
    const rows = classStarts
      .flatMap((section) => section.rows)
      .filter((row) => row.organisationId === options.organisationId)
      .sort((left, right) => compareNullableNumbers(left.sortStartSeconds, right.sortStartSeconds));

    return {
      emptyMessage: 'Ingen startlista hittades.',
      sections: [
        {
          meta: `Ant. start: ${rows.length}`,
          rows: rows.map((row) => ({
            bibNumber: row.bibNumber,
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            familyName: row.familyName,
            givenName: row.givenName,
            primary: row.primary,
            time: row.time,
          })),
          title: 'Min klubb',
        },
      ].filter((section) => section.rows.length > 0),
    };
  }

  return {
    emptyMessage: 'Ingen startlista hittades.',
    sections: classStarts
      .map((section) => ({
        meta: [section.startCount ? `Ant. start: ${section.startCount}` : null, section.courseLengthLabel ? `Bana: ${section.courseLengthLabel}` : null]
          .filter(Boolean)
          .join(' • '),
        rows: section.rows
          .sort((left, right) => compareNullableNumbers(left.sortStartSeconds, right.sortStartSeconds))
          .map((row) => ({
            bibNumber: row.bibNumber,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            primary: row.primary,
            time: row.time,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function formatResultsXml(xml: string, options: PublishedListFormatOptions): PublishedListViewData {
  const parsed = parser.parse(xml) as {
    ResultList?: {
      ClassResult?: unknown;
    };
  };

  const classResults = toArray<Record<string, unknown>>(parsed.ResultList?.ClassResult).map((classResult) => {
    const eventClass = getRecord(classResult.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classResult.Course);
    const courseLengthMeters = toNumber(course?.Length);
    const courseLengthLabel = formatCourseLength(courseLengthMeters);
    const personResults = toArray<Record<string, unknown>>(classResult.PersonResult).map((personResult) => {
      const person = getRecord(personResult.Person);
      const personName = getPersonNameParts(person);
      const organisation = getRecord(personResult.Organisation);
      const result = getRecord(personResult.Result);
      const organisationId = getIdValue(organisation?.Id);
      const timeSeconds = toNumber(result?.Time);
      const timeBehindSeconds = toNumber(result?.TimeBehind);
      const position = getNodeText(result?.Position) ?? getNodeText(result?.ResultPosition);
      const status = getString(result?.Status);

      return {
        classLabel,
        courseLengthLabel,
        diff: position ? `+${formatSeconds(timeBehindSeconds)}` : formatResultStatus(status),
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? '-',
        organisationId: organisationId ?? undefined,
        personId: getNodeText(person?.PersonId) ?? getNodeText(person?.Id) ?? undefined,
        pace: calculatePace(timeSeconds, courseLengthMeters),
        position: position ?? '-',
        positionSort: position ? Number(position) : Number.MAX_SAFE_INTEGER,
        primary: personName.fullName || 'Namn saknas',
        status,
        time: timeSeconds > 0 ? formatSeconds(timeSeconds) : '-',
      };
    });

    return {
      classLabel,
      courseLengthLabel,
      rows: personResults,
      startCount: getString(eventClass?.numberOfCompetitors) ?? `${personResults.length}`,
    };
  });

  if (options.scope === 'organisation') {
    const rows = classResults
      .flatMap((section) => section.rows)
      .filter((row) => row.organisationId === options.organisationId)
      .sort((left, right) => {
        const positionCompare = compareNullableNumbers(left.positionSort, right.positionSort);
        if (positionCompare !== 0) {
          return positionCompare;
        }

        return `${left.classLabel}${left.primary}`.localeCompare(`${right.classLabel}${right.primary}`, 'sv');
      });

    return {
      emptyMessage: 'Ingen resultatlista hittades.',
      sections: [
        {
          meta: `Ant. start: ${rows.length}`,
          rows: rows.map((row) => ({
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            diff: row.diff,
            familyName: row.familyName,
            givenName: row.givenName,
            personId: row.personId,
            pace: row.pace,
            position: row.position,
            primary: row.primary,
            status: row.status ?? undefined,
            time: row.time,
          })),
          title: 'Min klubb',
        },
      ].filter((section) => section.rows.length > 0),
    };
  }

  return {
    emptyMessage: 'Ingen resultatlista hittades.',
    sections: classResults
      .map((section) => ({
        meta: [section.startCount ? `Ant. start: ${section.startCount}` : null, section.courseLengthLabel ? `Bana: ${section.courseLengthLabel}` : null]
          .filter(Boolean)
          .join(' • '),
        rows: section.rows
          .sort((left, right) => compareNullableNumbers(left.positionSort, right.positionSort))
          .map((row) => ({
            diff: row.diff,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            personId: row.personId,
            pace: row.pace,
            position: row.position,
            primary: row.primary,
            status: row.status ?? undefined,
            time: row.time,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function calculatePace(timeSeconds: number, courseLengthMeters: number) {
  return formatPacePerKmLabel(timeSeconds, courseLengthMeters);
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

function formatCourseLength(lengthMeters: number) {
  if (lengthMeters <= 0) {
    return null;
  }

  return `${lengthMeters} m`;
}

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatResultStatus(status: string | null) {
  if (!status) {
    return '-';
  }

  if (status === 'Missing punch') {
    return 'Felst.';
  }

    if (status === 'MissingPunch') {
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

function getIdValue(value: unknown) {
  return getNodeText(value);
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

function firstOf(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getNodeText(value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const record = getRecord(value);
  return getString(record?.['#text']);
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
  const parsed = Number(getNodeText(value) ?? value);
  return Number.isFinite(parsed) ? parsed : 0;
}
