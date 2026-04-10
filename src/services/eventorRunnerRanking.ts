import { getStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';

export type RunnerRankingTableRow = {
  cells: string[];
  detailLink: string | null;
};

export type RunnerRankingCompetitionRow = {
  className: string;
  countsForRanking: boolean;
  dateISO: string;
  dateLabel: string;
  daysUntilExpiry: number;
  detailLink: string | null;
  distance: string;
  eventName: string;
  expiresOnISO: string;
  position: number | null;
  score: number;
  scoreLabel: string;
};

export type RunnerRankingOverview = {
  currentAverage: number | null;
  projectedAverage: number | null;
  replacementRow: RunnerRankingCompetitionRow | null;
  selectedRows: RunnerRankingCompetitionRow[];
  soonestExpiryRow: RunnerRankingCompetitionRow | null;
};

export type RunnerRankingTableResult = {
  competitions: RunnerRankingCompetitionRow[];
  headers: string[];
  hasResultsTable: boolean;
  message: string | null;
  overview: RunnerRankingOverview | null;
  pageTitle: string | null;
  rows: RunnerRankingTableRow[];
  sourceUrl: string;
  success: boolean;
};

export async function fetchRunnerRankingTable(personId: number): Promise<RunnerRankingTableResult> {
  const sourceUrl = `https://eventor.orientering.se/Ranking/ol/Runner/Index/${personId}`;

  const nativeAttempt = await fetchRankingPage(sourceUrl);
  if (isSuccessfulRankingPage(nativeAttempt)) {
    return buildSuccessResult(sourceUrl, nativeAttempt);
  }

  const storedCookie = await getStoredEventorWebSessionCookie().catch(() => null);
  if (storedCookie) {
    const cookieAttempt = await fetchRankingPage(sourceUrl, storedCookie);
    if (isSuccessfulRankingPage(cookieAttempt)) {
      return buildSuccessResult(sourceUrl, cookieAttempt);
    }

    return buildFailureResult(sourceUrl, cookieAttempt);
  }

  return buildFailureResult(sourceUrl, nativeAttempt);
}

async function fetchRankingPage(sourceUrl: string, cookie?: string | null) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(cookie ? { Cookie: cookie } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OL-Kollen/1.0',
    },
    credentials: 'include',
    method: 'GET',
  });

  const html = await response.text();
  const pageTitle = extractPageTitle(html);
  const parsedTable = parseResultsTable(html);

  return {
    html,
    pageTitle,
    parsedTable,
    response,
  };
}

function isSuccessfulRankingPage(result: Awaited<ReturnType<typeof fetchRankingPage>>) {
  return result.response.ok && result.parsedTable.hasResultsTable;
}

function buildSuccessResult(sourceUrl: string, result: Awaited<ReturnType<typeof fetchRankingPage>>): RunnerRankingTableResult {
  return {
    competitions: result.parsedTable.competitions,
    headers: result.parsedTable.headers,
    hasResultsTable: true,
    message: result.parsedTable.rows.length === 0 ? 'resultsTable hittades, men inga rader kunde läsas ut.' : null,
    overview: buildOverview(result.parsedTable.competitions),
    pageTitle: result.pageTitle,
    rows: result.parsedTable.rows,
    sourceUrl,
    success: true,
  };
}

function buildFailureResult(sourceUrl: string, result: Awaited<ReturnType<typeof fetchRankingPage>>): RunnerRankingTableResult {
  return {
    competitions: [],
    headers: [],
    hasResultsTable: false,
    message: buildRankingErrorMessage(result.response.status, result.html, result.parsedTable.hasResultsTable),
    overview: null,
    pageTitle: result.pageTitle,
    rows: [],
    sourceUrl,
    success: false,
  };
}

function buildOverview(competitions: RunnerRankingCompetitionRow[]): RunnerRankingOverview | null {
  const countedRows = competitions
    .filter((row) => row.countsForRanking && Number.isFinite(row.score))
    .slice()
    .sort((left, right) => right.score - left.score || compareIsoDate(left.dateISO, right.dateISO));

  const selectedRows = countedRows.slice(0, 6);
  if (selectedRows.length === 0) {
    return null;
  }

  const currentAverage = average(selectedRows.map((row) => row.score));
  const soonestExpiryRow = selectedRows.reduce<RunnerRankingCompetitionRow | null>((best, row) => {
    if (!best) {
      return row;
    }

    return row.daysUntilExpiry < best.daysUntilExpiry ? row : best;
  }, null);

  const replacementRow = soonestExpiryRow
    ? competitions
        .filter((row) => !row.countsForRanking)
        .filter((row) => compareIsoDate(row.dateISO, soonestExpiryRow.dateISO) > 0)
        .filter((row) => Number.isFinite(row.score))
        .slice()
        .sort((left, right) => left.score - right.score || compareIsoDate(left.dateISO, right.dateISO))[0] ?? null
    : null;

  const projectedAverage =
    soonestExpiryRow && replacementRow
      ? average([...selectedRows.filter((row) => row !== soonestExpiryRow).map((row) => row.score), replacementRow.score])
      : currentAverage;

  return {
    currentAverage,
    projectedAverage,
    replacementRow,
    selectedRows,
    soonestExpiryRow,
  };
}

