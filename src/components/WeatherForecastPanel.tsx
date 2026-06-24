import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useWeatherForecast, WeatherForecastDayEntry } from '@/src/hooks/useWeatherForecast';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 15;

const SMHI_LOGO = require('@/assets/smhi-logo.png');
const SMHI_LOGO_SOURCE = Image.resolveAssetSource(SMHI_LOGO);
const SMHI_LOGO_ASPECT =
  SMHI_LOGO_SOURCE && SMHI_LOGO_SOURCE.height > 0
    ? SMHI_LOGO_SOURCE.width / SMHI_LOGO_SOURCE.height
    : 3;

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

function formatPrecipitation(min: number | null, max: number | null) {
  if (min === null && max === null) {
    return '–';
  }

  const safeMin = min ?? max ?? 0;
  const safeMax = max ?? min ?? 0;

  if (safeMin === 0 && safeMax === 0) {
    return '0';
  }

  return `${safeMin.toFixed(1)}-${safeMax.toFixed(1)}`;
}

export function WeatherForecastPanel({ eventDate, latitude, longitude }: WeatherForecastPanelProps) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showWholeDay, setShowWholeDay] = React.useState(false);
  const [isInfoVisible, setIsInfoVisible] = React.useState(false);

  const { availableFromDate, entries, error, isLoading } = useWeatherForecast(latitude, longitude, eventDate);

  // With few entries left there is no point in filtering to daytime hours, so
  // show them all and hide the toggle.
  const showAllHours = entries.length < 6;

  const visibleEntries = React.useMemo(() => {
    if (showWholeDay || showAllHours) {
      return entries;
    }

    return entries.filter((entry) => entry.hour >= DEFAULT_START_HOUR && entry.hour <= DEFAULT_END_HOUR);
  }, [entries, showAllHours, showWholeDay]);

  const hasEntriesOutsideDefault = React.useMemo(
    () => entries.some((entry) => entry.hour < DEFAULT_START_HOUR || entry.hour > DEFAULT_END_HOUR),
    [entries],
  );

  // Hide the whole panel when there is no forecast to show (event too far ahead
  // or no matching data for the day) instead of rendering an empty message.
  const hasNoForecast = !isLoading && !error && entries.length === 0;
  if (availableFromDate !== null || hasNoForecast) {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        if (!isExpanded) {
          setIsExpanded(true);
        }
      }}
      style={[styles.panel, styles.weatherPanel]}
    >
      <Pressable onPress={() => setIsExpanded((current) => !current)} style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons color={colors.primary} name="partly-sunny-outline" size={18} />
          <Text style={styles.title}>Väderprognos</Text>
        </View>
        <Ionicons color={colors.primary} name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>

      {isExpanded ? (
        <View style={styles.body}>
          {isLoading ? (
            <Text style={styles.messageText}>Hämtar väderprognos…</Text>
          ) : error ? (
            <Text style={styles.messageText}>{error}</Text>
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
                  <View style={styles.valueCell}>
                    <Text style={styles.headerText}>Ned (mm)</Text>
                  </View>
                  <View style={styles.valueCell}>
                    <Text style={styles.headerText}>Risk (%)</Text>
                  </View>
                </View>
                {visibleEntries.map((entry) => (
                  <WeatherRow key={entry.intervalStartTime} entry={entry} styles={styles} colors={colors} />
                ))}
              </View>
            </>
          )}

          <View style={styles.footerRow}>
            <View style={styles.footerSide} />
            {!showAllHours && (showWholeDay || hasEntriesOutsideDefault) ? (
              <Pressable onPress={() => setShowWholeDay((current) => !current)} style={styles.toggleButton}>
                <Text style={styles.toggleButtonText}>
                  {showWholeDay ? 'Visa kl 9–15' : 'Visa hela dagen'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.footerSideRight}>
              <Pressable hitSlop={8} onPress={() => setIsInfoVisible(true)}>
                <Ionicons color={colors.primary} name="information-circle-outline" size={19} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Modal animationType="fade" onRequestClose={() => setIsInfoVisible(false)} transparent visible={isInfoVisible}>
        <Pressable style={styles.infoModalOverlay} onPress={() => setIsInfoVisible(false)}>
          <Pressable style={styles.infoModalCard}>
            <View style={styles.infoModalTitleRow}>
              <Ionicons color={colors.primary} name="partly-sunny-outline" size={20} />
              <Text style={styles.infoModalTitle}>Väderprognos</Text>
            </View>
            <Text style={styles.infoModalText}>
              Prognosen hämtas från SMHI och gäller för tävlingsdagen.
            </Text>
            <View style={styles.infoModalSourceRow}>
              <Text style={styles.infoModalSourceLabel}>Källa</Text>
              <Image
                resizeMode="contain"
                source={SMHI_LOGO}
                style={styles.smhiLogo}
              />
            </View>
            <Pressable onPress={() => setIsInfoVisible(false)} style={styles.infoModalButton}>
              <Text style={styles.infoModalButtonText}>Stäng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
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

      <View style={styles.valueCell}>
        <Text style={styles.precipText}>
          {formatPrecipitation(entry.precipitationAmountMin, entry.precipitationAmountMax)}
        </Text>
      </View>

      <View style={styles.valueCell}>
        {entry.probabilityOfPrecipitation === null ? (
          <Text style={styles.precipText}>–</Text>
        ) : (
          <View
            style={[
              styles.riskBadge,
              entry.probabilityOfPrecipitation > 40 ? styles.riskBadgeHigh : styles.riskBadgeLow,
            ]}
          >
            <Text
              style={[
                styles.riskText,
                entry.probabilityOfPrecipitation > 40 ? styles.riskTextHigh : styles.riskTextLow,
              ]}
            >
              {Math.round(entry.probabilityOfPrecipitation)}%
            </Text>
          </View>
        )}
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
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
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
      includeFontPadding: false,
      lineHeight: 18,
      textAlignVertical: 'center',
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
    precipText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 16,
    },
    riskBadge: {
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    riskBadgeLow: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)',
    },
    riskBadgeHigh: {
      backgroundColor: '#1E88E5',
    },
    riskText: {
      ...typography.bodyStrong,
      fontSize: 12,
      lineHeight: 16,
    },
    riskTextLow: {
      color: colors.textSecondary,
    },
    riskTextHigh: {
      color: '#FFFFFF',
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
    footerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      paddingTop: spacing.xs,
    },
    footerSide: {
      flex: 1,
    },
    footerSideRight: {
      alignItems: 'flex-end',
      flex: 1,
    },
    toggleButtonText: {
      ...typography.captionStrong,
      color: colors.primary,
      fontSize: 13,
    },
    infoModalOverlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    infoModalCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: spacing.sm,
      maxWidth: 360,
      padding: spacing.lg,
      width: '100%',
    },
    infoModalTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    infoModalTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 16,
    },
    infoModalText: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    infoModalSourceRow: {
      alignItems: 'flex-start',
      gap: spacing.xs,
      paddingTop: spacing.xs,
    },
    infoModalSourceLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 12,
    },
    smhiLogo: {
      height: 26,
      width: 26 * SMHI_LOGO_ASPECT,
    },
    infoModalButton: {
      alignSelf: 'flex-end',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    infoModalButtonText: {
      ...typography.bodyStrong,
      color: colors.primary,
      fontSize: 14,
    },
  });
}
