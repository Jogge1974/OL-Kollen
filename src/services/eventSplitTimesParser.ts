import { XMLParser } from 'fast-xml-parser';

import { EventSplitTimesRow, EventSplitTimesSection } from '@/src/types/eventSplitTimes';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export type EventSplitTimesParseOptions = {
  selectedEventRaceId?: string | null;
};

export function parseEventSplitTimesXml(xml: string, options: EventSplitTimesParseOptions = {}): EventSplitTimesSection[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const event = extractEventNode(parsed);
  const raceLookup = buildEventRaceLookup(event);
  const selectedRaceNumber = resolveSelectedRaceNumber(options.selectedEventRaceId ?? null, raceLookup);
  const classNodes = extractClassNodes(parsed);
  const sections: EventSplitTimesSection[] = [];

  classNodes.forEach((classNode, classIndex) => {
    const classInfo = getRecord(classNode.Class) ?? getRecord(classNode);
    const classRaceInfo = getRecord(classNode.ClassRaceInfo) ?? getRecord(classInfo?.ClassRaceInfo);
    const course = getRecord(classNode.Course);
    const courseLengthMeters = toNumber(course?.Length);
    const classLabel = getString(classInfo?.Name) ?? getString(classInfo?.ShortName) ?? getString(classNode.Name) ?? `Klass ${classIndex + 1}`;
    const classEntriesCount = toNullableNumber(classRaceInfo?.noOfStarts) ?? toNullableNumber(classRaceInfo?.numberOfStarts) ?? toNullableNumber(classInfo?.numberOfCompetitors);
    const classLengthLabel = formatCourseLength(courseLengthMeters);
    const personNodes = toArray<Record<string, unknown>>(classNode.PersonResult);

    const rows = enrichRowsWithLosses(
      personNodes.flatMap((personNode) =>
        parsePersonResultNode(personNode, classLabel, classEntriesCount, classLengthLabel, options.selectedEventRaceId ?? null, selectedRaceNumber, raceLookup),
      ),
    );

    if (rows.length === 0) {
      return;
    }

    sections.push({
      classEntriesCount,
      classLabel,
      classLengthLabel: classLengthLabel ?? undefined,
      classLengthMeters: courseLengthMeters || undefined,
      classificationId: toNullableNumber(classInfo?.EventClassificationId) ?? toNullableNumber(classInfo?.ClassificationId) ?? undefined,
      rows: rows.sort((left, right) => compareRows(left, right)),
    });
  });

  return sections
    .sort((left, right) => left.classLabel.localeCompare(right.classLabel, 'sv'))
    .filter((section) => section.rows.length > 0);
}

