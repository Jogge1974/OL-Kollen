import { OrganisationSeries, SeriesClassStanding, SeriesColumn, SeriesDetail, SeriesItem, SeriesScoreMode, SeriesStandingRow, SeriesSubCompetition } from '@/src/types/eventorSeries';

// The Standings pages are public, so series are scraped straight from the web
// pages (no API key or login required).
const EVENTOR_BASE = 'https://eventor.orientering.se';

const SERIES_TTL_MS = 5 * 60 * 1000;
const seriesCache = new Map<number, { data: OrganisationSeries; fetchedAt: number }>();
const detailCache = new Map<string, { data: SeriesDetail; fetchedAt: number }>();

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(`Eventor ${response.status}`);
  }
  return await response.text();
}

// Fetches the series (Serier) for a single organisation from its Standings page.
export async function fetchOrganisationSeries(
  organisationId: number,
  fallbackName: string,
  type: string | null = null,
  force = false,
): Promise<OrganisationSeries> {
  const cached = seriesCache.get(organisationId);
  if (!force && cached && Date.now() - cached.fetchedAt < SERIES_TTL_MS) {
    return cached.data;
  }

  let html: string;
  try {
    html = await fetchHtml(`${EVENTOR_BASE}/Standings?organisationId=${organisationId}`);
  } catch {
    throw new Error('Det gick inte att hämta serierna just nu.');
  }

  const data = parseSeriesHtml(html, organisationId, fallbackName, type);
  seriesCache.set(organisationId, { data, fetchedAt: Date.now() });
  return data;
}

// Fetches a single series' detail page: info, per-class standings and the list
// of sub-competitions. mode 'time' loads the chase-start (jaktstart) variant
// where the total column shows the pursuit start gap instead of points.
export async function fetchSeriesDetail(
  seriesId: string,
  mode: SeriesScoreMode = 'points',
  force = false,
): Promise<SeriesDetail> {
  const cacheKey = `${seriesId}:${mode}`;
  const cached = detailCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.fetchedAt < SERIES_TTL_MS) {
    return cached.data;
  }

  const url =
    mode === 'time'
      ? `${EVENTOR_BASE}/Standings/View/Series/${seriesId}?scoreMode=Time`
      : `${EVENTOR_BASE}/Standings/View/Series/${seriesId}`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    throw new Error('Det gick inte att hämta serien just nu.');
  }

  const data = parseSeriesDetailHtml(html, seriesId);
  detailCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function parseSeriesDetailHtml(html: string, seriesId: string): SeriesDetail {
  const page = decodeEntities(html);

  const nameMatch = page.match(/<h2[^>]*>([^<]*)<\/h2>\s*<p class="toolbar16/i);
  const name = nameMatch ? stripTags(nameMatch[1]).trim() : 'Serie';

  const toolbarMatch = page.match(/<p class="toolbar16[\s\S]*?<\/p>/i);
  const chaseStartAvailable = toolbarMatch ? /scoreMode=/i.test(toolbarMatch[0]) : false;

  // Matches both "Ställning efter X av Y deltävlingar" and the final
  // "Slutställning efter Y deltävlingar" once every sub-competition is decided.
  const statusMatch = page.match(/<p>\s*((?:Slut)?ställning[\s\S]*?)<\/p>/i);
  const statusText = statusMatch ? stripTags(statusMatch[1]).trim() : null;
  const isComplete = statusText ? /^slut/i.test(statusText) : false;

  const infoMatch = page.match(/<p class="info">([\s\S]*?)<\/p>/i);
  const info = infoMatch ? stripTags(infoMatch[1]).trim() : null;

  return {
    chaseStartAvailable,
    classes: parseClassStandings(page),
    id: seriesId,
    info,
    isComplete,
    name,
    statusText,
    subCompetitions: parseSubCompetitions(page),
  };
}

function parseClassStandings(page: string): SeriesClassStanding[] {
  const results: SeriesClassStanding[] = [];
  const tableRe = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<table class="classStanding[^"]*">([\s\S]*?)<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(page)) !== null) {
    results.push({
      className: stripTags(match[1]).trim(),
      columns: parseStandingColumns(match[2]),
      rows: parseStandingRows(match[2]),
    });
  }
  return results;
}

function parseStandingColumns(tableHtml: string): SeriesColumn[] {
  const thead = tableHtml.match(/<thead[\s\S]*?<\/thead>/i);
  if (!thead) {
    return [];
  }
  const columns: SeriesColumn[] = [];
  const scoreRe = /<td class="score[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = scoreRe.exec(thead[0])) !== null) {
    const titleMatch = match[1].match(/title="([^"]*)"/i);
    columns.push({ label: stripTags(match[1]).trim(), title: titleMatch ? titleMatch[1] : '' });
  }
  return columns;
}

