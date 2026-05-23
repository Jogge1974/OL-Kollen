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

export function extractPublicationFlags(xml: string) {
  const startPublishedAt = extractPublicationDate(xml, ['officialStart_', 'startList_']);
  const resultPublishedAt = extractPublicationDate(xml, ['officialResult_', 'preliminaryResult_']);

  return {
    hasPublishedResults: Boolean(resultPublishedAt),
    hasPublishedStarts: Boolean(startPublishedAt),
    resultPublishedAt,
    startPublishedAt,
  };
}

function extractPublicationDate(xml: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    const match = xml.match(new RegExp(`<HashTableEntry>\\s*<Key>\\s*${prefix}[^<]+<\\/Key>\\s*<Value>\\s*([^<]+)<\\/Value>`, 'i'));

    if (match?.[1]) {
      return match[1].trim();
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
