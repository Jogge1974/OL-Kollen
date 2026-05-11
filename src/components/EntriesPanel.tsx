import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';

import { PersonEntry } from '@/src/hooks/usePersonEntries';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { formatDisplayDate } from '@/src/services/dateService';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { normalizeEventId } from '@/src/utils/eventId';

type EntriesPanelProps = {
  entries: PersonEntry[];
  error: string | null;
  isLoading: boolean;
  organisationLabel: string | null;
};

export function EntriesPanel({ entries, error, isLoading, organisationLabel }: EntriesPanelProps) {
  const pathname = usePathname();
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (!isLoading && !error && entries.length === 0) {
    return null;
  }

  const isFavorite = (eventId: string) => {
    const normalized = normalizeEventId(eventId);
    return favoriteEvents.some((e) => e.id === normalized);
  };

  const handleToggleFavorite = async (entry: PersonEntry) => {
    await toggleFavorite({
      classificationId: 0,
      classificationLabel: entry.className ?? '',
      dateLabel: formatDisplayDate(entry.eventDate),
      hasPublishedResults: false,
      hasPublishedStarts: false,
      id: normalizeEventId(entry.eventId),
      name: entry.eventName,
      startDate: entry.eventDate,
    });
  };

  const orgLabel = organisationLabel ?? 'Klubben';

  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setIsExpanded((v) => !v)} style={styles.titleRow}>
        <Ionicons color={colors.textMuted} name="clipboard-outline" size={18} />
        <Text style={styles.title}>Anmälningar</Text>
        <Text style={styles.subtitle}>
          {isLoading ? 'Laddar...' : `${entries.length} st`}
        </Text>
        <Ionicons color={colors.textMuted} name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>

      {isExpanded ? (
        isLoading ? (
          <Text style={styles.helperText}>Hämtar anmälningar...</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <View style={styles.list}>
            {entries.map((entry) => (
              <Pressable
                key={`${entry.eventId}-${entry.eventRaceId ?? ''}`}
                onPress={() => router.push({ params: { id: entry.eventId, returnTo: pathname }, pathname: '/event/[id]' })}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
              >
                <View style={styles.cardHeader}>
                  <Text numberOfLines={1} style={styles.eventName}>{entry.eventName}</Text>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.eventDate}>{formatShortWeekdayDate(entry.eventDate)}</Text>
                    <Pressable
                      hitSlop={6}
                      onPress={(event) => {
                        event.stopPropagation();
                        void handleToggleFavorite(entry);
                      }}
                      style={[styles.favoriteBadge, isFavorite(entry.eventId) ? styles.favoriteBadgeActive : null]}
                    >
                      <Ionicons
                        color={isFavorite(entry.eventId) ? colors.primaryDeep : colors.textSecondary}
                        name={isFavorite(entry.eventId) ? 'star' : 'star-outline'}
                        size={14}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Klass</Text>
                    <Text numberOfLines={1} style={styles.statValue}>{entry.className ?? '-'}</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Anm. totalt</Text>
                    <Text numberOfLines={1} style={styles.statValue}>{entry.totalEntries ?? '-'}</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Anm. {orgLabel}</Text>
                    <Text numberOfLines={1} style={styles.statValue}>{entry.organisationEntries ?? '-'}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatShortWeekdayDate(dateStr: string) {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const weekday = WEEKDAYS_SHORT[date.getDay()];
  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];
  return `${weekday} ${day} ${month}`;
}

function createStyles(colors: ColorPalette, isDark: boolean, isSoft: boolean) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.sm,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    title: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      fontSize: 17,
      lineHeight: 21,
      paddingTop: 2,
    },
    subtitle: {
      ...typography.body,
      color: colors.textMuted,
      flex: 1,
      fontSize: 13,
      textAlign: 'right',
    },
    helperText: {
      ...typography.body,
      color: colors.textMuted,
    },
    errorText: {
      ...typography.body,
      color: colors.error,
    },
    list: {
      gap: spacing.sm,
    },
    card: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      padding: spacing.sm,
    },
    cardPressed: {
      opacity: 0.7,
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    eventName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    cardHeaderRight: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    eventDate: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    favoriteBadge: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    favoriteBadgeActive: {
      backgroundColor: isDark ? 'rgba(255,215,0,0.15)' : '#FFFBE6',
      borderColor: isDark ? colors.accent : '#D4A800',
    },
    statsGrid: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    statCell: {
      flex: 1,
      gap: 2,
    },
    statLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    statValue: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
    },
  });
}
