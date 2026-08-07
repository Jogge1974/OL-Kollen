import { ActivityDocument, ActivityInfoSegment, ActivityRegistration, ActivityRegistrationAttribute, ActivitySections, ClubActivity } from '@/src/types/eventorActivities';
import { getStoredEventorCredentials } from '@/src/services/eventorCredentials';
import { getStoredEventorWebSessionCookie, refreshStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';

// The Eventor API key is issued to a single org, so activities are scraped from
// the public web pages instead (works for any org and includes district + SOFT).
const EVENTOR_BASE = 'https://eventor.orientering.se';

const SECTIONS_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 5 * 60 * 1000;
const sectionsCache = new Map<string, { data: ActivitySections; fetchedAt: number }>();
const detailCache = new Map<string, { data: ClubActivity; fetchedAt: number }>();

// Eventor's web session (ASP.NET_SessionId) times out; re-login with stored
// credentials to re-authenticate so member-only participant lists show again.
const SESSION_REFRESH_TTL_MS = 5 * 60 * 1000;
let lastSessionRefreshAt = 0;

async function refreshSessionWithStoredCredentials(): Promise<boolean> {
  if (Date.now() - lastSessionRefreshAt < SESSION_REFRESH_TTL_MS) {
    return false;
  }
  try {
    const credentials = await getStoredEventorCredentials();
    if (!credentials?.username || !credentials?.password) {
      return false;
    }
    await refreshStoredEventorWebSessionCookie(credentials.username, credentials.password);
    lastSessionRefreshAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

const SWEDISH_MONTHS: Record<string, number> = {
  april: 3,
  augusti: 7,
  december: 11,
  februari: 1,
  januari: 0,
  juli: 6,
  juni: 5,
  maj: 4,
  mars: 2,
  november: 10,
  oktober: 9,
  september: 8,
};

async function fetchHtml(url: string): Promise<string> {
  // Send the logged-in Eventor session cookie so member-only registration lists
  // are included (public requests only see the participant count).
  const cookie = await getStoredEventorWebSessionCookie().catch(() => null);
  const headers: Record<string, string> = { Accept: 'text/html' };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(url, { credentials: 'include', headers });
  if (!response.ok) {
    throw new Error(`Eventor ${response.status}`);
  }
  return await response.text();
}

export async function fetchOrganisationActivities(organisationId: string): Promise<ActivitySections> {
  const cached = sectionsCache.get(organisationId);
  if (cached && Date.now() - cached.fetchedAt < SECTIONS_TTL_MS) {
    return cached.data;
  }

  let html: string;
  try {
    html = await fetchHtml(`${EVENTOR_BASE}/Activities?organisationId=${organisationId}`);
  } catch {
    throw new Error('Det gick inte att hämta klubbaktiviteterna just nu.');
  }

  const data = parseSectionsHtml(html);
  sectionsCache.set(organisationId, { data, fetchedAt: Date.now() });
  return data;
}

export async function fetchActivityDetail(activityId: string): Promise<ClubActivity> {
  const cached = detailCache.get(activityId);
  if (cached && Date.now() - cached.fetchedAt < DETAIL_TTL_MS) {
    return cached.data;
  }

  const url = `${EVENTOR_BASE}/Activities/Show/${activityId}`;
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    throw new Error('Det gick inte att hämta aktiviteten just nu.');
  }

  let data = parseDetailHtml(html, activityId);

  // Participant list hidden (member-only) but there ARE participants -> the
  // session likely expired; re-authenticate once and retry.
  if (data.registrations.length === 0 && data.registrationCount > 0) {
    const refreshed = await refreshSessionWithStoredCredentials();
    if (refreshed) {
      try {
        data = parseDetailHtml(await fetchHtml(url), activityId);
      } catch {
        // Keep the first result if the retry fails.
      }
    }
  }

  detailCache.set(activityId, { data, fetchedAt: Date.now() });
  return data;
}

export function getCachedActivityDetail(activityId: string): ClubActivity | null {
  return detailCache.get(activityId)?.data ?? null;
}

// ---------------------------------------------------------------------------
// List page parsing
// ---------------------------------------------------------------------------

function parseSectionsHtml(html: string): ActivitySections {
  const page = decodeEntities(html);

  const headingRe = /<h3[^>]*>\s*Aktiviteter för ([\s\S]*?)<\/h3>/g;
  const found: Array<{ name: string; contentStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(page)) !== null) {
    found.push({ contentStart: match.index + match[0].length, name: stripTags(match[1]).trim() });
  }

  const parsedSections = found.map((section) => {
    const tableEnd = page.indexOf('</table>', section.contentStart);
    const tableHtml = tableEnd >= 0 ? page.slice(section.contentStart, tableEnd) : '';
    return { activities: parseActivityRows(tableHtml), name: section.name };
  });

  let soft: ClubActivity[] = [];
  const nonSoft: Array<{ activities: ClubActivity[]; name: string }> = [];
  for (const section of parsedSections) {
    if (/Svenska Orienteringsförbundet/i.test(section.name)) {
      soft = section.activities;
    } else {
      nonSoft.push(section);
    }
  }

  return {
    club: nonSoft[0]?.activities ?? [],
    clubName: nonSoft[0]?.name ?? null,
    district: nonSoft[1]?.activities ?? [],
    districtName: nonSoft[1]?.name ?? null,
    soft,
  };
}

function parseActivityRows(tableHtml: string): ClubActivity[] {
  const rows = tableHtml.split(/<tr[^>]*>/i).slice(1);
  const activities: ClubActivity[] = [];

  for (const row of rows) {
    const linkMatch = row.match(/\/Activities\/Show\/(\d+)[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) {
      continue;
    }

    const id = linkMatch[1];
    const name = stripTags(linkMatch[2]).trim();
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);

    const startTime = cells[1] ? stripTags(cells[1]).trim() || null : null;

    const deadlineCell = cells[2] ?? '';
    const titleMatch = deadlineCell.match(/title="([^"]*)"/i);
    const registrationDeadline = (titleMatch ? titleMatch[1] : stripTags(deadlineCell)).trim() || null;

    const countText = cells[3] ? stripTags(cells[3]).trim() : '';
    const registrationCount = Number(countText.replace(/\D/g, '')) || 0;

    activities.push({
      attributeNames: [],
      documents: [],
      id,
      informationSegments: [],
      name,
      organiser: null,
      registrationCount,
      registrationDeadline,
      registrationDeadlineIso: parseSwedishDateTime(registrationDeadline),
      registrations: [],
      startTime,
      url: `${EVENTOR_BASE}/Activities/Show/${id}`,
    });
  }

  return activities;
}

