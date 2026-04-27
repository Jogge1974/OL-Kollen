import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { formatDisplayDate } from '@/src/services/dateService';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { PersonActivitySection } from '@/src/types/personLists';
import { normalizeEventId } from '@/src/utils/eventId';

type PersonActivitySectionListProps = {
  emptyLabel: string;
  error: string | null;
  isLoading: boolean;
  kind: 'results' | 'starts';
  onOpenAnalysis?: (eventId: string, classLabel: string, personId?: string | null) => void;
  onOpenSplitTimes?: (eventId: string, classLabel: string) => void;
  onOpenResultList?: (eventId: string, classLabel: string, eventRaceId?: string | null) => void;
  onPressEvent?: (eventId: string) => void;
  sections: PersonActivitySection[];
};

export function PersonActivitySectionList({
  emptyLabel,
  error,
  isLoading,
  kind,
  onOpenAnalysis,
  onOpenResultList,
  onOpenSplitTimes,
  onPressEvent,
  sections,
}: PersonActivitySectionListProps) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);

  const isFavorite = React.useCallback(
    (eventId: string) => {
      const normalizedEventId = normalizeEventId(eventId);
      return favoriteEvents.some((event) => event.id === normalizedEventId);
    },
    [favoriteEvents],
  );

  const handleToggleFavorite = React.useCallback(
    async (row: PersonActivitySection['rows'][number]) => {
      if (kind !== 'starts' || !row.favouriteId) {
        return;
      }

      await toggleFavorite({
        classificationId: 0,
        classificationLabel: row.classLabel,
        dateLabel: formatDisplayDate(row.eventDate),
        hasPublishedResults: false,
        hasPublishedStarts: false,
        id: normalizeEventId(row.favouriteId),
        name: row.eventName,
        organiserLabel: row.organisation !== '-' ? row.organisation : undefined,
        startDate: row.eventDate,
      });
    },
    [kind, toggleFavorite],
  );

  if (isLoading) {
    return <Text style={styles.helperText}>Hämtar...</Text>;
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  if (sections.length === 0) {
    return <Text style={styles.helperText}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.list}>
      {sections.map((section) => (
        <Pressable
          key={section.eventId}
          disabled={!onPressEvent}
          onPress={() => onPressEvent?.(section.eventId)}
          style={({ pressed }) => [styles.sectionCard, onPressEvent && pressed ? styles.sectionCardPressed : null]}
        >
          <View style={styles.sectionHeader}>
            <Text numberOfLines={1} style={styles.sectionTitle}>
              {section.title}
            </Text>
            {kind === 'starts' ? (
              <View style={styles.sectionHeaderRight}>
                <Text numberOfLines={1} style={styles.startHeaderDate}>
                  {formatShortStartDate(section.eventDate)}
                </Text>
                {section.rows[0]?.favouriteId ? (
                  <Pressable
                    hitSlop={6}
                    onPress={(event) => {
                      event.stopPropagation();
                      void handleToggleFavorite(section.rows[0]);
                    }}
                    style={[styles.favoriteBadge, isFavorite(section.eventId) ? styles.favoriteBadgeActive : null]}
                  >
                    <Ionicons
                      color={isFavorite(section.eventId) ? colors.primaryDeep : colors.textSecondary}
                      name={isFavorite(section.eventId) ? 'star' : 'star-outline'}
                      size={14}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : section.meta ? (
              <Text numberOfLines={1} style={styles.sectionMeta}>
                {section.meta}
              </Text>
            ) : null}
          </View>

          <View style={styles.rows}>
            {section.rows.map((row, rowIndex) => (
              <View
                key={`${section.eventId}-${row.personId ?? row.favouriteId ?? row.eventName ?? 'row'}-${row.classLabel}-${rowIndex}`}
                style={styles.row}
              >
                {kind === 'starts' ? (
                  <View style={styles.startCard}>
                    <View style={styles.startGrid}>
                      <View style={styles.startCell}>
                        <Text style={styles.startCellLabel}>Klass</Text>
                        <Text numberOfLines={1} style={styles.startCellValue}>
                          {row.classLabel}
                        </Text>
                      </View>
                      <View style={styles.startCell}>
                        <Text style={styles.startCellLabel}>Ant.start</Text>
                        <Text numberOfLines={1} style={styles.startCellValue}>
                          {row.classEntriesCount ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.startCell}>
                        <Text style={styles.startCellLabel}>Bib</Text>
                        <Text numberOfLines={1} style={styles.startCellValue}>
                          {row.bibNumber ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.startCell}>
                        <Text style={styles.startCellLabel}>Starttid</Text>
                        <Text numberOfLines={1} style={styles.startCellValue}>
                          {row.startTime ?? row.time ?? '-'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.resultCard}>
                    <View style={styles.resultLineRow}>
                      <Text numberOfLines={1} style={[styles.resultLineText, styles.resultLineLeft]}>
                        {buildResultLeft(row)}
                      </Text>
                      {row.status && row.status !== 'OK' ? (
                        <View style={styles.resultStatusWideCell}>
                          <Text numberOfLines={1} style={styles.resultStatusWideText}>
                            {row.status}
                          </Text>
                        </View>
                      ) : (
                        <Text numberOfLines={1} style={[styles.resultLineText, styles.resultLineRight]}>
                          {buildResultRight(row)}
                        </Text>
                      )}
                    </View>

                    <View style={styles.resultActionRow}>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          onOpenResultList?.(row.eventId, row.classLabel, row.eventRaceId ?? null);
                        }}
                        style={[styles.resultActionButton, styles.resultActionButtonPrimary]}
                      >
                        <Ionicons color={colors.primaryDeep} name="trophy-outline" size={12} />
                        <Text style={[styles.resultActionButtonText, styles.resultActionButtonTextPrimary]}>Resultatlista</Text>
                      </Pressable>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          onOpenSplitTimes?.(row.eventId, row.classLabel);
                        }}
                        style={[styles.resultActionButton, styles.resultActionButtonMuted]}
                      >
                        <Ionicons color={colors.primaryDeep} name="time-outline" size={12} />
                        <Text style={styles.resultActionButtonText}>Sträcktider</Text>
                      </Pressable>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          onOpenAnalysis?.(row.eventId, row.classLabel, row.personId ?? null);
                        }}
                        style={[styles.resultActionButton, styles.resultActionButtonAnalysis]}
                      >
                        <Ionicons color={colors.primaryDeep} name="analytics-outline" size={14} />
                        <Text style={[styles.resultActionButtonText, styles.resultActionButtonTextAnalysis]}>Analys</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function formatShortStartDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  const weekday = new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(parsed).replace(/\.$/, '');
  const day = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(parsed);

  return `${weekday} ${day}`;
}

function buildResultLeft(row: PersonActivitySection['rows'][number]) {
  return row.classLabel;
}

function buildResultRight(row: PersonActivitySection['rows'][number]) {
  if (row.status && row.status !== 'OK') {
    return row.status ?? '-';
  }

  return `Tid: ${row.time ?? '-'} ${row.diff ?? '-'}, Plac: ${row.position ?? '-'}`;
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    backgroundColor: 'transparent',
    gap: 3,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  rows: {
    gap: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 6,
  },
  sectionCardPressed: {
    opacity: 0.92,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 16,
  },
  sectionHeaderRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  startGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  startCard: {
    gap: 6,
    paddingVertical: 2,
  },
  startHeaderDate: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
  },
  startCell: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  startCellLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  startCellValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'center',
    width: '100%',
  },
  resultCard: {
    gap: 8,
    paddingVertical: 2,
  },
  resultLineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  resultLineText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
  resultLineLeft: {
    flex: 1,
    minWidth: 0,
  },
  resultLineRight: {
    flexShrink: 0,
    textAlign: 'right',
  },
  resultStatusWideCell: {
    flex: 1,
    minWidth: 0,
  },
  resultStatusWideText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  resultActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  resultActionButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  resultActionButtonPrimary: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#17301A') : isSoft ? '#E0ECF8' : '#E9F2E1',
    borderColor: isDark ? (isSoft ? '#2A4878' : '#2E5A32') : isSoft ? '#6A9FD8' : '#86AD73',
  },
  resultActionButtonMuted: {
    backgroundColor: isDark ? (isSoft ? '#3A3000' : '#332D0A') : isSoft ? '#FFDD00' : '#F6D94B',
    borderColor: isDark ? (isSoft ? '#665A15' : '#665A15') : isSoft ? '#CCB200' : '#C9A700',
  },
  resultActionButtonAnalysis: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#0F1E30') : isSoft ? '#E0ECF8' : '#E7F1FF',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2E4A6E') : isSoft ? '#6A9FD8' : '#90B5E8',
  },
  resultActionButtonText: {
    ...typography.captionStrong,
    color: isDark ? '#F3DA3E' : '#6B5300',
    fontSize: 11,
    lineHeight: 13,
  },
  resultActionButtonTextPrimary: {
    color: isDark ? '#A8D49A' : '#355F2A',
  },
  resultActionButtonTextAnalysis: {
    color: isDark ? '#90B5E8' : '#2F66A8',
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  favoriteBadgeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
});
}
