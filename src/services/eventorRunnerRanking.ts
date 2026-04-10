import { getStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';

export type RunnerRankingTableRow = {
  cells: string[];
  detailLink: string | null;
};

export type RunnerRankingTableResult = {
  headers: string[];
  hasResultsTable: boolean;
  message: string | null;
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
    headers: result.parsedTable.headers,
    hasResultsTable: true,
    message: result.parsedTable.rows.length === 0 ? 'resultsTable hittades, men inga rader kunde läsas ut.' : null,
    pageTitle: result.pageTitle,
    rows: result.parsedTable.rows,
    sourceUrl,
    success: true,
  };
}

function buildFailureResult(sourceUrl: string, result: Awaited<ReturnType<typeof fetchRankingPage>>): RunnerRankingTableResult {
  return {
    headers: [],
    hasResultsTable: false,
    message: buildRankingErrorMessage(result.response.status, result.html, result.parsedTable.hasResultsTable),
    pageTitle: result.pageTitle,
    rows: [],
    sourceUrl,
    success: false,
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
      headers: [],
      hasResultsTable: false,
      rows: [],
    };
  }

  const tableHtml = tableMatch[1];
  const headerRowHtml = tableHtml.match(/<thead[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? '';
  const headers = extractCells(headerRowHtml, 'th');
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
  }

  return {
    headers,
    hasResultsTable: true,
    rows,
  };
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
