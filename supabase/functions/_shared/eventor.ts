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

/**
 * Extracts the ordinary entry deadline (Swedish local wall-clock,
 * "YYYY-MM-DDTHH:mm:ss") from an event's <EntryBreak> elements, mirroring the
 * client logic in src/utils/mapEventorResponse.ts:
 * - A single EntryBreak means only ordinary entry exists; its ValidToDate is
 *   the deadline.
 * - With several EntryBreaks the one with BOTH a ValidFromDate and ValidToDate
 *   defines it: ordinary closes one minute before late entry opens
 *   (ValidFromDate - 1 min).
 */
export function extractOrdinaryEntryDeadline(xml: string): string | null {
  const blocks = xml.match(/<EntryBreak>[\s\S]*?<\/EntryBreak>/g) ?? [];

  if (blocks.length === 0) {
    return null;
  }

  if (blocks.length === 1) {
    return extractEntryDateTime(blocks[0], 'ValidToDate');
  }

  const relevant = blocks.find((block) => block.includes('<ValidFromDate>') && block.includes('<ValidToDate>'));
  if (!relevant) {
    return null;
  }

  const validFrom = extractEntryDateTime(relevant, 'ValidFromDate');
  return validFrom ? subtractOneMinuteWallClock(validFrom) : null;
}

function extractEntryDateTime(block: string, tag: 'ValidFromDate' | 'ValidToDate'): string | null {
  const inner = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
  if (!inner) {
    return null;
  }

  const date = inner.match(/<Date>\s*([^<]+?)\s*<\/Date>/)?.[1]?.trim();
  if (!date) {
    return null;
  }

  const clock = inner.match(/<Clock>\s*([^<]+?)\s*<\/Clock>/)?.[1]?.trim() ?? '00:00:00';
  return `${date}T${clock}`;
}

function subtractOneMinuteWallClock(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return iso;
  }

  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) - 60000;
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
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
