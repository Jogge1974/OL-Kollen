import * as React from 'react';

import {
  fetchSmhiForecast,
  getStockholmDateTimeParts,
  WeatherForecastEntry,
} from '@/src/services/smhiWeather';

const MAX_FORECAST_DAYS = 10;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type WeatherForecastDayEntry = WeatherForecastEntry & { hour: number; endHour: number };

type WeatherForecastState = {
  entries: WeatherForecastDayEntry[];
  error: string | null;
  isLoading: boolean;
  /** Set when the event is too far ahead for a forecast; the date the forecast becomes available. */
  availableFromDate: string | null;
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getStockholmDateKey(iso: string) {
  return getStockholmDateTimeParts(iso)?.dateKey ?? null;
}

function subtractDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(eventDate: string) {
  const todayKey = getStockholmDateKey(new Date().toISOString());

  if (!todayKey) {
    return null;
  }

  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  const target = new Date(`${eventDate}T00:00:00Z`).getTime();

  return Math.round((target - today) / DAY_IN_MS);
}

export function useWeatherForecast(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  eventDate: string | null | undefined,
): WeatherForecastState {
  const [entries, setEntries] = React.useState<WeatherForecastDayEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [availableFromDate, setAvailableFromDate] = React.useState<string | null>(null);

  const hasCoordinates =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude);
  const normalizedDate = typeof eventDate === 'string' && isIsoDate(eventDate) ? eventDate : null;

  React.useEffect(() => {
    if (!hasCoordinates || !normalizedDate) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      setAvailableFromDate(null);
      return;
    }

    const remainingDays = daysUntil(normalizedDate);

    if (remainingDays !== null && remainingDays > MAX_FORECAST_DAYS) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      setAvailableFromDate(subtractDays(normalizedDate, MAX_FORECAST_DAYS));
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setAvailableFromDate(null);

    void fetchSmhiForecast(latitude as number, longitude as number)
      .then((forecast) => {
        if (cancelled) {
          return;
        }

        const dayEntries = forecast
          .map((entry) => {
            const parts = getStockholmDateTimeParts(entry.intervalStartTime);
            const endParts = getStockholmDateTimeParts(entry.time);
            return parts
              ? { ...entry, hour: parts.hour, endHour: endParts?.hour ?? parts.hour, dateKey: parts.dateKey }
              : null;
          })
          .filter((entry): entry is WeatherForecastDayEntry & { dateKey: string } => {
            return entry !== null && entry.dateKey === normalizedDate;
          })
          .sort((a, b) => a.intervalStartTime.localeCompare(b.intervalStartTime))
          .map(({ dateKey, ...entry }) => entry);

        setEntries(dayEntries);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Okänt fel vid hämtning av väderprognos.',
        );
        setEntries([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasCoordinates, latitude, longitude, normalizedDate]);

  return { entries, error, isLoading, availableFromDate };
}
