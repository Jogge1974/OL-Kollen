import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { EventList } from '@/src/components/EventList';
import { EventMap } from '@/src/components/EventMap';
import { FilterModal } from '@/src/components/FilterModal';
import { LoadingState } from '@/src/components/LoadingState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { useEventorEvents } from '@/src/hooks/useEventorEvents';
import { useCalendarEntryCounts } from '@/src/hooks/useCalendarEntryCounts';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function CalendarScreen() {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const [filterVisible, setFilterVisible] = React.useState(false);
  const [legendVisible, setLegendVisible] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const { applyFilters, error, events, filters, isLoading, isRefreshing, refresh } = useEventorEvents();
  const { counts: entryCounts } = useCalendarEntryCounts(events, filters.showEntryCountsInList);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <LinearGradient colors={[colors.background, colors.backgroundDeep]} style={styles.backgroundWash} />
        <View style={styles.backgroundOrbLarge} />
        <View style={styles.backgroundOrbSmall} />
        <View style={styles.headerWrap}>
          <ScreenHeroHeader
            chips={[
              { flex: 2, icon: 'calendar-outline', label: 'Datumintervall', value: formatCalendarRange(filters.fromDate, filters.toDate) },
              { flex: 1, icon: 'map-outline', label: 'Distrikt', value: getSelectedDistrictCountLabel(filters.districtIds.length) },
            ]}
            eyebrow="Ranking"
            title="Tävlingskalendern"
            topRightText={`${events.length} tävlingar`}
          />

          <View style={styles.headerCard}>
            <View style={styles.controlsRow}>
              <View style={styles.modeSwitch}>
                <Pressable onPress={() => setViewMode('list')} style={[styles.modeButton, viewMode === 'list' ? styles.modeButtonActive : null]}>
                  <Ionicons color={viewMode === 'list' ? colors.heroText : colors.textSecondary} name="list-outline" size={16} />
                  <Text style={[styles.modeButtonText, viewMode === 'list' ? styles.modeButtonTextActive : null]}>Lista</Text>
                </Pressable>
                <Pressable onPress={() => setViewMode('map')} style={[styles.modeButton, viewMode === 'map' ? styles.modeButtonActive : null]}>
                  <Ionicons color={viewMode === 'map' ? colors.heroText : colors.textSecondary} name="map-outline" size={16} />
                  <Text style={[styles.modeButtonText, viewMode === 'map' ? styles.modeButtonTextActive : null]}>Karta</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => setLegendVisible(true)} style={styles.legendBadge}>
                <Ionicons color={colors.primaryDeep} name="information-circle-outline" size={20} />
              </Pressable>

              <Pressable onPress={() => setFilterVisible(true)} style={styles.filterButton}>
                <Ionicons color={colors.primaryDeep} name="funnel-outline" size={16} />
                <Text style={styles.filterButtonText}>Filter</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {isLoading ? <LoadingState label="Hämtar tävlingar från Eventor..." /> : null}

        {!isLoading && error && events.length === 0 ? (
          <EmptyState
            action={<AppButton label="Försök igen" onPress={() => void refresh()} />}
            description={error}
            title="Det gick inte att hämta tävlingar"
          />
        ) : null}

        {!isLoading && !error && events.length === 0 ? (
          <EmptyState
            action={<AppButton label="Öppna filter" onPress={() => setFilterVisible(true)} />}
            description="Justera filtret och försök igen."
            title="Inga tävlingar i listan"
          />
        ) : null}

        {!isLoading && events.length > 0 && viewMode === 'list' ? (
          <EventList entryCounts={entryCounts} error={error} events={events} onRefresh={() => void refresh()} refreshing={isRefreshing} />
        ) : null}

        {!isLoading && events.length > 0 && viewMode === 'map' ? <EventMap error={error} events={events} /> : null}
      </View>

      <FilterModal
        onApply={(nextFilters) => {
          setFilterVisible(false);
          void applyFilters(nextFilters);
        }}
        onClose={() => setFilterVisible(false)}
        value={filters}
        visible={filterVisible}
      />

      <Modal animationType="fade" onRequestClose={() => setLegendVisible(false)} transparent visible={legendVisible}>
        <View style={styles.legendOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLegendVisible(false)} />
          <View style={styles.legendSheet}>
            <View style={styles.legendHeader}>
              <Text style={styles.legendTitle}>Teckenförklaring</Text>
              <Pressable onPress={() => setLegendVisible(false)} style={styles.legendCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.legendCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <View style={styles.legendList}>
              <View style={styles.legendRow}>
                <View style={styles.legendCard}>
                  <View style={[styles.legendCardAccent, { backgroundColor: colors.border }]} />
                  <View style={styles.legendCardSkeleton}>
                    <View style={[styles.skeletonBar, styles.skeletonTitle, { backgroundColor: colors.textMuted + '30' }]} />
                    <View style={[styles.skeletonBar, styles.skeletonSub, { backgroundColor: colors.textMuted + '20' }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Tidigare tävlingar</Text>
                  <Text style={styles.legendDesc}>Tävlingar som redan genomförts</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendCard}>
                  <View style={[styles.legendCardAccent, { backgroundColor: colors.accent }]} />
                  <View style={styles.legendCardSkeleton}>
                    <View style={[styles.skeletonBar, styles.skeletonTitle, { backgroundColor: colors.textMuted + '30' }]} />
                    <View style={[styles.skeletonBar, styles.skeletonSub, { backgroundColor: colors.textMuted + '20' }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Tävlingar idag</Text>
                  <Text style={styles.legendDesc}>Pågående eller planerade idag</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendCard}>
                  <View style={[styles.legendCardAccent, { backgroundColor: colors.accentLineWeekday }]} />
                  <View style={styles.legendCardSkeleton}>
                    <View style={[styles.skeletonBar, styles.skeletonTitle, { backgroundColor: colors.textMuted + '30' }]} />
                    <View style={[styles.skeletonBar, styles.skeletonSub, { backgroundColor: colors.textMuted + '20' }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Kommande — vardag</Text>
                  <Text style={styles.legendDesc}>Måndag till fredag</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendCard}>
                  <View style={[styles.legendCardAccent, { backgroundColor: colors.accentLineToday }]} />
                  <View style={styles.legendCardSkeleton}>
                    <View style={[styles.skeletonBar, styles.skeletonTitle, { backgroundColor: colors.textMuted + '30' }]} />
                    <View style={[styles.skeletonBar, styles.skeletonSub, { backgroundColor: colors.textMuted + '20' }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Kommande — helg</Text>
                  <Text style={styles.legendDesc}>Lördag och söndag</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatCalendarRange(fromDate: string, toDate: string) {
  const start = formatShortDate(fromDate);
  const end = formatShortDate(toDate);

  return start === end ? start : `${start} – ${end}`;
}

function formatShortDate(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function getSelectedDistrictCountLabel(count: number) {
  return count === 1 ? '1 valt' : `${count} valda`;
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    flex: 1,
    gap: spacing.md,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  backgroundWash: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOrbLarge: {
    backgroundColor: colors.backgroundGlow,
    borderRadius: 999,
    height: 240,
    position: 'absolute',
    right: -60,
    top: 30,
    width: 240,
  },
  backgroundOrbSmall: {
    backgroundColor: colors.secondaryGlow,
    borderRadius: 999,
    bottom: 110,
    height: 160,
    left: -50,
    position: 'absolute',
    width: 160,
  },
  headerWrap: {
    gap: spacing.sm,
  },
  headerCard: {
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  summaryPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  summaryPillText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  summaryText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  controlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeSwitch: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flexDirection: 'row',
    padding: 4,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  modeButtonActive: {
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
  },
  modeButtonText: {
    ...typography.buttonSmall,
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.heroText,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  filterButtonText: {
    ...typography.buttonSmall,
    color: colors.textPrimary,
  },
  legendBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  legendOverlay: {
    backgroundColor: 'rgba(20, 24, 30, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  legendSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  legendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  legendCloseButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  legendCloseText: {
    ...typography.captionStrong,
    color: colors.primary,
  },
  legendList: {
    gap: spacing.md,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  legendCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    overflow: 'hidden',
    position: 'relative',
    width: 80,
  },
  legendCardAccent: {
    borderBottomLeftRadius: 14,
    borderTopLeftRadius: 14,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 6,
  },
  legendCardSkeleton: {
    gap: 6,
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
  },
  skeletonBar: {
    borderRadius: 4,
  },
  skeletonTitle: {
    height: 10,
    width: '80%',
  },
  skeletonSub: {
    height: 8,
    width: '55%',
  },
  legendTextWrap: {
    flex: 1,
    gap: 2,
  },
  legendLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  legendDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
}

