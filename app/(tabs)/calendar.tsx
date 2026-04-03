import * as React from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { EventList } from '@/src/components/EventList';
import { FilterModal } from '@/src/components/FilterModal';
import { LoadingState } from '@/src/components/LoadingState';
import { useEventorEvents } from '@/src/hooks/useEventorEvents';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export default function CalendarScreen() {
  const [filterVisible, setFilterVisible] = React.useState(false);
  const { applyFilters, error, events, filters, isLoading, isRefreshing, refresh } = useEventorEvents();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <LinearGradient colors={[colors.background, colors.backgroundDeep]} style={styles.backgroundWash} />
        <View style={styles.backgroundOrbLarge} />
        <View style={styles.backgroundOrbSmall} />

        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Tävlingskalendern</Text>
              <Text style={styles.subtitle}>Kompakt överblick med sommarfärger och snabb filtrering.</Text>
            </View>

            <Pressable onPress={() => setFilterVisible(true)} style={styles.filterButton}>
              <Text style={styles.filterButtonText}>Filter</Text>
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillText}>{events.length} tävlingar</Text>
            </View>
            <Text style={styles.summaryText}>
              {filters.fromDate} till {filters.toDate}
            </Text>
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

        {!isLoading && events.length > 0 ? (
          <EventList error={error} events={events} onRefresh={() => void refresh()} refreshing={isRefreshing} />
        ) : null}
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
  headerCard: {
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  filterButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterButtonText: {
    ...typography.buttonSmall,
    color: colors.textPrimary,
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
});
