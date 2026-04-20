import { EventSplitTimesRow, EventSplitTimesSection } from '@/src/types/eventSplitTimes';
import { formatPacePerKmLabel } from '@/src/utils/pace';

export type EventAnalysisThird = {
  controls: string;
  description: string;
  percent: number | null;
};

export type EventAnalysisLeg = {
  estimatedTimeLossLabel: string | null;
  legLabel: string;
  legPlaceWithoutLoss: number | null;
  splitDiffLabel: string | null;
  splitPlace: number | null;
  splitTimeLabel: string | null;
  splitLossSeconds: number | null;
  totalDiffLabel: string | null;
  totalPlace: number | null;
  totalTimeLabel: string | null;
  totalValid: boolean;
};

export type EventAnalysisSummary = {
  adjustedTotalPlaceIfAllAvoidLoss: number | null;
  adjustedTotalPlaceWithoutLoss: number | null;
  adjustedTotalTimeLabel: string | null;
  allAvoidLossLabel: string | null;
  bomMadeSplitShareLabel: string;
  bomFreeSplitShareLabel: string;
  classLengthLabel: string | null;
  courseLengthLabel: string | null;
  legPodiumCountLabel: string;
  legWinCountLabel: string;
  optimalRaceTimeLabel: string | null;
  optimalRaceTimeDeltaLabel: string | null;
  pacePerKmLabel: string;
  pacePerKmWithoutLossLabel: string;
  placingLabel: string;
  referencePercentLabel: string;
  statusLabel: string;
  totalDiffLabel: string | null;
  totalTimeLabel: string | null;
  timeLossLabel: string | null;
  timeWithoutLossLabel: string | null;
  thirdProgress: EventAnalysisThird[];
  runnerName: string;
  organisation: string;
  winnerName: string | null;
  winnerTimeLabel: string | null;
};

export type EventAnalysisView = {
  classEntriesCount: number | null;
  classLabel: string;
  legCount: number;
  rows: EventAnalysisLeg[];
  summary: EventAnalysisSummary;
  targetPersonId: string | null;
};

