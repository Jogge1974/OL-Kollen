const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

export async function fetchEventDetailXml(eventId: string) {
  const apiKey = Deno.env.get('EVENTOR_API_KEY');

  if (!apiKey) {
    throw new Error('Missing EVENTOR_API_KEY secret for Eventor polling.');
  }

  const response = await fetch(`${EVENTOR_BASE_URL}/event/${eventId}`, {
    headers: {
      ApiKey: apiKey,
      accept: 'application/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Eventor event/${eventId} failed with ${response.status}.`);
  }

  return await response.text();
}

export function extractPublicationFlags(xml: string) {
  const startPublishedAt = extractPublicationDate(xml, ['officialStart_', 'startList_']);
  const resultPublishedAt = extractPublicationDate(xml, ['officialResult_']);

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
