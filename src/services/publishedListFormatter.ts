import { XMLParser } from 'fast-xml-parser';

import { EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export type PublishedListFormatOptions = {
  organisationId?: string | null;
  scope: EventPublishedListScope;
};

export type PublishedListRow = {
  classLabel?: string;
  courseLengthLabel?: string;
  diff?: string;
  familyName?: string;
  givenName?: string;
  organisation?: string;
  pace?: string;
  position?: string;
  primary: string;
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

      return {
        classLabel:
          getString(entryClass?.Name) ??
          getString(entryClass?.ClassShortName) ??
          (getNodeText(entryClass?.EventClassId) ? `Klass ${getNodeText(entryClass?.EventClassId)}` : 'Okänd klass'),
        entryTime: formatDateAndClock(getRecord(entry.EntryDate)) ?? '—',
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? `Organisation ${organisationId ?? 'okänd'}`,
        organisationId,
        primary: personName.fullName || `Person ${getNodeText(competitor?.PersonId) ?? 'okänd'}`,
      };
    })
    .filter((row) => (options.scope === 'organisation' ? row.organisationId === options.organisationId : true));

  if (options.scope === 'organisation') {
    return {
      emptyMessage: 'Inga anmälningar hittades.',
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
              time: row.entryTime,
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
        primary: row.primary,
        time: row.entryTime,
      },
    ]);
  });

  return {
    emptyMessage: 'Inga anmälningar hittades.',
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
      const organisationId = getIdValue(organisation?.Id);

      return {
        classLabel,
        courseLengthLabel,
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? '—',
        organisationId,
        primary: personName.fullName || 'Namn saknas',
        sortStartSeconds: getSecondsFromIso(getString(start?.StartTime)),
        time: getTimeFromIso(getString(start?.StartTime)) ?? '—',
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
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
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
      const position = getNodeText(result?.Position);
      const status = getString(result?.Status);

      return {
        classLabel,
        courseLengthLabel,
        diff: position ? `+${formatSeconds(timeBehindSeconds)}` : status ?? '—',
        familyName: personName.family ?? undefined,
        givenName: personName.given ?? undefined,
        organisation: getString(organisation?.Name) ?? '—',
        organisationId,
        pace: calculatePace(timeSeconds, courseLengthMeters),
        position: position ?? '—',
        positionSort: position ? Number(position) : Number.MAX_SAFE_INTEGER,
        primary: personName.fullName || 'Namn saknas',
        status,
        time: timeSeconds > 0 ? formatSeconds(timeSeconds) : '—',
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
          meta: `Ant. resultat: ${rows.length}`,
          rows: rows.map((row) => ({
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            diff: row.diff,
            familyName: row.familyName,
            givenName: row.givenName,
            pace: row.pace,
            position: row.position,
            primary: row.primary,
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
            pace: row.pace,
            position: row.position,
            primary: row.primary,
            time: row.time,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function calculatePace(timeSeconds: number, courseLengthMeters: number) {
  if (timeSeconds <= 0 || courseLengthMeters <= 0) {
    return '—';
  }

  const minutesPerKm = timeSeconds / 60 / (courseLengthMeters / 1000);
  return minutesPerKm.toFixed(2);
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

function formatDateAndClock(value: Record<string, unknown> | null) {
  const date = getString(value?.Date);
  const clock = getString(value?.Clock);

  if (!date) {
    return null;
  }

  if (!clock) {
    return date;
  }

  return `${date} ${clock.slice(0, 5)}`;
}

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '—';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

function getSecondsFromIso(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function getTimeFromIso(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? null;
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
