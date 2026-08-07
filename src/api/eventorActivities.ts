import { ActivityRegistration, ActivityRegistrationAttribute, ActivitySections, ClubActivity } from '@/src/types/eventorActivities';

// The Eventor API key is issued to a single org, so activities are scraped from
// the public web pages instead (works for any org and includes district + SOFT).
const EVENTOR_BASE = 'https://eventor.orientering.se';

const SECTIONS_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 5 * 60 * 1000;
const sectionsCache = new Map<string, { data: ActivitySections; fetchedAt: number }>();
const detailCache = new Map<string, { data: ClubActivity; fetchedAt: number }>();

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
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
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

  let html: string;
  try {
    html = await fetchHtml(`${EVENTOR_BASE}/Activities/Show/${activityId}`);
  } catch {
    throw new Error('Det gick inte att hämta aktiviteten just nu.');
  }

  const data = parseDetailHtml(html, activityId);
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
      id,
      informationText: null,
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
    id: activityId,
    informationText: informationRaw ? htmlToPlainText(informationRaw) : null,
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

function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return withBreaks
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