function parsePersonResultNode(
  personNode: Record<string, unknown>,
  classLabel: string,
  classEntriesCount: number | null,
  classLengthLabel: string | null,
  selectedEventRaceId: string | null,
  selectedRaceNumber: string | null,
  raceLookup: RaceLookup,
) {
  const person = getRecord(personNode.Person);
  const personName = getPersonNameParts(person);
  const organisation = getRecord(personNode.Organisation);
  const personRecord = getRecord(personNode.Person);
  const personId = getNodeText(personRecord?.PersonId) ?? getNodeText(personRecord?.Id) ?? getNodeText(personNode.PersonId) ?? getNodeText(getRecord(personNode.Person)?.PersonId);
  const directResult = getRecord(personNode.Result) ?? getRecord(personNode);
  const raceResults = toArray<Record<string, unknown>>(personNode.RaceResult);

  if (raceResults.length > 0) {
    const rows = raceResults
      .map((raceResult) => {
        const result = getRecord(raceResult.Result);
        if (!result) {
          return null;
        }

        const raceId = getNodeText(raceResult.EventRaceId) ?? getNodeText(result.EventRaceId) ?? undefined;
        const raceNumber =
          getRaceNumberValue(raceResult.raceNumber ?? raceResult.RaceNumber) ??
          (raceId ? raceLookup.raceNumberById.get(raceId) ?? null : null);

        if (selectedEventRaceId && !matchesSelectedRace(raceId, raceNumber, selectedEventRaceId, selectedRaceNumber)) {
          return null;
        }

        return buildSplitTimesRow({
          classEntriesCount,
          classLabel,
          classLengthLabel,
          organisation,
          personId: personId ?? undefined,
          personName,
          personNode,
          raceId,
          raceNumber,
          result,
        });
      })
      .filter((row): row is EventSplitTimesRow => Boolean(row));

    if (rows.length > 0) {
      return rows;
    }

    if (selectedEventRaceId) {
      return [];
    }
  }

  const raceId = getNodeText(personNode.EventRaceId) ?? getNodeText(directResult?.EventRaceId) ?? undefined;
  const raceNumber =
    getRaceNumberValue(personNode.raceNumber ?? personNode.RaceNumber ?? directResult?.raceNumber ?? directResult?.RaceNumber) ??
    (raceId ? raceLookup.raceNumberById.get(raceId) ?? null : null);

  if (selectedEventRaceId && !matchesSelectedRace(raceId, raceNumber, selectedEventRaceId, selectedRaceNumber)) {
    return [];
  }

  return [
    buildSplitTimesRow({
      classEntriesCount,
      classLabel,
      classLengthLabel,
      organisation,
      personId: personId ?? undefined,
      personName,
      personNode,
      raceId,
      raceNumber,
      result: directResult,
    }),
  ];
}

function buildSplitTimesRow({
  classEntriesCount,
  classLabel,
  classLengthLabel,
  organisation,
  personId,
  personName,
  personNode,
  raceId,
  raceNumber,
  result,
}: {
  classEntriesCount: number | null;
  classLabel: string;
  classLengthLabel: string | null;
  organisation: Record<string, unknown> | null;
  personId: string | undefined;
  personName: { family: string | null; fullName: string; given: string | null };
  personNode: Record<string, unknown>;
  raceId?: string;
  raceNumber?: string | null;
  result: Record<string, unknown> | null;
}): EventSplitTimesRow {
  const splitNodes = toArray<Record<string, unknown>>(result?.SplitTime);
  const validSplitNodes = splitNodes.filter((splitNode) => !isAdditionalSplitTime(splitNode));
  const splitCumulativeSeconds = validSplitNodes.map((splitNode) => parseSeconds(getTextValue(splitNode.Time)));
  const totalTimeText = getTextValue(result?.Time);
  const totalTimeSeconds = parseSeconds(totalTimeText);
  const splitCumulativeWithFinishSeconds = appendFinishSplit(splitCumulativeSeconds, totalTimeSeconds);
  const position = getNodeText(result?.Position) ?? getNodeText(result?.ResultPosition);
  const status = getStatusText(result?.CompetitorStatus ?? result?.Status);

  return {
    bibNumber: getNodeText(personNode.BibNumber) ?? getNodeText(result?.BibNumber) ?? undefined,
    classEntriesCount,
    classLabel,
    classLengthLabel: classLengthLabel ?? undefined,
    eventRaceId: raceId ?? undefined,
    familyName: personName.family ?? undefined,
    givenName: personName.given ?? undefined,
    organisation: getString(organisation?.Name) ?? '-',
    organisationId: getNodeText(organisation?.Id) ?? getNodeText(organisation?.OrganisationId) ?? undefined,
    personId,
    position: position ?? '-',
    primary: personName.fullName || getString(personNode.Name) || 'Okänd',
    raceNumber: raceNumber ?? undefined,
    splitCumulativeSeconds: splitCumulativeWithFinishSeconds,
    splitCount: splitCumulativeWithFinishSeconds.length,
    splitLossSeconds: [],
    status: status ?? undefined,
    totalPosition: position ?? '-',
    totalTimeLabel: totalTimeText && totalTimeText !== '0' ? formatDuration(totalTimeSeconds) : '-',
    totalTimeSeconds: totalTimeSeconds > 0 ? totalTimeSeconds : null,
    totalLossSeconds: null,
  } satisfies EventSplitTimesRow;
}

