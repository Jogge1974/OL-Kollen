const SMHI_BASE =
  'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point';
const SMHI_PARAMETERS =
  'air_temperature,precipitation_amount_min,precipitation_amount_max,probability_of_precipitation,wind_speed,wind_from_direction,wind_speed_of_gust,symbol_code';

export type WeatherForecastEntry = {
  /** Raw forecast timestamp (UTC, ISO 8601). */
  time: string;
  /** Start of the parameter interval (UTC, ISO 8601). Used for filtering and display. */
  intervalStartTime: string;
  airTemperature: number | null;
  windSpeed: number | null;
  windFromDirection: number | null;
  windSpeedOfGust: number | null;
  precipitationAmountMin: number | null;
  precipitationAmountMax: number | null;
  probabilityOfPrecipitation: number | null;
  symbolCode: number | null;
};

function roundCoordinate(value: number) {
  // SMHI only accepts coordinates with at most six decimals.
  return Math.round(value * 1_000_000) / 1_000_000;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEntry(item: unknown): WeatherForecastEntry {
  const record = (item ?? {}) as Record<string, unknown>;
  const data = (record.data ?? {}) as Record<string, unknown>;

  return {
    time: typeof record.time === 'string' ? record.time : '',
    intervalStartTime:
      typeof record.intervalParametersStartTime === 'string' ? record.intervalParametersStartTime : '',
    airTemperature: numberOrNull(data.air_temperature),
    windSpeed: numberOrNull(data.wind_speed),
    windFromDirection: numberOrNull(data.wind_from_direction),
    windSpeedOfGust: numberOrNull(data.wind_speed_of_gust),
    precipitationAmountMin: numberOrNull(data.precipitation_amount_min),
    precipitationAmountMax: numberOrNull(data.precipitation_amount_max),
    probabilityOfPrecipitation: numberOrNull(data.probability_of_precipitation),
    symbolCode: numberOrNull(data.symbol_code),
  };
}

export async function fetchSmhiForecast(
  latitude: number,
  longitude: number,
): Promise<WeatherForecastEntry[]> {
  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);
  const url = `${SMHI_BASE}/lon/${lon}/lat/${lat}/data.json?parameters=${SMHI_PARAMETERS}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SMHI svarade med status ${response.status}.`);
  }

  const json = (await response.json()) as { timeSeries?: unknown };
  const series = Array.isArray(json.timeSeries) ? json.timeSeries : [];

  return series.map(parseEntry);
}

/**
 * Converts a UTC ISO timestamp to its date key (YYYY-MM-DD) and hour in the
 * Europe/Stockholm timezone, so filtering matches Swedish local time.
 */
export function getStockholmDateTimeParts(iso: string): { dateKey: string; hour: number } | null {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = Number.parseInt(get('hour'), 10);

  if (hour === 24) {
    hour = 0;
  }

  if (!year || !month || !day || Number.isNaN(hour)) {
    return null;
  }

  return { dateKey: `${year}-${month}-${day}`, hour };
}