function parseStandingRows(tableHtml: string): SeriesStandingRow[] {
  const tbody = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbody) {
    return [];
  }
  const rows: SeriesStandingRow[] = [];
  for (const row of tbody[0].split(/<tr[^>]*>/i).slice(1)) {
    const place = matchCell(row, 'place');
    const name = matchCell(row, 'name');
    if (!place && !name) {
      continue;
    }
    rows.push({
      club: matchCell(row, 'organisation'),
      name,
      place,
      scores: [...row.matchAll(/<td class="score[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]).trim()),
      total: matchCell(row, 'totalScore'),
    });
  }
  return rows;
}

function matchCell(row: string, className: string): string {
  const match = row.match(new RegExp(`<td class="${className}[^"]*"[^>]*>([\\s\\S]*?)</td>`, 'i'));
  return match ? stripTags(match[1]).trim() : '';
}

function parseSubCompetitions(page: string): SeriesSubCompetition[] {
  const section = page.match(/<h3[^>]*>\s*Deltävlingar\s*<\/h3>\s*<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!section) {
    return [];
  }
  const tbody = section[1].match(/<tbody[\s\S]*?<\/tbody>/i);
  const body = tbody ? tbody[0] : section[1];
  const subs: SeriesSubCompetition[] = [];
  for (const row of body.split(/<tr[^>]*>/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 4) {
      continue;
    }
    const linkMatch = cells[1].match(/href="([^"]+)"/i);
    const href = linkMatch ? linkMatch[1] : null;
    const eventIdMatch = href ? href.match(/eventId=(\d+)/i) ?? href.match(/\/(\d+)(?:$|\?)/) : null;
    subs.push({
      date: stripTags(cells[0]).trim(),
      discipline: stripTags(cells[3]).trim(),
      eventId: eventIdMatch ? eventIdMatch[1] : null,
      eventUrl: href ? `${EVENTOR_BASE}${href}` : null,
      name: stripTags(cells[1]).trim(),
      organiser: stripTags(cells[2]).trim(),
    });
  }
  return subs;
}

function parseSeriesHtml(
  html: string,
  organisationId: number,
  fallbackName: string,
  type: string | null,
): OrganisationSeries {
  const page = decodeEntities(html);

  const divStart = page.indexOf('id="serieses"');
  let organisationName = fallbackName;
  let series: SeriesItem[] = [];

  if (divStart >= 0) {
    const headingMatch = page.slice(divStart).match(/<h2[^>]*>\s*Serier:\s*([\s\S]*?)<\/h2>/i);
    if (headingMatch) {
      organisationName = stripTags(headingMatch[1]).trim() || fallbackName;
    }

    const tableStart = page.indexOf('<table', divStart);
    const tableEnd = tableStart >= 0 ? page.indexOf('</table>', tableStart) : -1;
    if (tableStart >= 0 && tableEnd >= 0) {
      series = parseSeriesRows(page.slice(tableStart, tableEnd));
    }
  }

  return { organisationId, organisationName, series, type };
}

function parseSeriesRows(tableHtml: string): SeriesItem[] {
  const bodyStart = tableHtml.search(/<tbody[^>]*>/i);
  const rowsHtml = bodyStart >= 0 ? tableHtml.slice(bodyStart) : tableHtml;

  const rows = rowsHtml.split(/<tr[^>]*>/i).slice(1);
  const items: SeriesItem[] = [];

  for (const row of rows) {
    const linkMatch = row.match(/\/Standings\/View\/Series\/(\d+)[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) {
      continue;
    }

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]).trim());

    const id = linkMatch[1];
    const name = stripTags(linkMatch[2]).trim();
    const dateRange = cells[0] ?? '';
    const { startDate, endDate } = parseDateRange(dateRange);

    items.push({
      countedSubCompetitionCount: Number((cells[3] ?? '').replace(/\D/g, '')) || 0,
      dateRange,
      endDate,
      endYear: yearOf(endDate),
      id,
      name,
      startDate,
      startYear: yearOf(startDate),
      subCompetitionCount: Number((cells[2] ?? '').replace(/\D/g, '')) || 0,
      url: `${EVENTOR_BASE}/Standings/View/Series/${id}`,
    });
  }

  return items;
}

function parseDateRange(range: string): { endDate: string | null; startDate: string | null } {
  const dates = range.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return {
    endDate: dates[1] ?? dates[0] ?? null,
    startDate: dates[0] ?? null,
  };
}

function yearOf(date: string | null): number | null {
  if (!date) {
    return null;
  }
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
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