function buildRankingErrorMessage(status: number, html: string, hasResultsTable: boolean) {
  if (status === 401 || status === 403) {
    return 'Eventor-sessionen har gått ut eller saknar behörighet. Logga in i appen igen.';
  }

  if (!hasResultsTable && looksLikeLoginPage(html)) {
    return 'Eventors inloggningssida returnerades i stället för resultsTable. Logga in i appen igen.';
  }

  if (!hasResultsTable) {
    return 'Inget resultsTable hittades i svaret. Personen eller organisationen saknar sannolikt behörighet.';
  }

  return `Kunde inte hämta rankinglistan (felkod ${status}).`;
}

function looksLikeLoginPage(html: string) {
  return html.includes('PersonUsername') && html.includes('PersonPassword') && html.includes('PersonLogin');
}

function extractPageTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripText(match[1]) : null;
}

function parseResultsTable(html: string) {
  const tableMatch = html.match(/<table[^>]*id=["']resultsTable["'][^>]*>([\s\S]*?)<\/table>/i);

  if (!tableMatch) {
    return {
      competitions: [],
      headers: [],
      hasResultsTable: false,
      rows: [],
    };
  }

  const tableHtml = tableMatch[1];
  const headerRowHtml = tableHtml.match(/<thead[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? '';
  const headers = extractCells(headerRowHtml, 'th');
  const competitions: RunnerRankingCompetitionRow[] = [];
  const rows: RunnerRankingTableRow[] = [];

  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    if (!/<td\b/i.test(rowHtml)) {
      continue;
    }

    const cells = extractCells(rowHtml, 'td');
    if (cells.length === 0) {
      continue;
    }

    const detailLinkMatch = rowHtml.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/i);
    rows.push({
      cells,
      detailLink: detailLinkMatch?.[1] ?? null,
    });

    const competitionRow = parseCompetitionRow(rowHtml, cells, detailLinkMatch?.[1] ?? null);
    if (competitionRow) {
      competitions.push(competitionRow);
    }
  }

  return {
    competitions,
    headers,
    hasResultsTable: true,
    rows,
  };
}

function parseCompetitionRow(rowHtml: string, cells: string[], detailLink: string | null) {
  if (cells.length < 5) {
    return null;
  }

  const dateISO = cells[0].match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  if (!dateISO) {
    return null;
  }

  const score = parseNumber(cells[4]);
  if (!Number.isFinite(score)) {
    return null;
  }

  const hasPosition = rowHtml.includes('positionContainer') && rowHtml.includes('arrowContainer') && rowHtml.includes('position');
  const positionMatch = rowHtml.match(/<span[^>]*class=["'][^"']*\bposition\b[^"']*["'][^>]*>\s*([\d]+)\s*<\/span>/i);
  const position = hasPosition && positionMatch ? Number(positionMatch[1]) : null;

  return {
    className: stripText(cells[3]),
    countsForRanking: hasPosition,
    dateISO,
    dateLabel: formatDateLabel(dateISO),
    daysUntilExpiry: daysUntilExpiry(dateISO),
    detailLink,
    distance: stripText(cells[2]),
    eventName: stripText(cells[1]),
    expiresOnISO: addDaysISO(dateISO, 365),
    position: Number.isFinite(position) ? position : null,
    score,
    scoreLabel: formatPoints(score),
  } satisfies RunnerRankingCompetitionRow;
}

function extractCells(rowHtml: string, tag: 'td' | 'th') {
  const matches = [...rowHtml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))];
  return matches.map((match) => stripText(match[1])).filter((value) => value.length > 0);
}

function stripText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function parseNumber(value: string) {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPoints(points: number) {
  return Number.isInteger(points) ? `${points}` : points.toFixed(2).replace('.', ',');
}

function formatDateLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace('.', '')
    .replace('  ', ' ');
}

function addDaysISO(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

function daysUntilExpiry(isoDate: string) {
  const expiryDate = new Date(`${addDaysISO(isoDate, 365)}T00:00:00`);
  const today = startOfDay(new Date());
  const diff = expiryDate.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function compareIsoDate(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatISODate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
