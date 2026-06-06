// Shared liveresultat backend helpers for Supabase edge functions (Deno runtime).
// Mirrors src/services/liveresultat.ts but trimmed to what the pollers need.

const BASE_URL = 'https://liveresultatbackend.azurewebsites.net/api/Competition';

type LiveCompetition = {
  id: number;
  name: string;
  organizer: string;
  date: string;
};

type UpstreamStatus = {
  isAvailable: boolean;
  lastChecked: string;
  lastError: string | null;
};

export type LiveFavorite = {
  competitionId: number;
  competitionName: string;
  className: string;
  name: string;
  club: string;
};

export type LiveSplitResult = {
  code: number;
  splitname: string;
  splitresult: string;
  splitstatus: number;
  splitplace: string;
  splittimeplus: string;
};

export type LiveFavoriteResult = {
  competitionId: number;
  competitionName: string;
  place: string;
  name: string;
  club: string;
  className: string;
  result: string; // centiseconds as string
  status: number; // 0=OK, 1=DNS, 2=DNF, 3=MP, 4=DSQ, 5=OT, 9/10=running
  timeplus: string;
  progress: number;
  start: number; // centiseconds since midnight
  lastpassing: number;
  projectedPlace: number;
  splitresults: LiveSplitResult[];
  inClass: number;
  inForest: number;
  worseCasePlace: string;
};

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zåäö0-9]/g, '');
}

function nameSimilarity(eventorName: string, liveName: string): number {
  const a = normalize(eventorName);
  const b = normalize(liveName);
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Match a set of Eventor events (name + date) against today's liveresultat
 * competitions. Returns a map of eventId → liveCompetitionId for matches.
 */
export async function findLiveCompetitionIdsBatch(
  events: Array<{ eventId: string; eventName: string; eventDate: string }>,
): Promise<Map<string, number>> {
  const matched = new Map<string, number>();
  if (events.length === 0) return matched;

  try {
    const statusResponse = await fetch(`${BASE_URL}/upstream-status`);
    if (!statusResponse.ok) return matched;
    const status: UpstreamStatus = await statusResponse.json();
    if (!status.isAvailable) return matched;

    const competitionsResponse = await fetch(`${BASE_URL}/getCompetitions?dateCode=1`);
    if (!competitionsResponse.ok) return matched;
    const competitions: LiveCompetition[] = await competitionsResponse.json();

    for (const event of events) {
      let bestId: number | null = null;
      let bestSimilarity = 0;
      for (const comp of competitions) {
        if (comp.date !== event.eventDate) continue;
        const similarity = nameSimilarity(event.eventName, comp.name);
        if (similarity >= 0.6 && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestId = comp.id;
        }
      }
      if (bestId != null) matched.set(event.eventId, bestId);
    }
    return matched;
  } catch {
    return matched;
  }
}

/**
 * Post favorites to the liveresultat backend and get live results back.
 */
export async function getLiveFavoriteResults(favorites: LiveFavorite[]): Promise<LiveFavoriteResult[]> {
  if (favorites.length === 0) return [];
  try {
    const response = await fetch(`${BASE_URL}/getFavoriteresult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'sv' },
      body: JSON.stringify(favorites),
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

/** Format centiseconds → "M:SS" / "H:MM:SS". */
export function formatCentis(centis: number): string {
  if (!Number.isFinite(centis) || centis < 0) return '';
  const totalSeconds = Math.floor(centis / 100);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