function enrichRowsWithLosses(rows: EventSplitTimesRow[]) {
  if (rows.length === 0) {
    return rows;
  }

  const bestSplitTimes = getBestSplitTimes(rows);

  return rows.map((row) => {
    const referencePercent = calculateReferencePercent(row, bestSplitTimes);
    const splitLossSeconds = bestSplitTimes.map((bestSplitTime, splitIndex) => calculateSplitLossSeconds(row, splitIndex + 1, bestSplitTime, referencePercent));
    const totalLossSeconds =
      row.status && row.status !== 'OK'
        ? null
        : splitLossSeconds.reduce((sum: number, value) => sum + (typeof value === 'number' && value > 0 ? value : 0), 0);

    return {
      ...row,
      referencePercent,
      splitLossSeconds,
      totalLossSeconds,
    } satisfies EventSplitTimesRow;
  });
}

function getBestSplitTimes(rows: EventSplitTimesRow[]) {
  const splitCount = rows.reduce((max, row) => Math.max(max, row.splitCount), 0);
  const bestSplitTimes: Array<number | null> = Array.from({ length: splitCount }, () => null);

  for (let splitIndex = 1; splitIndex <= splitCount; splitIndex += 1) {
    let bestValue: number | null = null;

    for (const row of rows) {
      const splitTime = getSplitTime(row, splitIndex);
      if (splitTime === null) {
        continue;
      }

      if (bestValue === null || splitTime < bestValue) {
        bestValue = splitTime;
      }
    }

    bestSplitTimes[splitIndex - 1] = bestValue;
  }

  return bestSplitTimes;
}