export function buildEventAnalysis(section: EventSplitTimesSection, targetPersonId?: string | null): EventAnalysisView | null {
  const rows = section.rows.map(ensureFinishSplitRow);

  if (rows.length === 0) {
    return null;
  }

  const target = findTargetRow(rows, targetPersonId) ?? rows[0];
  const splitCount = Math.max(target.splitCount, rows.reduce((max, row) => Math.max(max, row.splitCount), 0));
  const bestSplitTimes = getBestSplitTimes(rows, splitCount);
  const officialRows = rows.filter((row) => row.status === 'OK' && row.totalTimeSeconds !== null);
  const targetTotalLoss = target.status === 'OK' ? target.totalLossSeconds ?? 0 : null;
  const targetAdjustedTotal = target.totalTimeSeconds !== null && targetTotalLoss !== null ? target.totalTimeSeconds - targetTotalLoss : null;
  const totalTimeLabel = target.totalTimeSeconds !== null ? formatTime(target.totalTimeSeconds) : null;
  const totalDiffLabel = buildGapLabel(target.totalTimeSeconds, officialRows.map((row) => row.totalTimeSeconds ?? null), true);
  const placingLabel = formatPlacement(target.position ?? null, target.totalTimeSeconds, officialRows);
  const timeLossLabel = targetTotalLoss !== null ? formatTimeDelta(targetTotalLoss) : null;
  const timeWithoutLossLabel = targetTotalLoss !== null && target.totalTimeSeconds !== null ? formatTime(target.totalTimeSeconds - targetTotalLoss) : null;
  const adjustedRows = officialRows
    .map((row) => {
      const loss = row.totalLossSeconds ?? 0;
      return row.totalTimeSeconds === null ? null : {
        adjusted: row.totalTimeSeconds - loss,
        row,
      };
    })
    .filter((value): value is { adjusted: number; row: EventSplitTimesRow } => value !== null);

  const adjustedTotalPlaceWithoutLoss =
    targetAdjustedTotal !== null && officialRows.length > 0 ? rankAscending(officialRows.map((row) => row.totalTimeSeconds ?? 0), targetAdjustedTotal) : null;
  const adjustedTotalPlaceIfAllAvoidLoss =
    targetAdjustedTotal !== null && adjustedRows.length > 0 ? rankAscending(adjustedRows.map((item) => item.adjusted), targetAdjustedTotal) : null;

  const legs = buildLegAnalysis(rows, target, bestSplitTimes);
  const legWinCount = legs.filter((leg) => leg.splitPlace === 1).length;
  const legPodiumCount = legs.filter((leg) => leg.splitPlace !== null && leg.splitPlace <= 3).length;
  const bomFreeLegCount = legs.filter((leg) => leg.splitLossSeconds !== null && leg.splitLossSeconds <= 0).length;
  const validLossLegCount = legs.filter((leg) => leg.splitLossSeconds !== null).length;
  const optimalRaceTimeSeconds = bestSplitTimes.reduce<number>((sum, splitTime) => sum + (splitTime ?? 0), 0);
  const speedFactor = (target.referencePercent ?? 0) + 1;
  const classLengthLabel = section.classLengthLabel ?? null;
  const courseLengthLabel = section.classLengthLabel ?? null;
  const optimalRaceTimeDeltaSeconds = target.totalTimeSeconds !== null ? target.totalTimeSeconds - optimalRaceTimeSeconds : null;

  const { firstThird, secondThird, thirdThird } = buildThirdProgress(rows, target, speedFactor);

  const winner = rows.find((row) => row.position === '1') ?? officialRows[0] ?? null;
  const winnerName = winner ? winner.primary : null;
  const winnerTimeLabel = winner?.totalTimeSeconds != null ? formatTime(winner.totalTimeSeconds) : null;
  const pacePerKmWithoutLossLabel = formatPacePerKmLabel(targetAdjustedTotal, section.classLengthMeters ?? null);

  return {
    classEntriesCount: section.classEntriesCount ?? null,
    classLabel: section.classLabel,
    legCount: splitCount,
    rows: legs,
    summary: {
      adjustedTotalPlaceIfAllAvoidLoss,
      adjustedTotalPlaceWithoutLoss,
      adjustedTotalTimeLabel: targetAdjustedTotal !== null ? formatTime(targetAdjustedTotal) : null,
      allAvoidLossLabel:
        adjustedTotalPlaceIfAllAvoidLoss !== null && targetAdjustedTotal !== null
          ? formatPlacementLabel(adjustedTotalPlaceIfAllAvoidLoss)
          : null,
      bomMadeSplitShareLabel: validLossLegCount > 0 ? `${Math.round(100 - (bomFreeLegCount / validLossLegCount) * 100)}%` : '-',
      bomFreeSplitShareLabel: validLossLegCount > 0 ? `${Math.round((bomFreeLegCount / validLossLegCount) * 100)}%` : '-',
      classLengthLabel,
      courseLengthLabel,
      legPodiumCountLabel: `${legPodiumCount}`,
      legWinCountLabel: `${legWinCount}`,
      optimalRaceTimeLabel: optimalRaceTimeSeconds > 0 ? formatTime(optimalRaceTimeSeconds) : null,
      optimalRaceTimeDeltaLabel: optimalRaceTimeDeltaSeconds !== null ? formatTimeDelta(optimalRaceTimeDeltaSeconds) : null,
      pacePerKmLabel: formatPacePerKm(target.totalTimeSeconds, section.classLengthMeters ?? null),
      pacePerKmWithoutLossLabel,
      placingLabel,
      referencePercentLabel: formatReferencePercent(speedFactor),
      runnerName: target.primary,
      organisation: target.organisation,
      statusLabel: formatStatus(target.status),
      thirdProgress: [firstThird, secondThird, thirdThird].filter((item) => item.controls.length > 0),
      timeLossLabel,
      timeWithoutLossLabel,
      totalDiffLabel,
      totalTimeLabel,
      winnerName,
      winnerTimeLabel,
    },
    targetPersonId: target.personId ?? null,
  };
}

