export function formatPacePerKmLabel(totalTimeSeconds: number | null, courseLengthMeters: number | null) {
  if (!totalTimeSeconds || !courseLengthMeters || courseLengthMeters <= 0) {
    return '-';
  }

  const secondsPerKm = Math.round(totalTimeSeconds / (courseLengthMeters / 1000));
  return formatMinutesSeconds(secondsPerKm);
}

export function formatMinutesSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
