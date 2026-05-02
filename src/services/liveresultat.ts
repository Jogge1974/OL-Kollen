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

function isNameMatch(eventorName: string, liveName: string): boolean {
  const a = normalize(eventorName);
  const b = normalize(liveName);

  if (a === b) return true;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;

  const distance = levenshteinDistance(a, b);
  const similarity = 1 - distance / maxLen;

  return similarity >= 0.6;
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

    for (const comp of competitions) {
      if (comp.date !== eventDate) continue;
      if (isNameMatch(eventName, comp.name)) {
        return {
          liveCompetitionId: comp.id,
          liveName: comp.name,
          url: `https://orientering.liveidrott.se/competitions/${comp.id}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
