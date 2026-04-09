import { XMLParser } from 'fast-xml-parser';

import { EventSplitTimesRow, EventSplitTimesSection } from '@/src/types/eventSplitTimes';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export function parseEventSplitTimesXml(xml: string): EventSplitTimesSection[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const classNodes = extractClassNodes(parsed);
  const sections: EventSplitTimesSection[] = [];

  classNodes.forEach((classNode, classIndex) => {
    const classInfo = getRecord(classNode.Class) ?? getRecord(classNode);
    const classRaceInfo = getRecord(classNode.ClassRaceInfo);
    const course = getRecord(classNode.Course);
    const classLabel = getString(classInfo?.Name) ?? getString(classInfo?.ShortName) ?? getString(classNode.Name) ?? `Klass ${classIndex + 1}`;
    const classEntriesCount = toNullableNumber(classRaceInfo?.noOfStarts) ?? toNullableNumber(classRaceInfo?.numberOfStarts) ?? toNullableNumber(classInfo?.numberOfCompetitors);
    const classLengthLabel = formatCourseLength(toNumber(course?.Length));
    const personNodes = toArray<Record<string, unknown>>(classNode.PersonResult);

    const rows = personNodes.map((personNode) => parsePersonResultNode(personNode, classLabel, classEntriesCount, classLengthLabel));

    if (rows.length === 0) {
      return;
    }

    sections.push({
      classEntriesCount,
      classLabel,
      classLengthLabel: classLengthLabel ?? undefined,
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
) {
  const person = getRecord(personNode.Person);
  const personName = getPersonNameParts(person);
  const organisation = getRecord(personNode.Organisation);
  const result = getRecord(personNode.Result) ?? getRecord(personNode);
  const splitNodes = toArray<Record<string, unknown>>(result?.SplitTime);
  const splitCumulativeSeconds = splitNodes.map((splitNode) => parseSeconds(getTextValue(splitNode.Time)));
  const totalTimeText = getTextValue(result?.Time);
  const totalTimeSeconds = parseSeconds(totalTimeText);
  const position = getNodeText(result?.Position) ?? getNodeText(result?.ResultPosition);
  const status = getStatusText(result?.CompetitorStatus ?? result?.Status);

  return {
    bibNumber: getNodeText(personNode.BibNumber) ?? getNodeText(result?.BibNumber) ?? undefined,
    classEntriesCount,
    classLabel,
    classLengthLabel: classLengthLabel ?? undefined,
    familyName: personName.family ?? undefined,
    givenName: personName.given ?? undefined,
    organisation: getString(organisation?.Name) ?? '-',
    organisationId: getNodeText(organisation?.Id) ?? getNodeText(organisation?.OrganisationId) ?? undefined,
    position: position ?? '-',
    primary: personName.fullName || getString(person?.Name) || getString(personNode.Name) || 'Okänd',
    splitCumulativeSeconds,
    splitCount: splitCumulativeSeconds.length,
    status: status ?? undefined,
    totalPosition: position ?? '-',
    totalTimeLabel: totalTimeText && totalTimeText !== '0' ? formatDuration(totalTimeSeconds) : '-',
    totalTimeSeconds: totalTimeSeconds > 0 ? totalTimeSeconds : null,
  } satisfies EventSplitTimesRow;
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

  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getStatusText(value: unknown) {
  const record = getRecord(value);
  return getString(record?.value) ?? getString(record?.Value) ?? getNodeText(value) ?? getTextValue(value);
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