function buildLegAnalysis(rows: EventSplitTimesRow[], target: EventSplitTimesRow, bestSplitTimes: Array<number | null>) {
  const splitCount = bestSplitTimes.length;
  const targetLosses = target.splitLossSeconds ?? [];
  const result: EventAnalysisLeg[] = [];

  for (let splitIndex = 0; splitIndex < splitCount; splitIndex += 1) {
    const splitLabel = getLegLabel(splitIndex, splitCount);
    const currentSplit = getSplitTime(target, splitIndex + 1);
    const splitRows = rows.filter((row) => getSplitTime(row, splitIndex + 1) !== null);
    const splitValues = splitRows.map((row) => getSplitTime(row, splitIndex + 1) ?? 0).sort((left, right) => left - right);
    const splitPlace = currentSplit !== null ? rankAscending(splitValues, currentSplit) : null;
    const splitDiffLabel = currentSplit !== null ? buildGapLabel(currentSplit, splitValues) : null;
    const lossSeconds = targetLosses[splitIndex] ?? null;
    const splitPlaceWithoutLoss = currentSplit !== null && lossSeconds !== null ? rankAscending(splitValues, Math.max(0, currentSplit - lossSeconds)) : null;

    const totalValidRows = rows
      .map((row) => ({ row, total: getTotalAtLeg(row, splitIndex) }))
      .filter((item) => item.total !== null && isTotalValidAtLeg(item.row, splitIndex))
      .sort((left, right) => (left.total ?? 0) - (right.total ?? 0));
    const currentTotal = getTotalAtLeg(target, splitIndex);
    const totalValues = totalValidRows.map((item) => item.total ?? 0);
    const totalPlace = currentTotal !== null ? rankAscending(totalValues, currentTotal) : null;
    const totalDiffLabel = currentTotal !== null ? buildGapLabel(currentTotal, totalValues) : null;

    result.push({
      estimatedTimeLossLabel: lossSeconds !== null && lossSeconds > 0 ? `+${formatTime(lossSeconds)}` : null,
      legLabel: splitLabel,
      legPlaceWithoutLoss: splitPlaceWithoutLoss,
      splitDiffLabel,
      splitPlace,
      splitTimeLabel: currentSplit !== null ? formatTime(currentSplit) : null,
      splitLossSeconds: lossSeconds,
      totalDiffLabel,
      totalPlace,
      totalTimeLabel: currentTotal !== null ? formatTime(currentTotal) : null,
      totalValid: currentTotal !== null,
    });
  }

  return result;
}

function ensureFinishSplitRow(row: EventSplitTimesRow) {
  if (row.splitCount > 0) {
    const lastSplit = row.splitCumulativeSeconds[row.splitCumulativeSeconds.length - 1] ?? null;
    const totalTimeSeconds = row.totalTimeSeconds;

    if (totalTimeSeconds !== null && lastSplit !== null && totalTimeSeconds > lastSplit) {
      return {
        ...row,
        splitCumulativeSeconds: [...row.splitCumulativeSeconds, totalTimeSeconds],
        splitCount: row.splitCount + 1,
      };
    }
  }

  return row;
}

