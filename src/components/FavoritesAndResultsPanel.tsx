import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { FavoriteEventSummary } from '@/src/types/preferences';
import { PersonActivitySection, PersonResultsFilter } from '@/src/types/personLists';

type FavoritesAndResultsPanelProps = {
  availableYears: number[];
  favoriteEvents: FavoriteEventSummary[];
  onClearFavorites: () => Promise<void>;
  onOpenAnalysis?: (eventId: string, classLabel: string, personId?: string | null) => void;
  onOpenResultList?: (eventId: string, classLabel: string, eventRaceId?: string | null) => void;
  onOpenSplitTimes?: (eventId: string, classLabel: string) => void;
  onRemoveFavorite: (eventId: string) => Promise<void>;
  resultsError: string | null;
  resultsFilter: PersonResultsFilter;
  resultsLoading: boolean;
  resultsSections: PersonActivitySection[];
  resultsYear: number;
  setResultsFilter: React.Dispatch<React.SetStateAction<PersonResultsFilter>>;
  setResultsYear: React.Dispatch<React.SetStateAction<number>>;
};

export function FavoritesAndResultsPanel({
  availableYears,
  favoriteEvents,
  onClearFavorites,
  onOpenAnalysis,
  onOpenResultList,
  onOpenSplitTimes,
  onRemoveFavorite,
  resultsError,
  resultsFilter,
  resultsLoading,
  resultsSections,
  resultsYear,
  setResultsFilter,
  setResultsYear,
}: FavoritesAndResultsPanelProps) {
  const pathname = usePathname();
  const [selectedTab, setSelectedTab] = React.useState<'favorites' | 'results'>('favorites');

  const confirmClearFavorites = () => {
    Alert.alert('Rensa alla favorittävlingar?', 'Alla favorittävlingar tas bort från appen.', [
      {
        style: 'cancel',
        text: 'Avbryt',
      },
      {
        style: 'destructive',
        text: 'Rensa',
        onPress: () => {
          void onClearFavorites();
        },
      },
    ]);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.tabBar}>
        <Pressable onPress={() => setSelectedTab('favorites')} style={[styles.tabButton, selectedTab === 'favorites' ? styles.tabButtonActive : null]}>
          <Text style={[styles.tabButtonText, selectedTab === 'favorites' ? styles.tabButtonTextActive : null]}>Favoriter</Text>
        </Pressable>
        <Pressable onPress={() => setSelectedTab('results')} style={[styles.tabButton, selectedTab === 'results' ? styles.tabButtonActive : null]}>
          <Text style={[styles.tabButtonText, selectedTab === 'results' ? styles.tabButtonTextActive : null]}>Mina resultat</Text>
        </Pressable>
      </View>

      {selectedTab === 'favorites' ? (
        <>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.title}>Favoriter</Text>
            {favoriteEvents.length > 0 ? (
              <Pressable onPress={confirmClearFavorites} style={styles.deleteButton}>
                <Ionicons color={colors.error} name="trash-outline" size={18} />
              </Pressable>
            ) : null}
          </View>

          {favoriteEvents.length === 0 ? (
            <Text style={styles.helperText}>Du har inte favoritmarkerat någon tävling ännu.</Text>
          ) : (
            <View style={styles.favoriteList}>
              {favoriteEvents.map((event) => (
                <View key={event.id} style={styles.favoriteRow}>
                  <Pressable
                    onPress={() => router.push({ params: { id: event.id, returnTo: pathname }, pathname: '/event/[id]' })}
                    style={({ pressed }) => [styles.favoriteLink, pressed ? styles.favoriteLinkPressed : null]}
                  >
                    <Text numberOfLines={2} style={styles.favoriteName}>
                      {event.name}
                    </Text>
                    {event.organiserLabel ? (
                      <Text numberOfLines={1} style={styles.favoriteOrganiser}>
                        {event.organiserLabel}
                      </Text>
                    ) : null}
                    <Text numberOfLines={1} style={styles.favoriteMeta}>
                      {[event.dateLabel, event.classificationLabel].filter(Boolean).join(' • ')}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => void onRemoveFavorite(event.id)} style={styles.favoriteRemoveButton}>
                    <Ionicons color={colors.primaryDeep} name="star" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.resultsHeaderRow}>
            <Text style={styles.title}>Mina resultat</Text>
            <View style={styles.resultsFilterPills}>
              {(['national', 'district'] as const).map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => setResultsFilter(filter)}
                  style={[styles.filterChip, resultsFilter === filter ? styles.filterChipActive : null]}
                >
                  <Text style={[styles.filterChipText, resultsFilter === filter ? styles.filterChipTextActive : null]}>
                    {filter === 'national' ? 'Nationella' : 'Distrikt/Klubb'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
            {availableYears.map((year) => (
              <Pressable
                key={year}
                onPress={() => setResultsYear(year)}
                style={[styles.yearChip, resultsYear === year ? styles.yearChipActive : null]}
              >
                <Text style={[styles.yearChipText, resultsYear === year ? styles.yearChipTextActive : null]}>{year}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <PersonActivitySectionList
            emptyLabel="Inga resultat hittades för den valda perioden."
            error={resultsError}
            isLoading={resultsLoading}
            kind="results"
            onOpenAnalysis={onOpenAnalysis}
            onOpenResultList={onOpenResultList}
            onOpenSplitTimes={onOpenSplitTimes}
            onPressEvent={(eventId) => router.push({ params: { id: eventId, returnTo: pathname }, pathname: '/event/[id]' })}
            sections={resultsSections}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#FFF1F1',
    borderColor: '#E7B5B5',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  favoriteLink: {
    flex: 1,
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  favoriteLinkPressed: {
    opacity: 0.85,
  },
  favoriteList: {
    gap: spacing.sm,
  },
  favoriteMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  favoriteName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  favoriteOrganiser: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 14,
  },
  favoriteRemoveButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  favoriteRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  filterChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  filterChipText: {
    color: colors.textPrimary,
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 11,
    lineHeight: 13,
  },
  filterChipTextActive: {
    color: colors.heroText,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  panelHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultsFilterPills: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  resultsHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabBar: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primaryDeep,
  },
  tabButtonText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  tabButtonTextActive: {
    color: colors.heroText,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  yearChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  yearChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  yearChipText: {
    color: colors.textPrimary,
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 14,
    lineHeight: 17,
  },
  yearChipTextActive: {
    color: colors.heroText,
  },
  yearRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: 2,
  },
});
