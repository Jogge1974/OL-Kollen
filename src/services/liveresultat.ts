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

export type LiveresultatMatch = {
  liveCompetitionId: number;
  liveName: string;
  url: string;
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

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

export async function findLiveCompetition(eventName: string, eventDate: string): Promise<LiveresultatMatch | null> {
  try {
    const statusResponse = await fetch(`${BASE_URL}/upstream-status`);
    if (!statusResponse.ok) return null;

    const status: UpstreamStatus = await statusResponse.json();
    if (!status.isAvailable) return null;

    const competitionsResponse = await fetch(`${BASE_URL}/getCompetitions?dateCode=1`);
    if (!competitionsResponse.ok) return null;

    const competitions: LiveCompetition[] = await competitionsResponse.json();

    let bestMatch: LiveCompetition | null = null;
    let bestSimilarity = 0;

    for (const comp of competitions) {
      if (comp.date !== eventDate) continue;

      const similarity = nameSimilarity(eventName, comp.name);
      if (similarity >= 0.6 && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = comp;
      }
    }

    if (bestMatch) {
      return {
        liveCompetitionId: bestMatch.id,
        liveName: bestMatch.name,
        url: `https://orientering.liveidrott.se/competitions/${bestMatch.id}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check multiple event names against today's liveresultat competitions in a single request.
 * Returns a Set of eventIds that have a liveresultat match.
 */
export async function findLiveCompetitionsBatch(
  events: Array<{ eventId: string; eventName: string; eventDate: string }>,
): Promise<Set<string>> {
  const matched = new Set<string>();
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
      for (const comp of competitions) {
        if (comp.date !== event.eventDate) continue;

        const similarity = nameSimilarity(event.eventName, comp.name);
        if (similarity >= 0.6) {
          matched.add(event.eventId);
          break;
        }
      }
    }

    return matched;
  } catch {
    return matched;
  }
}

/**
 * Same as findLiveCompetitionsBatch but returns a map of eventId → liveCompetitionId.
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
      for (const comp of competitions) {
        if (comp.date !== event.eventDate) continue;

        const similarity = nameSimilarity(event.eventName, comp.name);
        if (similarity >= 0.6) {
          matched.set(event.eventId, comp.id);
          break;
        }
      }
    }

    return matched;
  } catch {
    return matched;
  }
}

// --- getFavoriteresult API types and function ---

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
  result: string;
  status: number;
  timeplus: string;
  progress: string;
  start: number;
  isRunning: boolean;
  resultresult: string;
  resultstatus: number;
  resulttime: string;
  resulttimeplus: string;
  resultplace: string;
  projectedPlace: number;
  splitresults: LiveSplitResult;
  inClass: number;
  inForest: number;
  worseCasePlace: string;
};

/**
 * Post favorites to the liveresultat backend and get live results.
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
