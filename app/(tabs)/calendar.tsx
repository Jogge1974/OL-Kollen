import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { EventList } from '@/src/components/EventList';
import { EventMap } from '@/src/components/EventMap';
import { FilterModal } from '@/src/components/FilterModal';
import { LoadingState } from '@/src/components/LoadingState';
import { useEventorEvents } from '@/src/hooks/useEventorEvents';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function CalendarScreen() {
  const [filterVisible, setFilterVisible] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const { applyFilters, error, events, filters, isLoading, isRefreshing, refresh } = useEventorEvents();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <LinearGradient colors={[colors.background, colors.backgroundDeep]} style={styles.backgroundWash} />
        <View style={styles.backgroundOrbLarge} />
        <View style={styles.backgroundOrbSmall} />

        <Text style={styles.pageTitle}>Tävlingskalendern</Text>

        <View style={styles.headerCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillText}>{events.length} tävlingar</Text>
            </View>
            <Text style={styles.summaryText}>
              {filters.fromDate} till {filters.toDate}
            </Text>
          </View>

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

            <Pressable onPress={() => setFilterVisible(true)} style={styles.filterButton}>
              <Ionicons color={colors.primaryDeep} name="funnel-outline" size={16} />
              <Text style={styles.filterButtonText}>Filter</Text>
            </Pressable>
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
            description="Justera datumintervall eller tävlingstyper och försök igen."
            title="Inga tävlingar i listan"
          />
        ) : null}

        {!isLoading && events.length > 0 && viewMode === 'list' ? (
          <EventList error={error} events={events} onRefresh={() => void refresh()} refreshing={isRefreshing} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    flex: 1,
    gap: spacing.md,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
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
  pageTitle: {
    ...typography.screenTitle,
    color: colors.primaryDeep,
    marginLeft: spacing.xs,
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
    backgroundColor: colors.primaryDeep,
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
});
