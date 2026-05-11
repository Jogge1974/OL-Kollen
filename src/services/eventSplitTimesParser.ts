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
      controlCodes: extractControlCodes(rows),
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
  const splitControlCodes = validSplitNodes.map((splitNode) => getNodeText(splitNode.ControlCode) ?? '').filter((_, i) => splitCumulativeSeconds[i] !== undefined);
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
    splitControlCodes: splitControlCodes.length > 0 ? splitControlCodes : undefined,
    splitCount: splitCumulativeWithFinishSeconds.length,
    splitLossSeconds: [],
    status: status ?? undefined,
    totalPosition: position ?? '-',
    totalTimeLabel: totalTimeText && totalTimeText !== '0' ? formatDuration(totalTimeSeconds) : '-',
    totalTimeSeconds: totalTimeSeconds > 0 ? totalTimeSeconds : null,
    totalLossSeconds: null,
  } satisfies EventSplitTimesRow;
}

// WinSplits-style loss calculation.
// Error thresholds: a leg counts as an error only when the loss exceeds
// BOTH the time threshold (seconds) AND the percent threshold.
// The percent threshold scales down for longer legs (piecewise linear):
//   ≤5 min → 20%, 7 min → 18%, 10 min → 15%, 12 min → 13%, ≥15 min → 10%
const ERROR_THRESHOLD_SECONDS = 20;
const ERROR_PERCENT_BREAKPOINTS: Array<[number, number]> = [
  [5, 20],
  [7, 18],
  [10, 15],
  [12, 13],
  [15, 10],
];

function getErrorThresholdPercent(expectedTimeSeconds: number) {
  const minutes = expectedTimeSeconds / 60;
  const bp = ERROR_PERCENT_BREAKPOINTS;

  if (minutes <= bp[0][0]) return bp[0][1];
  if (minutes >= bp[bp.length - 1][0]) return bp[bp.length - 1][1];

  for (let i = 1; i < bp.length; i += 1) {
    if (minutes <= bp[i][0]) {
      const [minA, pctA] = bp[i - 1];
      const [minB, pctB] = bp[i];
      const fraction = (minutes - minA) / (minB - minA);
      return pctA + fraction * (pctB - pctA);
    }
  }

  return bp[bp.length - 1][1];
}

function extractControlCodes(rows: EventSplitTimesRow[]): string[] {
  // Find the first row with the most splits that has control codes
  const maxSplits = rows.reduce((max, row) => Math.max(max, row.splitCount), 0);
  const referenceRow = rows.find((row) => row.splitControlCodes && row.splitControlCodes.length > 0 && row.splitCount === maxSplits);
  return referenceRow?.splitControlCodes ?? [];
}

function enrichRowsWithLosses(rows: EventSplitTimesRow[]) {
  if (rows.length === 0) {
    return rows;
  }

  const splitCount = rows.reduce((max, row) => Math.max(max, row.splitCount), 0);
  const referenceSplitTimes = getReferenceSplitTimes(rows, splitCount);

  return rows.map((row) => {
    // Step 1: compute performance index per leg = referenceTime / actualTime
    // A higher index means faster relative to the reference.
    const indices: Array<{ index: number; weight: number }> = [];
    for (let i = 0; i < referenceSplitTimes.length; i += 1) {
      const reference = referenceSplitTimes[i];
      const splitTime = getSplitTime(row, i + 1);
      if (reference === null || reference <= 0 || splitTime === null || splitTime <= 0) continue;
      indices.push({ index: reference / splitTime, weight: reference });
    }

    // Step 2: weighted median of performance indices → "normal performance"
    const normalPerformance = weightedMedian(indices);

    // Step 3: for each leg compute expected time and loss
    const splitLossSeconds = referenceSplitTimes.map((reference, i) => {
      const splitTime = getSplitTime(row, i + 1);
      if (reference === null || reference <= 0 || splitTime === null || splitTime <= 0) {
        return null;
      }

      if (normalPerformance <= 0) return null;

      const expectedTime = reference / normalPerformance;
      const diffSeconds = splitTime - expectedTime;
      const diffPercent = (diffSeconds / expectedTime) * 100;
      const percentThreshold = getErrorThresholdPercent(expectedTime);

      // Both thresholds must be exceeded for it to count as an error
      if (diffSeconds > ERROR_THRESHOLD_SECONDS && diffPercent > percentThreshold) {
        return Math.round(diffSeconds);
      }

      return 0;
    });

    const totalLossSeconds =
      row.status && row.status !== 'OK'
        ? null
        : splitLossSeconds.reduce((sum: number, value) => sum + (typeof value === 'number' && value > 0 ? value : 0), 0);

    // referencePercent: how much slower/faster than reference (for display)
    const referencePercent = normalPerformance > 0 ? (1 / normalPerformance) - 1 : 0;

    return {
      ...row,
      referencePercent,
      splitLossSeconds,
      totalLossSeconds,
    } satisfies EventSplitTimesRow;
  });
}

function getReferenceSplitTimes(rows: EventSplitTimesRow[], splitCount: number) {
  const result: Array<number | null> = [];

  for (let splitIndex = 1; splitIndex <= splitCount; splitIndex += 1) {
    const times: number[] = [];
    for (const row of rows) {
      if (row.status && row.status !== 'OK') continue;
      const splitTime = getSplitTime(row, splitIndex);
      if (splitTime !== null) {
        times.push(splitTime);
      }
    }
    // Average of the top 25% fastest split times
    result.push(times.length > 0 ? averageOfTopPercent(times, 25) : null);
  }

  return result;
}

function weightedMedian(items: Array<{ index: number; weight: number }>): number {
  if (items.length === 0) return 0;
  if (items.length === 1) return items[0].index;

  const sorted = [...items].sort((a, b) => a.index - b.index);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  const halfWeight = totalWeight / 2;

  let cumulative = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i].weight;
    if (cumulative >= halfWeight) {
      return sorted[i].index;
    }
  }

  return sorted[sorted.length - 1].index;
}

function averageOfTopPercent(values: number[], percent: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const count = Math.max(1, Math.ceil(sorted.length * percent / 100));
  const topSlice = sorted.slice(0, count);
  return topSlice.reduce((sum, v) => sum + v, 0) / topSlice.length;
}

function medianOfArray(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

const STATUS_SORT_ORDER: Record<string, number> = {
  OK: 0,
  'Missing punch': 1,
  MissingPunch: 1,
  DidNotFinish: 2,
  Disqualified: 3,
  OverTime: 4,
  DidNotStart: 5,
  Cancelled: 6,
};

function getStatusSortOrder(status: string | undefined) {
  if (!status) {
    return 99;
  }

  return STATUS_SORT_ORDER[status] ?? 50;
}

function compareRows(left: EventSplitTimesRow, right: EventSplitTimesRow) {
  const leftPosition = toNullableNumber(left.position) ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = toNullableNumber(right.position) ?? Number.MAX_SAFE_INTEGER;
  const positionCompare = leftPosition - rightPosition;
  if (positionCompare !== 0) {
    return positionCompare;
  }

  const statusCompare = getStatusSortOrder(left.status) - getStatusSortOrder(right.status);
  if (statusCompare !== 0) {
    return statusCompare;
  }

  return left.primary.localeCompare(right.primary, 'sv');
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

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

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