function buildThirdProgress(rows: EventSplitTimesRow[], target: EventSplitTimesRow, speedFactor: number) {
  const empty = { controls: '', description: '', percent: null };
  if (target.totalTimeSeconds === null || target.splitCount === 0) {
    return { firstThird: empty, secondThird: empty, thirdThird: empty };
  }

  const splitCount = target.splitCount;
  const okRows = rows.filter((row) => row.status === 'OK' && row.totalTimeSeconds !== null);
  const referenceSplitTimes = getReferenceSplitTimesLocal(okRows, splitCount);

  // Build cumulative expected times using speedFactor × reference
  const expectedCumulative: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < splitCount; i += 1) {
    cumulative += speedFactor * (referenceSplitTimes[i] ?? 0);
    expectedCumulative.push(cumulative);
  }

  const expectedTotal = expectedCumulative[splitCount - 1] ?? 0;
  if (expectedTotal <= 0) {
    return { firstThird: empty, secondThird: empty, thirdThird: empty };
  }

  // Divide into thirds based on expected cumulative time
  const firstThirdEndLeg = findThresholdIndex(expectedCumulative.map((v) => v as number | null), expectedTotal / 3);
  const secondThirdEndLeg = findThresholdIndex(expectedCumulative.map((v) => v as number | null), (expectedTotal / 3) * 2);

  if (firstThirdEndLeg < 0 || secondThirdEndLeg < 0) {
    return { firstThird: empty, secondThird: empty, thirdThird: empty };
  }

  const targetTotals = buildTotalProgressValues(target);
  if (targetTotals.length === 0 || targetTotals.some((value) => value === null)) {
    return { firstThird: empty, secondThird: empty, thirdThird: empty };
  }

  // Actual times per third
  const firstTargetTime = targetTotals[firstThirdEndLeg] ?? 0;
  const secondTargetTime = (targetTotals[secondThirdEndLeg] ?? 0) - firstTargetTime;
  const thirdTargetTime = (target.totalTimeSeconds ?? 0) - (targetTotals[secondThirdEndLeg] ?? 0);

  // Expected times per third
  const firstExpected = expectedCumulative[firstThirdEndLeg];
  const secondExpected = expectedCumulative[secondThirdEndLeg] - expectedCumulative[firstThirdEndLeg];
  const thirdExpected = expectedTotal - expectedCumulative[secondThirdEndLeg];

  const firstPercent = calcThirdPercent(firstTargetTime, firstExpected);
  const secondPercent = calcThirdPercent(secondTargetTime, secondExpected);
  const thirdPercent = calcThirdPercent(thirdTargetTime, thirdExpected);

  return {
    firstThird: {
      controls: `Start-${firstThirdEndLeg + 1}`,
      description: describeThird(firstPercent),
      percent: firstPercent,
    },
    secondThird: {
      controls: `${firstThirdEndLeg + 2}-${secondThirdEndLeg + 1}`,
      description: describeThird(secondPercent),
      percent: secondPercent,
    },
    thirdThird: {
      controls: `${secondThirdEndLeg + 2}-Mål`,
      description: describeThird(thirdPercent),
      percent: thirdPercent,
    },
  };
}

function getReferenceSplitTimesLocal(rows: EventSplitTimesRow[], splitCount: number) {
  const result: Array<number | null> = [];
  for (let i = 1; i <= splitCount; i += 1) {
    const times: number[] = [];
    for (const row of rows) {
      const t = getSplitTime(row, i);
      if (t !== null) times.push(t);
    }
    if (times.length === 0) {
      result.push(null);
    } else {
      const sorted = [...times].sort((a, b) => a - b);
      const count = Math.max(1, Math.ceil(sorted.length * 0.25));
      const topSlice = sorted.slice(0, count);
      result.push(topSlice.reduce((sum, v) => sum + v, 0) / topSlice.length);
    }
  }
  return result;
}

function buildTotalProgressValues(row: EventSplitTimesRow) {
  const values: Array<number | null> = [];

  for (let index = 0; index < row.splitCount; index += 1) {
    values.push(getTotalAtLeg(row, index));
  }

  return values;
}

function getLegLabel(splitIndex: number, splitCount: number) {
  return splitIndex === splitCount - 1 ? 'Mål' : `${splitIndex + 1}`;
}

function calcThirdPercent(targetTime: number, winnerTime: number) {
  if (!Number.isFinite(targetTime) || !Number.isFinite(winnerTime) || winnerTime <= 0) {
    return null;
  }

  return Math.round(((targetTime - winnerTime) / winnerTime) * 100);
}

function describeThird(percent: number | null) {
  if (percent === null) {
    return '';
  }

  if (percent < -15) {
    return 'Mycket bra';
  }

  if (percent < -5) {
    return 'Bra';
  }

  if (percent <= 5) {
    return 'OK';
  }

  if (percent <= 15) {
    return 'Svag';
  }

  return 'Mycket svag';
}