function calculateReferencePercent(row: EventSplitTimesRow, bestSplitTimes: Array<number | null>) {
  const percentages = bestSplitTimes
    .map((bestSplitTime, splitIndex) => {
      if (bestSplitTime === null || bestSplitTime < 60) {
        return null;
      }

      const splitTime = getSplitTime(row, splitIndex + 1);
      if (splitTime === null || splitTime <= 0) {
        return null;
      }

      return splitTime / bestSplitTime - 1;
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right)
    .slice(0, 5);

  if (percentages.length === 0) {
    return 0;
  }

  return percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
}

function calculateSplitLossSeconds(row: EventSplitTimesRow, splitIndex: number, bestSplitTime: number | null, referencePercent: number) {
  const currentSplit = getSplitTime(row, splitIndex);
  if (currentSplit === null || bestSplitTime === null || bestSplitTime <= 0) {
    return null;
  }

  const acceptedAlternative1 = Math.round(bestSplitTime * (Math.max(0.2, referencePercent) + 1));
  const acceptedAlternative2 =
    bestSplitTime +
    30 +
    Math.round(referencePercent * 100) +
    Math.round(referencePercent * 100) * Math.max(1, Math.round(referencePercent * 10));
  const acceptedTime = Math.min(acceptedAlternative1, acceptedAlternative2);

  if (acceptedTime >= currentSplit) {
    return 0;
  }

  return Math.max(0, currentSplit - Math.round(bestSplitTime + bestSplitTime * referencePercent));
}

function getSplitCumulative(row: EventSplitTimesRow, splitIndex: number) {
  const value = row.splitCumulativeSeconds[splitIndex - 1];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getSplitTime(row: EventSplitTimesRow, splitIndex: number) {
  const current = getSplitCumulative(row, splitIndex);
  const previous = splitIndex === 1 ? 0 : getSplitCumulative(row, splitIndex - 1) ?? 0;

  if (current === null || current <= previous) {
    return null;
  }

  return current - previous;
}

function extractEventNode(parsed: Record<string, unknown>) {
  const rootCandidates = [
    getRecord(parsed.ResultListList),
    getRecord(parsed.ResultList),
    getRecord(getRecord(parsed.ResultListList)?.ResultList),
    getRecord(getRecord(parsed.ResultList)?.ResultList),
    parsed,
  ];

  for (const root of rootCandidates) {
    if (!root) {
      continue;
    }

    const event = getRecord(root.Event);
    if (event) {
      return event;
    }
  }

  return null;
}

function extractClassNodes(parsed: Record<string, unknown>) {
  const rootCandidates = [
    getRecord(parsed.ResultListList),
    getRecord(parsed.ResultList),
    getRecord(getRecord(parsed.ResultListList)?.ResultList),
    getRecord(getRecord(parsed.ResultList)?.ResultList),
    parsed,
  ];

  for (const root of rootCandidates) {
    if (!root) {
      continue;
    }

    const direct = toArray<Record<string, unknown>>(root.ClassResult);
    if (direct.length > 0) {
      return direct;
    }
  }

  return [];
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

function resolveSelectedRaceNumber(selectedEventRaceId: string | null, lookup: RaceLookup) {
  if (!selectedEventRaceId) {
    return null;
  }

  return lookup.raceNumberById.get(selectedEventRaceId) ?? null;
}

function matchesSelectedRace(
  rowRaceId: string | null | undefined,
  rowRaceNumber: string | null | undefined,
  selectedEventRaceId: string | null,
  selectedRaceNumber: string | null,
) {
  if (!selectedEventRaceId) {
    return true;
  }

  const normalizedSelectedRaceId = normalizeRaceKey(selectedEventRaceId);
  const normalizedRowRaceId = normalizeRaceKey(rowRaceId);
  if (normalizedSelectedRaceId && normalizedRowRaceId && normalizedSelectedRaceId === normalizedRowRaceId) {
    return true;
  }

  const normalizedSelectedRaceNumber = normalizeRaceKey(selectedRaceNumber);
  const normalizedRowRaceNumber = normalizeRaceKey(rowRaceNumber);
  if (normalizedSelectedRaceNumber && normalizedRowRaceNumber && normalizedSelectedRaceNumber === normalizedRowRaceNumber) {
    return true;
  }

  return false;
}

function compareRows(left: EventSplitTimesRow, right: EventSplitTimesRow) {
  const leftPosition = toNullableNumber(left.position) ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = toNullableNumber(right.position) ?? Number.MAX_SAFE_INTEGER;
  return leftPosition - rightPosition || left.primary.localeCompare(right.primary, 'sv');
}

function formatCourseLength(lengthMeters: number) {
  if (lengthMeters <= 0) {
    return null;
  }

  return `${lengthMeters} m`;
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getStatusText(value: unknown) {
  const record = getRecord(value);
  return getString(record?.value) ?? getString(record?.Value) ?? getNodeText(value) ?? getTextValue(value);
}

function isAdditionalSplitTime(value: Record<string, unknown>) {
  const status = getString(value.status) ?? getString(value.Status) ?? getString(value['@_status']) ?? getString(value['@status']);
  return typeof status === 'string' && status.toLowerCase() === 'additional';
}

function appendFinishSplit(splitCumulativeSeconds: number[], totalTimeSeconds: number) {
  if (!Number.isFinite(totalTimeSeconds) || totalTimeSeconds <= 0) {
    return splitCumulativeSeconds;
  }

  const lastSplit = splitCumulativeSeconds[splitCumulativeSeconds.length - 1] ?? 0;
  if (totalTimeSeconds <= lastSplit) {
    return splitCumulativeSeconds;
  }

  return [...splitCumulativeSeconds, totalTimeSeconds];
}

function getPersonNameParts(person: Record<string, unknown> | null) {
  const personName = getRecord(person?.Name) ?? getRecord(person?.PersonName);
  const family = getString(personName?.Family);
  const given = getNodeText(personName?.Given);

  return {
    family,
    fullName: [given, family].filter(Boolean).join(' '),
    given,
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
  return getString(record?.text) ?? getString(record?.Text) ?? null;
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

function parseSeconds(value: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0;
  }

  const parts = normalized.split(':').map((part) => Number(part));
  if (parts.every((part) => Number.isFinite(part))) {
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
