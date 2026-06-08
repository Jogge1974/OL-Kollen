const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

export async function fetchEventDetailXml(eventId: string) {
  const apiKey = Deno.env.get('EVENTOR_API_KEY');

  if (!apiKey) {
    throw new Error('Missing EVENTOR_API_KEY secret for Eventor polling.');
  }

  const normalizedEventId = normalizeEventId(eventId);

  const response = await fetch(`${EVENTOR_BASE_URL}/event/${normalizedEventId}`, {
    headers: {
      ApiKey: apiKey,
      accept: 'application/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Eventor event/${normalizedEventId} failed with ${response.status}.`);
  }

  return await response.text();
}

function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
}

export function extractPublicationFlags(xml: string, eventRaceId?: string | null) {
  const entries = extractHashEntries(xml);
  const startPublishedAt = findPublicationValue(entries, ['officialStart', 'startList'], eventRaceId);
  const resultPublishedAt = findPublicationValue(entries, ['officialResult', 'preliminaryResult'], eventRaceId);

  return {
    hasPublishedResults: Boolean(resultPublishedAt),
    hasPublishedStarts: Boolean(startPublishedAt),
    resultPublishedAt,
    startPublishedAt,
  };
}

type HashEntry = { key: string; value: string };

/** Parse every <HashTableEntry> into a {key, value} pair (publication keys). */
function extractHashEntries(xml: string): HashEntry[] {
  const entries: HashEntry[] = [];
  const blocks = xml.match(/<HashTableEntry>[\s\S]*?<\/HashTableEntry>/g) ?? [];

  for (const block of blocks) {
    const key = block.match(/<Key>\s*([^<]*?)\s*<\/Key>/)?.[1]?.trim();
    const value = block.match(/<Value>\s*([^<]*?)\s*<\/Value>/)?.[1]?.trim();

    if (key) {
      entries.push({ key, value: value ?? '' });
    }
  }

  return entries;
}

/**
 * Find a publication timestamp for a SPECIFIC stage. Eventor suffixes the
 * publication hash keys with the EventRaceId (e.g. officialResult_58446). When
 * an eventRaceId is given we require an exact `<prefix>_<eventRaceId>` match so
 * one stage's publication never leaks onto another stage. When no eventRaceId is
 * given (legacy favorites stored with a bare event_id) we fall back to matching
 * any suffixed key for the prefix, preserving the previous behaviour.
 */
function findPublicationValue(entries: HashEntry[], prefixes: string[], eventRaceId?: string | null): string | null {
  for (const prefix of prefixes) {
    if (eventRaceId) {
      const exact = entries.find((entry) => entry.key === `${prefix}_${eventRaceId}`);
      if (exact?.value) {
        return exact.value;
      }
    } else {
      const any = entries.find((entry) => entry.key === prefix || entry.key.startsWith(`${prefix}_`));
      if (any?.value) {
        return any.value;
      }
    }
  }

  // Defensive fallback (mirrors the app's raceHasPublishedList): a bare,
  // unsuffixed key counts as this stage's publication when no exact key exists.
  if (eventRaceId) {
    for (const prefix of prefixes) {
      const bare = entries.find((entry) => entry.key === prefix);
      if (bare?.value) {
        return bare.value;
      }
    }
  }

  return null;
}

export function isPublicationAfterFavorite(publicationValue: string | null, favoriteCreatedAt: string | null) {
  if (!publicationValue || !favoriteCreatedAt) {
    return false;
  }

  const publicationDate = parseEventorPublicationDate(publicationValue);
  const favoriteDate = new Date(favoriteCreatedAt);

  if (!publicationDate || Number.isNaN(favoriteDate.getTime())) {
    return false;
  }

  return publicationDate.getTime() > favoriteDate.getTime();
}

function parseEventorPublicationDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const initialUtcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offsetMs = getTimeZoneOffsetMs(new Date(initialUtcMs), 'Europe/Stockholm');
  const adjustedUtcMs = initialUtcMs - offsetMs;
  const adjustedOffsetMs = getTimeZoneOffsetMs(new Date(adjustedUtcMs), 'Europe/Stockholm');

  return new Date(initialUtcMs - adjustedOffsetMs);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);

  const getValue = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  const localAsUtcMs = Date.UTC(
    Number(getValue('year')),
    Number(getValue('month')) - 1,
    Number(getValue('day')),
    Number(getValue('hour')),
    Number(getValue('minute')),
    Number(getValue('second')),
  );

  return localAsUtcMs - date.getTime();
}