// ---------------------------------------------------------------------------
// Detail page parsing
// ---------------------------------------------------------------------------

function parseDetailHtml(html: string, activityId: string): ClubActivity {
  const page = decodeEntities(html);

  const nameMatch = page.match(/Aktivitet:\s*([\s\S]*?)<\/(?:h1|h2|title)>/i);
  const name = nameMatch ? stripTags(nameMatch[1]).trim() : 'Aktivitet';

  const infoField = (label: string): string | null => {
    const re = new RegExp(`<th>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i');
    const found = page.match(re);
    return found ? found[1] : null;
  };

  const organiserRaw = infoField('Arrangör');
  const startRaw = infoField('Starttid');
  const deadlineRaw = infoField('Anmälningsstopp');
  const informationRaw = infoField('Information');
  const countRaw = infoField('Antal anmälda deltagare');

  const registrationDeadline = deadlineRaw ? stripTags(deadlineRaw).trim() || null : null;
  const { attributeNames, registrations } = parseRegistrations(page);

  return {
    attributeNames,
    documents: extractEventInfoBoxDocuments(page),
    id: activityId,
    informationSegments: informationRaw ? parseInformationSegments(informationRaw) : [],
    name,
    organiser: organiserRaw ? stripTags(organiserRaw).trim() || null : null,
    registrationCount: Number((countRaw ? stripTags(countRaw) : '').replace(/\D/g, '')) || registrations.length,
    registrationDeadline,
    registrationDeadlineIso: parseSwedishDateTime(registrationDeadline),
    registrations,
    startTime: startRaw ? stripTags(startRaw).trim() || null : null,
    url: `${EVENTOR_BASE}/Activities/Show/${activityId}`,
  };
}

const DOCUMENT_URL_RE = /(eventdocuments|\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp))(?:$|[?#/])/i;

function resolveUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  if (href.startsWith('/')) {
    return `${EVENTOR_BASE}${href}`;
  }
  return `${EVENTOR_BASE}/${href.replace(/^(?:\.\.\/)+/, '')}`;
}

// <a> links inside the Information text stay inline (clickable); bare document
// URLs are dropped since eventInfoBox lists them separately.
function parseInformationSegments(html: string): ActivityInfoSegment[] {
  const segments: ActivityInfoSegment[] = [];
  const anchorRe = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html)) !== null) {
    const before = htmlChunkToText(html.slice(lastIndex, match.index));
    if (before) {
      segments.push({ text: before });
    }
    const url = resolveUrl(match[1].replace(/&amp;/g, '&').trim());
    const text = stripTags(match[2]).trim() || fileNameFromUrl(url);
    segments.push({ text, url });
    lastIndex = match.index + match[0].length;
  }

  const tail = htmlChunkToText(html.slice(lastIndex));
  if (tail) {
    segments.push({ text: tail });
  }

  if (segments.length > 0 && !segments[0].url) {
    segments[0].text = segments[0].text.replace(/^\s+/, '');
    if (!segments[0].text) {
      segments.shift();
    }
  }
  const last = segments[segments.length - 1];
  if (last && !last.url) {
    last.text = last.text.replace(/\s+$/, '');
    if (!last.text) {
      segments.pop();
    }
  }

  return segments;
}

function htmlChunkToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/[^\s<]+/gi, (url) => (DOCUMENT_URL_RE.test(url) ? '' : url))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');
}

// The "Dokument och länkar" box lists documents/links as <ul class="documents">.
function extractEventInfoBoxDocuments(page: string): ActivityDocument[] {
  const headingIdx = page.search(/<h3[^>]*>\s*Dokument och länkar\s*<\/h3>/i);
  if (headingIdx < 0) {
    return [];
  }
  const ulMatch = page.slice(headingIdx).match(/<ul class="documents">([\s\S]*?)<\/ul>/i);
  if (!ulMatch) {
    return [];
  }

  const documents: ActivityDocument[] = [];
  const seen = new Set<string>();
  for (const anchor of ulMatch[1].matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = stripTags(anchor[2]).trim();
    if (!name) {
      continue;
    }
    const url = resolveUrl(anchor[1].replace(/&amp;/g, '&').trim());
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    documents.push({ name, url });
  }
  return documents;
}

function fileNameFromUrl(url: string): string {
  try {
    const path = url.split(/[?#]/)[0];
    const last = path.substring(path.lastIndexOf('/') + 1);
    return decodeURIComponent(last) || 'Dokument';
  } catch {
    return 'Dokument';
  }
}

function parseRegistrations(page: string): { attributeNames: string[]; registrations: ActivityRegistration[] } {
  const headingIdx = page.indexOf('Anmälningar');
  if (headingIdx < 0) {
    return { attributeNames: [], registrations: [] };
  }

  const tableMatch = page.slice(headingIdx).match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return { attributeNames: [], registrations: [] };
  }

  const table = tableMatch[1];

  const theadMatch = table.match(/<thead>([\s\S]*?)<\/thead>/i);
  const headerCells = theadMatch
    ? [...theadMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]).trim())
    : [];
  // First two columns are the person name and their organisation.
  const attributeNames = headerCells.slice(2);

  const tbodyMatch = table.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  const body = tbodyMatch ? tbodyMatch[1] : table;
  const rows = body.split(/<tr[^>]*>/i).slice(1);

  const registrations: ActivityRegistration[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 2) {
      continue;
    }

    const personName = stripTags(cells[0]).trim();
    if (!personName) {
      continue;
    }

    const clubName = stripTags(cells[1]).trim() || null;
    const attributes: ActivityRegistrationAttribute[] = [];
    for (let index = 2; index < cells.length; index += 1) {
      const values = cells[index]
        .split(/<br\s*\/?>/i)
        .map((value) => stripTags(value).trim())
        .filter((value) => value.length > 0);
      attributes.push({ attributeName: attributeNames[index - 2] ?? '', values });
    }

    registrations.push({ attributes, clubName, personName });
  }

  return { attributeNames, registrations };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSwedishDateTime(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const iso = input.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0)).toISOString();
  }

  const sv = input.match(/(\d{1,2}) (januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december) (\d{4})(?:\s*klockan\s*(\d{1,2})[:.](\d{2}))?/i);
  if (sv) {
    const month = SWEDISH_MONTHS[sv[2].toLowerCase()];
    return new Date(Number(sv[3]), month, Number(sv[1]), Number(sv[4] ?? 0), Number(sv[5] ?? 0)).toISOString();
  }

  return null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  Aacute: 'Á',
  aacute: 'á',
  amp: '&',
  apos: "'",
  Aring: 'Å',
  aring: 'å',
  Auml: 'Ä',
  auml: 'ä',
  Eacute: 'É',
  eacute: 'é',
  gt: '>',
  hellip: '…',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  Ouml: 'Ö',
  ouml: 'ö',
  quot: '"',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (matched, name: string) => NAMED_ENTITIES[name] ?? matched);
}
