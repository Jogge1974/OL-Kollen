import { PublishedListRow, PublishedListSection } from '@/src/services/publishedListFormatter';

type SverigelistanEntry = {
  Points: number;
  RunnerId: number | null;
};

type CalculatedPoints = Record<string, number>;

const ELIGIBLE_CLASS_PATTERN = /^[HDWM]\d/i;
const MIN_CLASS_NUMBER = 16;

function parseClassNumber(classLabel: string): number | null {
  const match = classLabel.match(/^[HDWM](\d+)/i);
  return match ? Number(match[1]) : null;
}

function getGenderFromClass(classLabel: string): 'H' | 'D' | null {
  const firstChar = classLabel.charAt(0).toUpperCase();
  if (firstChar === 'H' || firstChar === 'M') return 'H';
  if (firstChar === 'D' || firstChar === 'W') return 'D';
  return null;
}

function isEligibleClass(classLabel: string): boolean {
  if (!ELIGIBLE_CLASS_PATTERN.test(classLabel)) return false;
  const classNumber = parseClassNumber(classLabel);
  if (classNumber === null) return false;
  return classNumber >= MIN_CLASS_NUMBER;
}

function parseTimeToSeconds(time: string | undefined): number | null {
  if (!time || time === '-') return null;

  const parts = time.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function calculateClassPoints(
  section: PublishedListSection,
  sverigelistanMap: Record<string, SverigelistanEntry>,
): CalculatedPoints | null {
  const classLabel = section.title;

  if (!isEligibleClass(classLabel)) return null;

  const gender = getGenderFromClass(classLabel);
  if (!gender) return null;

  const std = gender === 'D' ? 60 : 75;

  type RankedRunner = {
    personId: string;
    points: number;
    timeSeconds: number | null;
    status: string | undefined;
  };

  const rankedRunners: RankedRunner[] = [];

  for (const row of section.rows) {
    if (!row.personId) continue;
    // Runners who did not start or were moved up are excluded entirely
    if (row.status === 'DidNotStart' || row.status === 'Cancelled') continue;
    const entry = sverigelistanMap[row.personId];
    if (!entry) continue;

    const timeSeconds = row.timeSeconds ?? parseTimeToSeconds(row.time);
    rankedRunners.push({
      personId: row.personId,
      points: entry.Points,
      timeSeconds: row.status && row.status !== 'OK' ? null : timeSeconds,
      status: row.status ?? undefined,
    });
  }

  // Collect the 3 best ranked (lowest points) runners who STARTED
  // DNF/DSQ/MisPunch runners still count for Pm if they have ranking points
  const runnersForPm = [...rankedRunners]
    .sort((a, b) => a.points - b.points)
    .slice(0, 3);

  if (runnersForPm.length < 3) return null;

  const pm = runnersForPm.reduce((sum, r) => sum + r.points, 0) / runnersForPm.length;

  // Get the 3 best times among ranked runners who finished OK
  const finishedRanked = rankedRunners
    .filter((r) => r.timeSeconds !== null && r.timeSeconds > 0)
    .sort((a, b) => a.timeSeconds! - b.timeSeconds!);

  if (finishedRanked.length < 3) return null;

  const bestThreeTimes = finishedRanked.slice(0, 3);

  // Winner time for 10% cap
  const winnerTime = bestThreeTimes[0].timeSeconds!;

  // Cap: mean time must not exceed winner time by more than 10%
  let tm = bestThreeTimes.reduce((sum, r) => sum + r.timeSeconds!, 0) / bestThreeTimes.length;
  const maxTm = winnerTime * 1.1;
  if (tm > maxTm) {
    tm = maxTm;
  }

  const kk = (std + pm) / tm;
  const tb = tm - pm / kk;

  const result: CalculatedPoints = {};

  for (const row of section.rows) {
    if (!row.personId) continue;

    const timeSeconds = row.timeSeconds ?? parseTimeToSeconds(row.time);
    if (!timeSeconds || timeSeconds <= 0) continue;
    if (row.status && row.status !== 'OK') continue;

    let points = (timeSeconds - tb) * kk;
    points = Math.min(points, 300);
    points = Math.max(points, 0);
    result[row.personId] = Math.round(points * 100) / 100;
  }

  return result;
}

export async function fetchSverigelistanForPoints(): Promise<Record<string, SverigelistanEntry>> {
  const response = await fetch('https://hvscmyudneihjbtitffy.supabase.co/functions/v1/sverigelistan-latest');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = (await response.json()) as { rows: Array<{ Points: number; RunnerId: number | null }> };
  const data = json.rows ?? [];
  const map: Record<string, SverigelistanEntry> = {};
  for (const entry of data) {
    if (entry.RunnerId != null) {
      map[String(entry.RunnerId)] = entry;
    }
  }
  return map;
}
