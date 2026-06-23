import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useWeatherForecast, WeatherForecastDayEntry } from '@/src/hooks/useWeatherForecast';
import { formatDisplayDate } from '@/src/services/dateService';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 15;

// Metro requires static require() calls, so the weather symbols are mapped explicitly.
const WEATHER_SYMBOLS: Record<number, number> = {
  1: require('@/assets/weathersymbols/weathersymbol1.png'),
  2: require('@/assets/weathersymbols/weathersymbol2.png'),
  3: require('@/assets/weathersymbols/weathersymbol3.png'),
  4: require('@/assets/weathersymbols/weathersymbol4.png'),
  5: require('@/assets/weathersymbols/weathersymbol5.png'),
  6: require('@/assets/weathersymbols/weathersymbol6.png'),
  7: require('@/assets/weathersymbols/weathersymbol7.png'),
  8: require('@/assets/weathersymbols/weathersymbol8.png'),
  9: require('@/assets/weathersymbols/weathersymbol9.png'),
  10: require('@/assets/weathersymbols/weathersymbol10.png'),
  11: require('@/assets/weathersymbols/weathersymbol11.png'),
  12: require('@/assets/weathersymbols/weathersymbol12.png'),
  13: require('@/assets/weathersymbols/weathersymbol13.png'),
  14: require('@/assets/weathersymbols/weathersymbol14.png'),
  15: require('@/assets/weathersymbols/weathersymbol15.png'),
  16: require('@/assets/weathersymbols/weathersymbol16.png'),
  17: require('@/assets/weathersymbols/weathersymbol17.png'),
  18: require('@/assets/weathersymbols/weathersymbol18.png'),
  19: require('@/assets/weathersymbols/weathersymbol19.png'),
  20: require('@/assets/weathersymbols/weathersymbol20.png'),
  21: require('@/assets/weathersymbols/weathersymbol21.png'),
  22: require('@/assets/weathersymbols/weathersymbol22.png'),
  23: require('@/assets/weathersymbols/weathersymbol23.png'),
  24: require('@/assets/weathersymbols/weathersymbol24.png'),
  25: require('@/assets/weathersymbols/weathersymbol25.png'),
  26: require('@/assets/weathersymbols/weathersymbol26.png'),
  27: require('@/assets/weathersymbols/weathersymbol27.png'),
};

type WeatherForecastPanelProps = {
  latitude: number;
  longitude: number;
  eventDate: string;
};

function formatHour(hour: number) {
  return `${hour.toString().padStart(2, '0')}`;
}

function formatHourRange(startHour: number, endHour: number) {
  return `${formatHour(startHour)}-${formatHour(endHour)}`;
}

function formatTemperature(value: number | null) {
  return value === null ? '–' : `${Math.round(value)}°`;
}

function formatWind(speed: number | null, gust: number | null) {
  if (speed === null) {
    return '–';
  }

  const gustPart = gust === null ? '' : ` (${Math.round(gust)})`;
  return `${Math.round(speed)}${gustPart}`;
}

function formatPrecipitation(min: number | null, max: number | null, probability: number | null) {
  if (min === null && max === null) {
    return '–';
  }

  const safeMin = min ?? max ?? 0;
  const safeMax = max ?? min ?? 0;

  if (safeMin === 0 && safeMax === 0) {
    return '0';
  }

  const probabilityPart = probability === null ? '' : ` (${Math.round(probability)}%)`;
  return `${safeMin.toFixed(1)}-${safeMax.toFixed(1)}${probabilityPart}`;
}

