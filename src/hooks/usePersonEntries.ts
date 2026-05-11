import * as React from 'react';
import { XMLParser } from 'fast-xml-parser';

import { fetchPersonEntriesXml, fetchEventClassesXml, fetchEventCompetitorCount } from '@/src/api/eventorApi';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export type PersonEntry = {
  eventId: string;
  eventRaceId: string | null;
  eventName: string;
  eventDate: string;
  className: string | null;
  totalEntries: number | null;
  organisationEntries: number | null;
};

type UsePersonEntriesInput = {
  personId: string | null;
  organisationId: string | null;
  /** The logged-in user's organisationId — used for "from organisation" count */
  viewerOrganisationId: string | null;
  /** Set of eventIds already shown in starts or results — these are excluded */
  excludeEventIds: Set<string>;
};

type UsePersonEntriesResult = {
  entries: PersonEntry[];
  error: string | null;
  isLoading: boolean;
  refetch: () => void;
};

export function usePersonEntries({ personId, organisationId, viewerOrganisationId, excludeEventIds }: UsePersonEntriesInput): UsePersonEntriesResult {
  const [entries, setEntries] = React.useState<PersonEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!personId || !organisationId) {
        setEntries([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const todayIso = formatLocalIsoDate(new Date());
        const fromDate = `${todayIso} 00:00:00`;
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 9);
        const toDate = `${formatLocalIsoDate(futureDate)} 23:59:59`;

        const xml = await fetchPersonEntriesXml(personId, organisationId, fromDate, toDate);
        const rawEntries = parseEntriesXml(xml);

        // Filter: only future events (>= today) and not already in starts/results
        const filtered = rawEntries.filter((e) => e.eventDate >= todayIso && !excludeEventIds.has(e.eventId));

        // Sort by date ascending
        filtered.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

        // Enrich with class names and competitor counts (batch per event)
        const enriched = await enrichEntries(filtered, viewerOrganisationId);

        if (!isMounted) return;

        setEntries(enriched);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Okänt fel vid hämtning av anmälningar.';
        setError(message);
        setEntries([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [personId, organisationId, viewerOrganisationId, refreshKey, excludeEventIds]);

  return {
    entries,
    error,
    isLoading,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}

// --------------- XML Parsing ---------------

type RawEntry = {
  eventId: string;
  eventRaceId: string | null;
  eventName: string;
  eventDate: string;
  eventClassId: string | null;
};

function parseEntriesXml(xml: string): RawEntry[] {
  const parsed = parser.parse(xml) as {
    EntryList?: { Entry?: unknown };
  };

  const entryNodes = toArray<Record<string, unknown>>(parsed.EntryList?.Entry);

  return entryNodes.map((entry) => {
    const event = getRecord(entry.Event);
    const eventId = getNodeText(event?.EventId) ?? '';
    const eventName = buildEventName(event);
    const eventDate = getString(getRecord(event?.StartDate)?.Date) ?? '';

    const entryClass = firstOf(entry.EntryClass);
    const entryClassRecord = getRecord(entryClass);
    const eventClassId = getNodeText(entryClassRecord?.EventClassId) ?? null;

    const eventRaceId = getNodeText(entry.EventRaceId) ?? null;

    return { eventId, eventRaceId, eventName, eventDate, eventClassId };
  });
}

function buildEventName(event: Record<string, unknown> | null): string {
  if (!event) return '';
  const mainName = getString(event.Name) ?? '';
  const race = firstOf(event.EventRace);
  const raceRecord = getRecord(race);
  const raceName = raceRecord ? getString(raceRecord.Name) : null;
  if (raceName && raceName.length > 0) {
    return `${mainName}, ${raceName}`;
  }
  return mainName;
}

// --------------- Enrichment ---------------

async function enrichEntries(rawEntries: RawEntry[], viewerOrganisationId: string | null): Promise<PersonEntry[]> {
  // Group by eventId so we only fetch class info and competitor count once per event
  const eventIds = [...new Set(rawEntries.map((e) => e.eventId))];

  // Fetch class maps and competitor counts in parallel per event
  const classMapByEvent: Record<string, Record<string, { name: string; numberOfEntries: number | null }>> = {};
  const competitorCountByEvent: Record<string, { total: number | null; org: number | null }> = {};

  await Promise.all(
    eventIds.map(async (eventId) => {
      const [classMap, counts] = await Promise.all([
        fetchEventClassMap(eventId),
        fetchEventCompetitorCount(eventId, viewerOrganisationId).catch(() => ({
          organisationEntries: null,
          organisationStarts: null,
          totalEntries: null,
          totalStarts: null,
        })),
      ]);
      classMapByEvent[eventId] = classMap;
      competitorCountByEvent[eventId] = {
        total: counts.totalEntries,
        org: counts.organisationEntries,
      };
    }),
  );

  return rawEntries.map((entry) => {
    const classMap = classMapByEvent[entry.eventId] ?? {};
    const classInfo = entry.eventClassId ? classMap[entry.eventClassId] : null;
    const counts = competitorCountByEvent[entry.eventId] ?? { total: null, org: null };

    return {
      eventId: entry.eventId,
      eventRaceId: entry.eventRaceId,
      eventName: entry.eventName,
      eventDate: entry.eventDate,
      className: classInfo?.name ?? null,
      totalEntries: counts.total,
      organisationEntries: counts.org,
    };
  });
}

async function fetchEventClassMap(eventId: string): Promise<Record<string, { name: string; numberOfEntries: number | null }>> {
  try {
    const xml = await fetchEventClassesXml(eventId);
    return parseEventClassesXml(xml);
  } catch {
    return {};
  }
}

function parseEventClassesXml(xml: string): Record<string, { name: string; numberOfEntries: number | null }> {
  const parsed = parser.parse(xml) as {
    EventClassList?: {
      Class?: unknown;
      EventClass?: unknown;
    };
  };

  const classes = toArray<Record<string, unknown>>(parsed.EventClassList?.Class).concat(
    toArray<Record<string, unknown>>(parsed.EventClassList?.EventClass),
  );

  const result: Record<string, { name: string; numberOfEntries: number | null }> = {};
  for (const item of classes) {
    const classId = getNodeText(item.EventClassId) ?? getNodeText(item.ClassId) ?? getNodeText(item.Id);
    const className = getString(item.Name) ?? getString(item.ClassShortName) ?? null;

    // numberOfEntries is an XML attribute on <EventClass numberOfEntries="16">
    let numberOfEntries = toPositiveNumber(item.numberOfEntries) ?? toPositiveNumber(item.NumberOfEntries);

    // Fallback: ClassRaceInfo.noOfEntries
    if (numberOfEntries == null) {
      const raceInfo = firstOf(item.ClassRaceInfo);
      const raceInfoRecord = getRecord(raceInfo);
      if (raceInfoRecord) {
        numberOfEntries = toPositiveNumber(raceInfoRecord.noOfEntries) ?? toPositiveNumber(raceInfoRecord.NoOfEntries);
      }
    }

    if (classId && className) {
      result[classId] = { name: className, numberOfEntries };
    }
  }

  return result;
}

// --------------- Helpers ---------------

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNodeText(value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return getString(record['#text']);
}

function firstOf(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function toNullableNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Returns a positive integer or null. Avoids Number("") = 0 false positives. */
function toPositiveNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