function findThresholdIndex(values: Array<number | null>, threshold: number) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && values[index]! >= threshold) {
      return index;
    }
  }

  return -1;
}

function findTargetRow(rows: EventSplitTimesRow[], targetPersonId?: string | null) {
  if (targetPersonId) {
    const byId = rows.find((row) => row.personId === targetPersonId);
    if (byId) {
      return byId;
    }
  }

  return rows[0] ?? null;
}

function getBestSplitTimes(rows: EventSplitTimesRow[], splitCount: number) {
  return Array.from({ length: splitCount }, (_, splitIndex) => {
    const splitValues = rows
      .map((row) => getSplitTime(row, splitIndex + 1))
      .filter((value): value is number => value !== null);

    return splitValues.length > 0 ? Math.min(...splitValues) : null;
  });
}

function getSplitTime(row: EventSplitTimesRow, splitIndex: number) {
  const current = row.splitCumulativeSeconds[splitIndex - 1];
  const previous = splitIndex === 1 ? 0 : row.splitCumulativeSeconds[splitIndex - 2] ?? 0;

  if (!Number.isFinite(current) || current <= previous) {
    return null;
  }

  return current - previous;
}

function getTotalAtLeg(row: EventSplitTimesRow, splitIndex: number) {
  if (!isTotalValidAtLeg(row, splitIndex)) {
    return null;
  }

  if (splitIndex >= row.splitCount - 1) {
    return row.totalTimeSeconds;
  }

  return row.splitCumulativeSeconds[splitIndex] ?? null;
}

function isTotalValidAtLeg(row: EventSplitTimesRow, splitIndex: number) {
  if (row.status !== 'OK') {
    return false;
  }

  let previous = 0;

  for (let index = 0; index <= splitIndex; index += 1) {
    const current = row.splitCumulativeSeconds[index];
    if (!Number.isFinite(current) || current <= previous) {
      return false;
    }

    previous = current;
  }

  return splitIndex < row.splitCount ? true : row.totalTimeSeconds !== null;
}

function buildGapLabel(target: number | null, values: Array<number | null>, isTotal = false) {
  if (target === null || values.length === 0) {
    return null;
  }

  const sorted = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }

  const best = sorted[0];
  const bestCount = sorted.filter((value) => value === best).length;

  if (target === best) {
    if (bestCount > 1) {
      return '0.00';
    }

    const secondBest = sorted.find((value) => value > best);
    if (secondBest === undefined) {
      return '0.00';
    }

    return `-${formatTime(secondBest - best)}`;
  }

  return `+${formatTime(target - best)}`;
}

function formatPlacement(position: string | null, targetTime: number | null, officialRows: EventSplitTimesRow[]) {
  if (position && position !== '-') {
    return position;
  }

  if (targetTime === null || officialRows.length === 0) {
    return '-';
  }

  const officialTimes = officialRows.map((row) => row.totalTimeSeconds ?? 0);
  return `${rankAscending(officialTimes, targetTime)}`;
}

function formatPlacementLabel(position: number) {
  return `${position}`;
}

function rankAscending(values: number[], target: number) {
  return values.filter((value) => value < target).length + 1;
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;

  if (Number.isInteger(rounded)) {
    return `${rounded}`;
  }

  return rounded.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

function formatPacePerKm(totalTimeSeconds: number | null, courseLengthMeters: number | null) {
  return formatPacePerKmLabel(totalTimeSeconds, courseLengthMeters);
}

function formatReferencePercent(factor: number) {
  const percent = (factor - 1) * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toLocaleString('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeDelta(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  if (totalSeconds === 0) {
    return '0.00';
  }

  return `-${formatTime(totalSeconds)}`;
}

function formatStatus(status?: string | null) {
  if (!status) {
    return '-';
  }

  const normalized = status.trim();
  const statusMap: Record<string, string> = {
    Cancelled: 'Återb.',
    Disqualified: 'Disk.',
    DidNotFinish: 'Utgått',
    DidNotStart: 'Ej start',
    MissingPunch: 'Felst.',
  };

  return statusMap[normalized] ?? normalized;
}