export function WeatherForecastPanel({ eventDate, latitude, longitude }: WeatherForecastPanelProps) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showWholeDay, setShowWholeDay] = React.useState(false);

  const { availableFromDate, entries, error, isLoading } = useWeatherForecast(latitude, longitude, eventDate);

  const visibleEntries = React.useMemo(() => {
    if (showWholeDay) {
      return entries;
    }

    return entries.filter((entry) => entry.hour >= DEFAULT_START_HOUR && entry.hour <= DEFAULT_END_HOUR);
  }, [entries, showWholeDay]);

  const hasEntriesOutsideDefault = React.useMemo(
    () => entries.some((entry) => entry.hour < DEFAULT_START_HOUR || entry.hour > DEFAULT_END_HOUR),
    [entries],
  );

  return (
    <View style={[styles.panel, styles.weatherPanel]}>
      <Pressable onPress={() => setIsExpanded((current) => !current)} style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons color={colors.primary} name="partly-sunny-outline" size={18} />
          <Text style={styles.title}>Väderprognos</Text>
        </View>
        <Ionicons color={colors.primary} name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>

      {isExpanded ? (
        <View style={styles.body}>
          {availableFromDate ? (
            <Text style={styles.messageText}>
              Prognos tillgänglig först {formatDisplayDate(availableFromDate)}
            </Text>
          ) : isLoading ? (
            <Text style={styles.messageText}>Hämtar väderprognos…</Text>
          ) : error ? (
            <Text style={styles.messageText}>{error}</Text>
          ) : visibleEntries.length === 0 ? (
            <Text style={styles.messageText}>Ingen väderprognos tillgänglig för tävlingsdagen.</Text>
          ) : (
            <>
              <View style={styles.list}>
                <View style={[styles.row, styles.headerRow]}>
                  <View style={styles.hourCell}>
                    <Text style={styles.headerText}>Kl</Text>
                  </View>
                  <View style={styles.symbolCell}>
                    <Text style={styles.headerText}>Väder</Text>
                  </View>
                  <View style={styles.valueCell}>
                    <Text style={styles.headerText}>Temp (°C)</Text>
                  </View>
                  <View style={styles.windCell}>
                    <Text style={styles.headerText}>Vind (m/s)</Text>
                  </View>
                  <View style={styles.precipCell}>
                    <Text style={styles.headerText}>Nederb. (mm)</Text>
                  </View>
                </View>
                {visibleEntries.map((entry) => (
                  <WeatherRow key={entry.intervalStartTime} entry={entry} styles={styles} colors={colors} />
                ))}
              </View>

              {(showWholeDay || hasEntriesOutsideDefault) ? (
                <Pressable onPress={() => setShowWholeDay((current) => !current)} style={styles.toggleButton}>
                  <Text style={styles.toggleButtonText}>
                    {showWholeDay ? 'Visa kl 9–15' : 'Visa hela dagen'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function WeatherRow({
  colors,
  entry,
  styles,
}: {
  colors: ColorPalette;
  entry: WeatherForecastDayEntry;
  styles: ReturnType<typeof createStyles>;
}) {
  const symbolSource = entry.symbolCode !== null ? WEATHER_SYMBOLS[entry.symbolCode] : undefined;
  // The arrow points in the direction the wind blows toward. SMHI's
  // "wind_from_direction" is where the wind comes from, so add 180°. An
  // "arrow-up" icon points north (e.g. from-NNW 335° → blows toward SSE 155°).
  const windRotation = entry.windFromDirection === null ? null : (entry.windFromDirection + 180) % 360;

  return (
    <View style={styles.row}>
      <View style={styles.hourCell}>
        <Text style={styles.hourText}>{formatHourRange(entry.hour, entry.endHour)}</Text>
      </View>

      <View style={styles.symbolCell}>
        {symbolSource ? (
          <Image source={symbolSource} style={styles.symbolImage} resizeMode="contain" />
        ) : (
          <Text style={styles.unitText}>–</Text>
        )}
      </View>

      <View style={styles.valueCell}>
        <Text style={styles.valueText}>{formatTemperature(entry.airTemperature)}</Text>
      </View>

      <View style={styles.windCell}>
        <View style={styles.windValueRow}>
          <Text style={styles.valueText}>{formatWind(entry.windSpeed, entry.windSpeedOfGust)}</Text>
          {windRotation !== null ? (
            <View style={{ transform: [{ rotate: `${windRotation}deg` }] }}>
              <Ionicons color={colors.textPrimary} name="arrow-up" size={14} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.precipCell}>
        <Text style={styles.valueText}>
          {formatPrecipitation(
            entry.precipitationAmountMin,
            entry.precipitationAmountMax,
            entry.probabilityOfPrecipitation,
          )}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.surfaceOverlay,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: 8,
      padding: spacing.lg,
    },
    weatherPanel: {
      backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#17301A') : isSoft ? '#E0ECF8' : '#EAF4E0',
      borderColor: isDark ? (isSoft ? '#1E3058' : '#2E5A30') : isSoft ? '#B0C4DE' : '#CEE0C1',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    headerTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    title: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 17,
    },
    body: {
      gap: spacing.sm,
    },
    messageText: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    list: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    headerRow: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      paddingVertical: 5,
    },
    headerText: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 12,
    },
    hourCell: {
      alignItems: 'flex-start',
      width: 48,
    },
    hourText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 13,
      lineHeight: 18,
    },
    symbolCell: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
    },
    symbolImage: {
      height: 38,
      width: 38,
    },
    valueCell: {
      alignItems: 'center',
      flex: 1,
      gap: 1,
    },
    windCell: {
      alignItems: 'center',
      flex: 1.5,
      gap: 1,
    },
    precipCell: {
      alignItems: 'center',
      flex: 2.2,
      gap: 1,
    },
    windValueRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 3,
    },
    valueText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 18,
    },
    unitText: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 12,
    },
    toggleButton: {
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    toggleButtonText: {
      ...typography.captionStrong,
      color: colors.primary,
      fontSize: 13,
    },
  });
}
