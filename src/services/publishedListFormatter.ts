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
  selectedEventRaceId?: string | null;
};

export type PublishedListRelayMemberRow = {
  bibNumber?: string;
  controlCard?: string;
  familyName?: string;
  givenName?: string;
  diff?: string;
  leg?: string;
  overallDiff?: string;
  overallPosition?: string;
  overallStatus?: string;
  overallTime?: string;
  position?: string;
  primary: string;
  status?: string;
  startTime?: string;
  time?: string;
  timeSeconds?: number;
  overallTimeSeconds?: number;
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
  relayMembers?: PublishedListRelayMemberRow[];
  status?: string;
  time?: string;
  timeSeconds?: number;
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
      const personId = getNodeText(person?.Id) ?? getNodeText(person?.PersonId) ?? getNodeText(competitor?.PersonId) ?? undefined;
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
        personId,
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
              personId: row.personId,
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
        personId: row.personId,
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
      Event?: unknown;
    };
  };

  const event = getRecord(parsed.StartList?.Event);
  if (isRelayEvent(event)) {
    return formatRelayStartsXml(parsed.StartList?.ClassStart, event, options);
  }

  const raceLookup = buildEventRaceLookup(event);
  const selectedRaceNumber = resolveSelectedRaceNumber(options.selectedEventRaceId, raceLookup);
  const classStarts = toArray<Record<string, unknown>>(parsed.StartList?.ClassStart).map((classStart) => {
    const eventClass = getRecord(classStart.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classStart.Course);
    const courseLengthMeters = toNumber(course?.Length);
    const courseLengthLabel = formatCourseLength(courseLengthMeters);
    const personStarts = toArray<Record<string, unknown>>(classStart.PersonStart)
      .map((personStart) => {
        const person = getRecord(personStart.Person);
        const personName = getPersonNameParts(person);
        const organisation = getRecord(personStart.Organisation);
        const personId = getNodeText(person?.Id) ?? getNodeText(person?.PersonId) ?? undefined;
        const start = getRecord(personStart.Start);
        const bibNumber = getNodeText(personStart.BibNumber) ?? getNodeText(start?.BibNumber) ?? undefined;
        const organisationId = getIdValue(organisation?.Id);
        const startRaceNumber = getRaceNumberValue(start?.raceNumber ?? start?.RaceNumber);
        const startTime = getEventorClockValue(start?.StartTime) ?? '-';

        return {
          bibNumber,
          classLabel,
          courseLengthLabel,
          familyName: personName.family ?? undefined,
          givenName: personName.given ?? undefined,
          organisation: getString(organisation?.Name) ?? '-',
          organisationId: organisationId ?? undefined,
          personId,
          primary: personName.fullName || 'Namn saknas',
          sortStartSeconds: getSecondsFromClockValue(startTime),
          startRaceNumber,
          time: startTime,
        };
      })
      .filter((row) => rowMatchesSelectedRace(row.startRaceNumber, undefined, options.selectedEventRaceId, selectedRaceNumber));

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
            personId: row.personId,
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
            personId: row.personId,
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
      Event?: unknown;
    };
  };

  const event = getRecord(parsed.ResultList?.Event);
  if (isRelayEvent(event)) {
    return formatRelayResultsXml(parsed.ResultList?.ClassResult, event, options);
  }

  const raceLookup = buildEventRaceLookup(event);
  const selectedRaceNumber = resolveSelectedRaceNumber(options.selectedEventRaceId, raceLookup);
  const classResults = toArray<Record<string, unknown>>(parsed.ResultList?.ClassResult).map((classResult) => {
    const eventClass = getRecord(classResult.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classResult.Course);
    const courseLengthMeters = toNumber(course?.Length);
    const courseLengthLabel = formatCourseLength(courseLengthMeters);
    const personResults = toArray<Record<string, unknown>>(classResult.PersonResult)
      .flatMap((personResult) =>
      extractResultRowsFromPersonResult(personResult, {
          classLabel,
          courseLengthMeters,
          courseLengthLabel,
          selectedRaceNumber,
          selectedEventRaceId: options.selectedEventRaceId,
        }),
      )
      .filter((row) => rowMatchesSelectedRace(row.raceNumber, row.raceId, options.selectedEventRaceId, selectedRaceNumber));

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
            timeSeconds: row.timeSeconds,
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
            timeSeconds: row.timeSeconds,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function formatRelayStartsXml(
  classStartNodes: unknown,
  event: Record<string, unknown> | null,
  options: PublishedListFormatOptions,
): PublishedListViewData {
  const raceLookup = buildEventRaceLookup(event);
  const selectedRaceNumber = resolveSelectedRaceNumber(options.selectedEventRaceId, raceLookup);
  const eventId = getString(getRecord(event)?.Id) ?? 'event';
  const eventName = getString(event?.Name) ?? 'Tävling';
  const eventDate = extractDate(event?.StartTime) ?? extractDate(event?.Date) ?? '';
  const classStarts = toArray<Record<string, unknown>>(classStartNodes).map((classStart) => {
    const eventClass = getRecord(classStart.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classStart.Course);
    const courseLengthLabel = formatCourseLength(toNumber(course?.Length));
    const teamRows = toArray<Record<string, unknown>>(classStart.TeamStart)
      .map((teamStart, teamIndex) =>
        buildRelayStartTeamRow(teamStart, {
          classLabel,
          eventDate,
          eventId,
          eventName,
          raceLookup,
          selectedEventRaceId: options.selectedEventRaceId,
          selectedRaceNumber,
          teamIndex,
        }),
      )
      .filter((row): row is PublishedListRow & { sortBibKey: number; sortKey: number } => Boolean(row));

    return {
      classLabel,
      courseLengthLabel,
      rows: teamRows,
      startCount: `${teamRows.length}`,
    };
  });

  if (options.scope === 'organisation') {
    const rows = classStarts
      .flatMap((section) => section.rows)
      .filter((row) => row.organisationId === options.organisationId)
      .sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey) || compareNullableNumbers(left.sortBibKey, right.sortBibKey));

    return {
      emptyMessage: 'Ingen startlista hittades.',
      sections: [
        {
          meta: `Ant. lag: ${rows.length}`,
          rows: rows.map(({ sortBibKey, sortKey, ...row }) => ({
            bibNumber: row.bibNumber,
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            primary: row.primary,
            relayMembers: row.relayMembers,
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
        meta: [section.startCount ? `Ant. lag: ${section.startCount}` : null, section.courseLengthLabel ? `Bana: ${section.courseLengthLabel}` : null]
          .filter(Boolean)
          .join(' • '),
        rows: section.rows
          .sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey) || compareNullableNumbers(left.sortBibKey, right.sortBibKey))
          .map(({ sortBibKey, sortKey, ...row }) => ({
            bibNumber: row.bibNumber,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            primary: row.primary,
            relayMembers: row.relayMembers,
            time: row.time,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function formatRelayResultsXml(
  classResultNodes: unknown,
  event: Record<string, unknown> | null,
  options: PublishedListFormatOptions,
): PublishedListViewData {
  const raceLookup = buildEventRaceLookup(event);
  const selectedRaceNumber = resolveSelectedRaceNumber(options.selectedEventRaceId, raceLookup);
  const eventId = getString(getRecord(event)?.Id) ?? 'event';
  const eventName = getString(event?.Name) ?? 'Tävling';
  const eventDate = extractDate(event?.StartTime) ?? extractDate(event?.Date) ?? '';
  const classResults = toArray<Record<string, unknown>>(classResultNodes).map((classResult) => {
    const eventClass = getRecord(classResult.Class);
    const classLabel = getString(eventClass?.Name) ?? 'Klass';
    const course = getRecord(classResult.Course);
    const courseLengthLabel = formatCourseLength(toNumber(course?.Length));
    const teamRows = toArray<Record<string, unknown>>(classResult.TeamResult)
      .map((teamResult, teamIndex) =>
        buildRelayResultTeamRow(teamResult, {
          classLabel,
          courseLengthLabel,
          courseLengthMeters: toNumber(course?.Length),
          eventDate,
          eventId,
          eventName,
          raceLookup,
          selectedEventRaceId: options.selectedEventRaceId,
          selectedRaceNumber,
          teamIndex,
        }),
      )
      .filter((row): row is PublishedListRow & { sortKey: number } => Boolean(row));

    return {
      classLabel,
      courseLengthLabel,
      rows: teamRows,
      startCount: `${teamRows.length}`,
    };
  });

  if (options.scope === 'organisation') {
    const rows = classResults
      .flatMap((section) => section.rows)
      .filter((row) => row.organisationId === options.organisationId)
      .sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey) || `${left.classLabel}${left.primary}`.localeCompare(`${right.classLabel}${right.primary}`, 'sv'));

    return {
      emptyMessage: 'Ingen resultatlista hittades.',
      sections: [
        {
          meta: `Ant. lag: ${rows.length}`,
          rows: rows.map(({ sortKey, ...row }) => ({
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            diff: row.diff,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            pace: row.pace,
            position: row.position,
            primary: row.primary,
            relayMembers: row.relayMembers,
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
        meta: [section.startCount ? `Ant. lag: ${section.startCount}` : null, section.courseLengthLabel ? `Bana: ${section.courseLengthLabel}` : null]
          .filter(Boolean)
          .join(' • '),
        rows: section.rows
          .sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey))
          .map(({ sortKey, ...row }) => ({
            classLabel: row.classLabel,
            courseLengthLabel: row.courseLengthLabel ?? undefined,
            diff: row.diff,
            familyName: row.familyName,
            givenName: row.givenName,
            organisation: row.organisation,
            organisationId: row.organisationId,
            pace: row.pace,
            position: row.position,
            primary: row.primary,
            relayMembers: row.relayMembers,
            status: row.status ?? undefined,
            time: row.time,
          })),
        title: section.classLabel,
      }))
      .filter((section) => section.rows.length > 0),
  };
}

function buildRelayStartTeamRow(
  teamStart: Record<string, unknown>,
  context: {
    classLabel: string;
    eventDate: string;
    eventId: string;
    eventName: string;
    raceLookup: RaceLookup;
    selectedEventRaceId: string | null | undefined;
    selectedRaceNumber: string | null;
    teamIndex: number;
  },
): (PublishedListRow & { sortBibKey: number; sortKey: number }) | null {
  const organisation = getRecord(teamStart.Organisation);
  const organisationId = getIdValue(organisation?.Id);
  const teamName = getString(teamStart.Name) ?? 'Lag';
  const memberRows = toArray<Record<string, unknown>>(teamStart.TeamMemberStart)
    .map((memberStart, memberIndex) =>
      buildRelayStartMemberRow(memberStart, context.raceLookup, context.selectedEventRaceId, context.selectedRaceNumber, memberIndex),
    )
    .filter((row): row is PublishedListRelayMemberRow & { sortKey: number } => Boolean(row));

  if (memberRows.length === 0) {
    return null;
  }

  const sortedMembers = memberRows.sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey));
  const firstMember = sortedMembers[0];
  const sortBibKey = toNumber(firstMember?.bibNumber) ?? Number.MAX_SAFE_INTEGER;

  return {
    bibNumber: firstMember?.bibNumber,
    classLabel: context.classLabel,
    familyName: undefined,
    givenName: undefined,
    organisation: getString(organisation?.Name) ?? '-',
    organisationId: organisationId ?? undefined,
    primary: teamName,
    relayMembers: sortedMembers.map(({ sortKey, ...member }) => member),
    sortBibKey,
    sortKey: firstMember?.sortKey ?? Number.MAX_SAFE_INTEGER,
    time: firstMember?.startTime ?? firstMember?.time ?? '-',
  };
}

function buildRelayStartMemberRow(
  memberStart: Record<string, unknown>,
  raceLookup: RaceLookup,
  selectedEventRaceId: string | null | undefined,
  selectedRaceNumber: string | null,
  memberIndex: number,
): (PublishedListRelayMemberRow & { sortKey: number }) | null {
  const person = getRecord(memberStart.Person);
  const personName = getPersonNameParts(person);
  const start = getRecord(memberStart.Start);
  const raceNumber = getRaceNumberValue(start?.raceNumber ?? start?.RaceNumber);
  const raceId = raceNumber ? raceLookup.raceIdByNumber.get(raceNumber) ?? getNodeText(start?.EventRaceId) ?? undefined : getNodeText(start?.EventRaceId) ?? undefined;
  const startTime = getEventorClockValue(start?.StartTime) ?? null;
  const bibNumber = getNodeText(start?.BibNumber) ?? getNodeText(memberStart.BibNumber) ?? undefined;
  const controlCard = getNodeText(memberStart.ControlCard) ?? getNodeText(start?.ControlCard) ?? '';

  if (!rowMatchesSelectedRace(raceNumber, raceId, selectedEventRaceId, selectedRaceNumber)) {
    return null;
  }

  return {
    bibNumber,
    controlCard,
    familyName: personName.family ?? undefined,
    givenName: personName.given ?? undefined,
    leg: getNodeText(start?.Leg) ?? getNodeText(start?.LegOrder) ?? `${memberIndex + 1}`,
    primary: personName.fullName || 'Namn saknas',
    sortKey: getSecondsFromClockValue(startTime) ?? Number.MAX_SAFE_INTEGER,
    startTime: startTime ?? undefined,
    time: startTime ?? '-',
    timeSeconds: getSecondsFromClockValue(startTime) ?? undefined,
  };
}

function buildRelayResultTeamRow(
  teamResult: Record<string, unknown>,
  context: {
    classLabel: string;
    courseLengthLabel: string | null;
    courseLengthMeters: number;
    eventDate: string;
    eventId: string;
    eventName: string;
    raceLookup: RaceLookup;
    selectedEventRaceId: string | null | undefined;
    selectedRaceNumber: string | null;
    teamIndex: number;
  },
): (PublishedListRow & { sortKey: number }) | null {
  const organisation = getRecord(teamResult.Organisation);
  const organisationId = getIdValue(organisation?.Id);
  const teamName = getString(teamResult.Name) ?? 'Lag';
  const memberRows = toArray<Record<string, unknown>>(teamResult.TeamMemberResult)
    .map((memberResult, memberIndex) =>
      buildRelayResultMemberRow(memberResult, context.raceLookup, context.selectedEventRaceId, context.selectedRaceNumber, memberIndex),
    )
    .filter((row): row is PublishedListRelayMemberRow & { sortKey: number } => Boolean(row));

  if (memberRows.length === 0) {
    return null;
  }

  const sortedMembers = memberRows.sort((left, right) => compareNullableNumbers(left.sortKey, right.sortKey));
  let teamStatus: string | null = null;
  for (const member of sortedMembers) {
    const memberStatus = member.status ?? member.overallStatus ?? null;
    if (memberStatus && memberStatus !== 'OK') {
      teamStatus = memberStatus;
    }
  }

  const lastMember = sortedMembers[sortedMembers.length - 1];
  const overallPosition = lastMember?.overallPosition ?? lastMember?.position;
  const overallTime = lastMember?.overallTime ?? lastMember?.time;
  const overallDiff = lastMember?.overallDiff ?? lastMember?.diff;
  const overallStatus = teamStatus ?? lastMember?.overallStatus ?? lastMember?.status;
  const sortKey = overallStatus && overallStatus !== 'OK' ? Number.MAX_SAFE_INTEGER : overallPosition ? Number(overallPosition) : lastMember?.overallTimeSeconds ?? Number.MAX_SAFE_INTEGER;

  return {
    classLabel: context.classLabel,
    courseLengthLabel: context.courseLengthLabel ?? undefined,
    diff: overallDiff ?? undefined,
    familyName: undefined,
    givenName: undefined,
    organisation: getString(organisation?.Name) ?? '-',
    organisationId: organisationId ?? undefined,
    pace: calculatePace(lastMember?.overallTimeSeconds ?? 0, context.courseLengthMeters),
    position: overallPosition ?? '-',
    primary: teamName,
    relayMembers: sortedMembers.map(({ sortKey: memberSortKey, ...member }) => member),
    sortKey,
    status: overallStatus ?? undefined,
    time: overallTime ?? '-',
  };
}

function buildRelayResultMemberRow(
  memberResult: Record<string, unknown>,
  raceLookup: RaceLookup,
  selectedEventRaceId: string | null | undefined,
  selectedRaceNumber: string | null,
  memberIndex: number,
): (PublishedListRelayMemberRow & { sortKey: number }) | null {
  const person = getRecord(memberResult.Person);
  const personName = getPersonNameParts(person);
  const result = getRecord(memberResult.Result);
  const raceNumber = getRaceNumberValue(result?.raceNumber ?? result?.RaceNumber);
  const raceId = raceNumber ? raceLookup.raceIdByNumber.get(raceNumber) ?? getNodeText(result?.EventRaceId) ?? undefined : getNodeText(result?.EventRaceId) ?? undefined;
  const leg = getNodeText(result?.Leg) ?? getNodeText(result?.LegOrder) ?? `${memberIndex + 1}`;
  const legTimeText = getTextValue(result?.Time) ?? null;
  const legDiffText = getTextValue(result?.TimeBehind) ?? getTextValue(result?.TimeDiff) ?? null;
  const legPosition = getNodeText(result?.Position) ?? getNodeText(result?.ResultPosition) ?? null;
  const overall = getRecord(result?.OverallResult) ?? getRecord(memberResult.OverallResult);
  const nestedResult = getRecord(memberResult.Result);
  const nestedOverall = getRecord(memberResult.OverallResult);
  const overallTimeText = getTextValue(overall?.Time) ?? null;
  const overallDiffText = getTextValue(overall?.TimeBehind) ?? getTextValue(overall?.TimeDiff) ?? null;
  const overallPosition = getNodeText(overall?.Position) ?? getNodeText(overall?.ResultPosition) ?? null;
  const status = getStatusText(
    result?.CompetitorStatus ??
      result?.Status ??
      result?.ResultStatus ??
      memberResult.CompetitorStatus ??
      memberResult.Status ??
      memberResult.ResultStatus ??
      memberResult.LegStatus ??
      memberResult.StatusText ??
      nestedResult?.CompetitorStatus ??
      nestedResult?.Status ??
      nestedResult?.ResultStatus,
  );
  const overallStatus = getStatusText(
    overall?.CompetitorStatus ??
      overall?.Status ??
      overall?.ResultStatus ??
      memberResult.OverallCompetitorStatus ??
      memberResult.OverallStatus ??
      memberResult.OverallResultStatus ??
      memberResult.OverallStatusText ??
      nestedOverall?.CompetitorStatus ??
      nestedOverall?.Status ??
      nestedOverall?.ResultStatus,
  );

  if (!rowMatchesSelectedRace(raceNumber, raceId, selectedEventRaceId, selectedRaceNumber)) {
    return null;
  }

  return {
    bibNumber: getNodeText(result?.BibNumber) ?? getNodeText(memberResult.BibNumber) ?? undefined,
    familyName: personName.family ?? undefined,
    givenName: personName.given ?? undefined,
    leg,
    diff: formatRelayTimeBehind(legDiffText) ?? undefined,
    overallDiff: formatRelayTimeBehind(overallDiffText) ?? undefined,
    overallPosition: overallPosition ?? undefined,
    overallStatus: overallStatus ?? undefined,
    overallTime: formatRelayTime(overallTimeText) ?? undefined,
    overallTimeSeconds: parseRelayDurationToSeconds(overallTimeText) ?? undefined,
    position: legPosition ?? undefined,
    primary: personName.fullName || 'Namn saknas',
    sortKey: toNumber(leg) || memberIndex + 1,
    status: status ?? undefined,
    startTime: undefined,
    time: formatRelayTime(legTimeText) ?? undefined,
    timeSeconds: parseRelayDurationToSeconds(legTimeText) ?? undefined,
  };
}

function formatRelayTime(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = parseRelayDurationToSeconds(value);
  if (seconds === null) {
    return value;
  }

  return formatSeconds(seconds);
}

function formatRelayTimeBehind(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = parseRelayDurationToSeconds(value);
  if (seconds === null) {
    return value;
  }

  if (seconds === 0) {
    return null;
  }

  return `+${formatSeconds(seconds)}`;
}

function parseRelayDurationToSeconds(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number(part));

    if (parts.some((part) => !Number.isFinite(part))) {
      return null;
    }

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : null;
}

type RaceLookup = {
  raceIdByNumber: Map<string, string>;
  raceNumberById: Map<string, string>;
};

function buildEventRaceLookup(event: Record<string, unknown> | null): RaceLookup {
  const lookup: RaceLookup = {
    raceIdByNumber: new Map<string, string>(),
    raceNumberById: new Map<string, string>(),
  };

  if (!event) {
    return lookup;
  }

  toArray<Record<string, unknown>>(event.Race).forEach((race, index) => {
    const raceNumber = getRaceNumberValue(race.RaceNumber) ?? `${index + 1}`;
    const raceId =
      getNodeText(getRecord(race.Extensions)?.['eventor:EventRaceId']) ??
      getNodeText(getRecord(race.Extensions)?.EventRaceId) ??
      getNodeText(race.EventRaceId);

    if (!raceId) {
      return;
    }

    lookup.raceIdByNumber.set(raceNumber, raceId);
    lookup.raceNumberById.set(raceId, raceNumber);
  });

  return lookup;
}

function resolveSelectedRaceNumber(selectedEventRaceId: string | null | undefined, lookup: RaceLookup) {
  if (!selectedEventRaceId) {
    return null;
  }

  return lookup.raceNumberById.get(selectedEventRaceId) ?? null;
}

function isRelayEvent(event: Record<string, unknown> | null) {
  const eventForm = getString(event?.eventForm) ?? '';
  const form = getString(event?.Form) ?? '';

  return eventForm === 'RelaySingleDay' || form === 'Relay' || form === 'RelaySingleDay';
}

function rowMatchesSelectedRace(
  rowRaceNumber: string | null | undefined,
  rowRaceId: string | null | undefined,
  selectedEventRaceId: string | null | undefined,
  selectedRaceNumber: string | null,
) {
  if (!selectedEventRaceId) {
    return true;
  }

  const normalizedSelectedRaceId = normalizeRaceKey(selectedEventRaceId);
  const normalizedRowRaceId = normalizeRaceKey(rowRaceId);

  if (normalizedSelectedRaceId && normalizedRowRaceId && normalizedRowRaceId === normalizedSelectedRaceId) {
    return true;
  }

  if (selectedRaceNumber) {
    const normalizedSelectedRaceNumber = normalizeRaceKey(selectedRaceNumber);
    const normalizedRowRaceNumber = normalizeRaceKey(rowRaceNumber);

    if (normalizedSelectedRaceNumber && normalizedRowRaceNumber && normalizedRowRaceNumber === normalizedSelectedRaceNumber) {
      return true;
    }
  }

  return false;
}

function extractResultRowsFromPersonResult(
  personResult: Record<string, unknown>,
  context: {
    classLabel: string;
    courseLengthLabel: string | null;
    courseLengthMeters: number;
    selectedRaceNumber: string | null;
    selectedEventRaceId?: string | null;
  },
) {
  const person = getRecord(personResult.Person);
  const personName = getPersonNameParts(person);
  const organisation = getRecord(personResult.Organisation);
  const organisationId = getIdValue(organisation?.Id);
  const personId = getNodeText(person?.PersonId) ?? getNodeText(person?.Id) ?? undefined;
  const raceResults = toArray<Record<string, unknown>>(personResult.RaceResult);

  if (raceResults.length > 0) {
    return raceResults.flatMap((raceResult) => {
      const raceId = getNodeText(raceResult.EventRaceId) ?? getNodeText(getRecord(raceResult.Result)?.EventRaceId) ?? undefined;
      const raceNumber = getRaceNumberValue(raceResult.raceNumber ?? raceResult.RaceNumber) ?? null;

      const result = getRecord(raceResult.Result);

      return [
        buildPublishedResultRow({
          classLabel: context.classLabel,
          courseLengthLabel: context.courseLengthLabel,
          courseLengthMeters: context.courseLengthMeters,
          organisation,
          organisationId,
          personId,
          personName,
          raceId,
          raceNumber,
          result,
        }),
      ];
    });
  }

  const result = getRecord(personResult.Result);
  const raceId = getNodeText(personResult.EventRaceId) ?? getNodeText(result?.EventRaceId) ?? undefined;
  const raceNumber = getRaceNumberValue(personResult.raceNumber ?? personResult.RaceNumber ?? result?.raceNumber ?? result?.RaceNumber) ?? null;

  return [
    buildPublishedResultRow({
      classLabel: context.classLabel,
      courseLengthLabel: context.courseLengthLabel,
      courseLengthMeters: context.courseLengthMeters,
      organisation,
      organisationId,
      personId,
      personName,
      raceId,
      raceNumber,
      result,
    }),
  ];
}

function buildPublishedResultRow({
  classLabel,
  courseLengthLabel,
  courseLengthMeters,
  organisation,
  organisationId,
  personId,
  personName,
  raceId,
  raceNumber,
  result,
}: {
  classLabel: string;
  courseLengthLabel: string | null;
  courseLengthMeters: number;
  organisation: Record<string, unknown> | null;
  organisationId: string | null | undefined;
  personId: string | undefined;
  personName: { family: string | null; fullName: string; given: string | null };
  raceId?: string;
  raceNumber?: string | null;
  result: Record<string, unknown> | null;
}) {
  const timeSeconds = toNumber(result?.Time);
  const timeBehindSeconds = toNumber(result?.TimeBehind);
  const position = getNodeText(result?.Position) ?? getNodeText(result?.ResultPosition);
  const status = getString(result?.Status) ?? getString(getRecord(result?.CompetitorStatus)?.value) ?? getString(getRecord(result?.CompetitorStatus)?.Value);

  return {
    classLabel,
    courseLengthLabel: courseLengthLabel ?? undefined,
    diff: position ? `+${formatSeconds(timeBehindSeconds)}` : formatResultStatus(status),
    familyName: personName.family ?? undefined,
    givenName: personName.given ?? undefined,
    organisation: getString(organisation?.Name) ?? '-',
    organisationId: organisationId ?? undefined,
    personId,
    pace: calculatePace(timeSeconds, courseLengthMeters),
    position: position ?? '-',
    positionSort: position ? Number(position) : Number.MAX_SAFE_INTEGER,
    primary: personName.fullName || 'Namn saknas',
    raceId,
    raceNumber,
    status,
    time: timeSeconds > 0 ? formatSeconds(timeSeconds) : '-',
    timeSeconds: timeSeconds > 0 ? timeSeconds : undefined,
  };
}

function getRaceNumberValue(value: unknown) {
  const text = getNodeText(value) ?? getString(value);

  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRaceKey(value: string | null | undefined) {
  return value?.trim().replace(/^0+/, '') ?? null;
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

function extractDate(value: unknown) {
  const record = getRecord(value);

  if (record) {
    return getString(record.Date) ?? getNodeText(record.Date) ?? null;
  }

  return getString(value);
}

function getTextValue(value: unknown) {
  return getNodeText(value) ?? getString(value);
}

function getStatusText(value: unknown) {
  const record = getRecord(value);

  if (record) {
    return getString(record.value) ?? getString(record.Value) ?? getNodeText(record) ?? null;
  }

  return getString(value);
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
    return 'Utgått';
  }

  if (status === 'Cancelled') {
    return 'Återb.';
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
