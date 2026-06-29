const BASE_URL = 'https://liveresultbackend-c2embudkd9bse9er.westeurope-01.azurewebsites.net/api/Competition';

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

// When the organiser of an Eventor event and a liveresultat competition match
// (both are free-text club names), relax the event-name similarity threshold
// from 0.6 to 0.3 — a confirmed organiser match is strong evidence the events
// are the same even if the names differ a lot (e.g. Eventor's long official
// name vs. liveresultat's short label). Without an organiser match, 0.6 applies.
const NAME_THRESHOLD_DEFAULT = 0.6;
const NAME_THRESHOLD_ORG_CONFIRMED = 0.3;
const ORGANISER_MATCH_THRESHOLD = 0.6;

export async function findLiveCompetition(eventName: string, eventDate: string, organizer?: string | null): Promise<LiveresultatMatch | null> {
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
      // When the organiser clearly matches, relax the name threshold (0.6 → 0.3).
      const organiserMatches = !!organizer && !!comp.organizer &&
        nameSimilarity(organizer, comp.organizer) >= ORGANISER_MATCH_THRESHOLD;
      const threshold = organiserMatches ? NAME_THRESHOLD_ORG_CONFIRMED : NAME_THRESHOLD_DEFAULT;
      if (similarity >= threshold && similarity > bestSimilarity) {
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
  events: Array<{ eventId: string; eventName: string; eventDate: string; organizer?: string | null }>,
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
        const organiserMatches = !!event.organizer && !!comp.organizer &&
          nameSimilarity(event.organizer, comp.organizer) >= ORGANISER_MATCH_THRESHOLD;
        const threshold = organiserMatches ? NAME_THRESHOLD_ORG_CONFIRMED : NAME_THRESHOLD_DEFAULT;
        if (similarity >= threshold) {
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
  events: Array<{ eventId: string; eventName: string; eventDate: string; organizer?: string | null }>,
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
        const organiserMatches = !!event.organizer && !!comp.organizer &&
          nameSimilarity(event.organizer, comp.organizer) >= ORGANISER_MATCH_THRESHOLD;
        const threshold = organiserMatches ? NAME_THRESHOLD_ORG_CONFIRMED : NAME_THRESHOLD_DEFAULT;
        if (similarity >= threshold) {
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
  result: string;        // centiseconds as string (e.g. "79200" = 13:12)
  status: number;        // 0=OK, 1=DNS, 2=DNF, 3=MP, 4=DSQ, 5=OT, 9/10=running
  timeplus: string;      // centiseconds diff as string
  progress: number;      // 0-100
  start: number;         // centiseconds since midnight
  lastpassing: number;   // centiseconds since midnight
  projectedPlace: number;
  splitresults: LiveSplitResult[];
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

/**
 * Fetch the list of class names for a liveresultat competition.
 *
 * Needed because getFavoriteresult matches strictly on name + club + className
 * (an empty or wrong className returns nothing). When we don't know a friend's
 * liveresultat class up front, we fetch the class list and submit one favorite
 * per class — the backend then returns only the matching class.
 */
export async function getCompetitionClasses(competitionId: number): Promise<string[]> {
  try {
    const response = await fetch(`${BASE_URL}/getClasses?competitionId=${competitionId}`);
    if (!response.ok) return [];
    const data = await response.json() as { classes?: Array<{ className?: string }> };
    return (data.classes ?? [])
      .map((c) => c.className)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  } catch {
    return [];
  }
}
