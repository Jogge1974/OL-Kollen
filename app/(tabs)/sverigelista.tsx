import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTextField } from '@/src/components/AppTextField';
import { LoadingState } from '@/src/components/LoadingState';
import { RunnerRankingModal, RunnerRankingSelection } from '@/src/components/RunnerRankingModal';
import { getSverigelistanClassLabel, useSverigelistanDirectory } from '@/src/hooks/useSverigelistanDirectory';
import { useAuthStore } from '@/src/store/authStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanRow } from '@/src/types/sverigelistan';

export default function SverigelistaScreen() {
  const user = useAuthStore((state) => state.user);
  const [selectedGender, setSelectedGender] = React.useState<'D' | 'H'>(user?.gender ?? 'H');
  const [selectedFilterMode, setSelectedFilterMode] = React.useState<'class' | 'club'>('class');
  const [selectedClassLabel, setSelectedClassLabel] = React.useState<string | null>(null);
  const [selectedClubName, setSelectedClubName] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState('');
  const [activeRunnerRanking, setActiveRunnerRanking] = React.useState<RunnerRankingSelection | null>(null);
  const { error, hasSupabase, isLoading, latestUpdated, refetch, rows } = useSverigelistanDirectory();

  React.useEffect(() => {
    if (user?.gender === 'D' || user?.gender === 'H') {
      setSelectedGender(user.gender);
    }
  }, [user?.gender]);

  const rankingYear = React.useMemo(() => (latestUpdated ? Number(latestUpdated.slice(0, 4)) : new Date().getFullYear()), [latestUpdated]);

  const genderRows = React.useMemo(() => rows.filter((row) => row.Gender === selectedGender), [rows, selectedGender]);
  const classLabels = React.useMemo(() => buildClassLabels(genderRows, rankingYear), [genderRows, rankingYear]);
  const clubLabels = React.useMemo(() => buildClubLabels(genderRows), [genderRows]);

  React.useEffect(() => {
    if (selectedClassLabel && !classLabels.includes(selectedClassLabel)) {
      setSelectedClassLabel(null);
    }
  }, [classLabels, selectedClassLabel]);

  React.useEffect(() => {
    if (selectedClubName && !clubLabels.includes(selectedClubName)) {
      setSelectedClubName(null);
    }
  }, [clubLabels, selectedClubName]);

  const filteredRows = React.useMemo(
    () =>
      genderRows.filter((row) => {
        const classLabel = getSverigelistanClassLabel(row, rankingYear);
        const query = searchText.trim().toLocaleLowerCase('sv');
        const haystack = [row.Name, row.Club, classLabel, `${row.Rank}`, `${row.Points}`].join(' ').toLocaleLowerCase('sv');

        if (selectedFilterMode === 'class' && selectedClassLabel && classLabel !== selectedClassLabel) {
          return false;
        }

        if (selectedFilterMode === 'club' && selectedClubName && row.Club !== selectedClubName) {
          return false;
        }

        if (query && !haystack.includes(query)) {
          return false;
        }

        return true;
      }),
    [genderRows, rankingYear, searchText, selectedClassLabel, selectedClubName, selectedFilterMode],
  );

  const currentUserRunnerId = user?.personId ? Number(user.personId) : null;

  const handleResetFilters = React.useCallback(() => {
    setSearchText('');
    setSelectedClassLabel(null);
    setSelectedClubName(null);
  }, []);

  const handleOpenRunnerRanking = React.useCallback((row: SverigelistanRow) => {
    if (!row.RunnerId) {
      return;
    }

    setActiveRunnerRanking({
      clubName: row.Club,
      currentPoints: row.Points,
      currentRank: row.Rank,
      gender: row.Gender === 'D' ? 'D' : 'H',
      name: row.Name,
      personId: row.RunnerId,
    });
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={filteredRows}
        stickyHeaderIndices={[0]}
        keyExtractor={(item) => `${item.RunnerId ?? item.Rank}-${item.Updated}`}
        ListEmptyComponent={
          isLoading ? (
            <LoadingState label="Hämtar Sverigelistan..." />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {error ?? 'Inga rader matchar de valda filtren just nu.'}
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <LinearGradient colors={[colors.heroTop, colors.heroBottom]} style={styles.hero}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroEyebrow}>Ranking</Text>
                <Text numberOfLines={1} style={styles.heroTopDate}>
                  {latestUpdated ? `Uppd. ${formatPrettyDate(latestUpdated)}` : ''}
                </Text>
              </View>

              <Text style={styles.heroTitle}>Sverigelistan</Text>

              <View style={styles.heroMetaRow}>
                <MiniHeroChip icon="man-outline" label="Herr / Dam" value={selectedGender === 'H' ? 'Herr' : 'Dam'} />
                <MiniHeroChip icon="filter-outline" label="Klass" value={selectedClassLabel ?? 'Alla'} />
                <MiniHeroChip icon="people-outline" label="Visar" value={`${filteredRows.length} / ${genderRows.length}`} />
              </View>
            </LinearGradient>

            <View style={styles.controlsCard}>
              <View style={styles.genderRow}>
                {(['H', 'D'] as const).map((gender) => (
                  <Pressable
                    key={gender}
                    onPress={() => {
                      setSelectedGender(gender);
                      setSelectedClassLabel(null);
                    }}
                    style={[styles.genderChip, selectedGender === gender ? styles.genderChipActive : null]}
                  >
                    <Text style={[styles.genderChipText, selectedGender === gender ? styles.genderChipTextActive : null]}>
                      {gender === 'H' ? 'Herr' : 'Dam'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable onPress={handleResetFilters} style={({ pressed }) => [styles.resetAllButtonInline, pressed ? styles.resetAllButtonPressed : null]}>
                  <Ionicons color={colors.error} name="trash-outline" size={17} />
                </Pressable>
              </View>

              <AppTextField
                autoCapitalize="none"
                autoCorrect={false}
                label="Sök namn, klubb eller klass"
                onClearText={() => setSearchText('')}
                onChangeText={setSearchText}
                placeholder="Skriv för att filtrera listan"
                value={searchText}
              />

              <View style={styles.classHeaderRow}>
                <View style={styles.modeRow}>
                  {(['class', 'club'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setSelectedFilterMode(mode)}
                      style={[styles.modeChip, selectedFilterMode === mode ? styles.modeChipActive : null]}
                    >
                      <Text style={[styles.modeChipText, selectedFilterMode === mode ? styles.modeChipTextActive : null]}>
                        {mode === 'class' ? 'Klass' : 'Klubb'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={() => {
                    if (selectedFilterMode === 'class') {
                      setSelectedClassLabel(null);
                    } else {
                      setSelectedClubName(null);
                    }
                  }}
                  style={({ pressed }) => [styles.clearFilterChip, pressed ? styles.clearFilterChipPressed : null]}
                >
                  <Text style={styles.clearFilterText}>{selectedFilterMode === 'class' ? 'Alla klasser' : 'Alla klubbar'}</Text>
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classChipRow}>
                {selectedFilterMode === 'class'
                  ? classLabels.map((classLabel) => (
                      <Pressable
                        key={classLabel}
                        onPress={() => setSelectedClassLabel(classLabel)}
                        style={[styles.classChip, selectedClassLabel === classLabel ? styles.classChipActive : null]}
                      >
                        <Text style={[styles.classChipText, selectedClassLabel === classLabel ? styles.classChipTextActive : null]}>{classLabel}</Text>
                      </Pressable>
                    ))
                  : clubLabels.map((clubName) => (
                      <Pressable
                        key={clubName}
                        onPress={() => setSelectedClubName(clubName)}
                        style={[styles.classChip, selectedClubName === clubName ? styles.classChipActive : null]}
                      >
                        <Text style={[styles.classChipText, selectedClubName === clubName ? styles.classChipTextActive : null]}>{clubName}</Text>
                      </Pressable>
                    ))}
              </ScrollView>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {!hasSupabase ? <Text style={styles.helperText}>Supabase är inte konfigurerat, så Sverigelistan kan inte visas just nu.</Text> : null}
            </View>
          </View>
        }
        ListHeaderComponentStyle={styles.listHeader}
        style={styles.list}
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={isLoading} tintColor={colors.primary} onRefresh={refetch} />}
          renderItem={({ item, index }) => (
            <SverigelistaRowCard
              filterLabel={selectedFilterMode === 'class' ? selectedClassLabel : selectedFilterMode === 'club' ? selectedClubName : null}
              onPress={() => handleOpenRunnerRanking(item)}
              showFilterPlacement={selectedFilterMode === 'class' ? Boolean(selectedClassLabel) : Boolean(selectedClubName)}
              currentUserRunnerId={currentUserRunnerId}
              index={index}
              item={item}
            />
          )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <RunnerRankingModal comparisonRows={genderRows} onClose={() => setActiveRunnerRanking(null)} selection={activeRunnerRanking} />
    </SafeAreaView>
  );
}

function SverigelistaRowCard({
  filterLabel,
  showFilterPlacement,
  currentUserRunnerId,
  onPress,
  index,
  item,
}: {
  filterLabel: string | null;
  showFilterPlacement: boolean;
  currentUserRunnerId: number | null;
  onPress?: () => void;
  index: number;
  item: SverigelistanRow;
}) {
  const isMe = currentUserRunnerId !== null && item.RunnerId === currentUserRunnerId;
  const filterPlacement = filterLabel ? index + 1 : null;
  const showRightRank = showFilterPlacement && filterPlacement !== null;

  return (
    <Pressable
      disabled={!onPress || !item.RunnerId}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowCard,
        index % 2 === 0 ? styles.rowCardEven : styles.rowCardOdd,
        isMe ? styles.rowCardMe : null,
        pressed && onPress && item.RunnerId ? styles.rowCardPressed : null,
      ]}
    >
      <View style={showFilterPlacement ? styles.filterPlacementBadge : styles.rankBadge}>
        <Text style={showFilterPlacement ? styles.filterPlacementText : styles.rankBadgeText}>
          {showFilterPlacement && filterPlacement !== null ? filterPlacement : item.Rank}
        </Text>
      </View>

          <View style={styles.rowCenter}>
        <Text numberOfLines={1} style={styles.rowName}>
          {item.Name}
        </Text>
        <Text numberOfLines={1} style={styles.rowClub}>
          {item.Club}
        </Text>
      </View>

          {isMe ? (
              <View style={styles.meBadge}>
                  <Text style={styles.meBadgeText}>Du</Text>
              </View>
          ) : null}


      <View style={styles.rowRight}>
        {showRightRank ? (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>{item.Rank}</Text>
          </View>
        ) : null}
        <Text style={styles.pointsText}>{formatPoints(item.Points)}</Text>
      </View>

    </Pressable>
  );
}

function MiniHeroChip({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.heroChip}>
      <Ionicons color={colors.heroText} name={icon} size={14} />
      <View style={styles.heroChipTextWrap}>
        <Text style={styles.heroChipLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.heroChipValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function buildClassLabels(rows: SverigelistanRow[], rankingYear: number) {
  return [...new Set(rows.map((row) => getSverigelistanClassLabel(row, rankingYear)).filter((label): label is string => Boolean(label && label !== '-')))].sort(sortClassLabel);
}

function buildClubLabels(rows: SverigelistanRow[]) {
  return [...new Set(rows.map((row) => row.Club).filter((label) => Boolean(label.trim())))]
    .sort((left, right) => left.localeCompare(right, 'sv'));
}

function sortClassLabel(left: string, right: string) {
  const leftMatch = left.match(/^([DH])(\d+)$/);
  const rightMatch = right.match(/^([DH])(\d+)$/);

  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right, 'sv');
  }

  if (leftMatch[1] !== rightMatch[1]) {
    return leftMatch[1].localeCompare(rightMatch[1], 'sv');
  }

  return Number(leftMatch[2]) - Number(rightMatch[2]);
}

function formatPrettyDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(date)
    .replace('  ', ' ');
}

function formatPoints(points: number) {
  return Number.isInteger(points) ? `${points}` : points.toFixed(2);
}

const styles = StyleSheet.create({
  clearFilterChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  clearFilterChipPressed: {
    opacity: 0.85,
  },
  clearFilterText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  resetAllButtonInline: {
    alignItems: 'center',
    backgroundColor: '#FFF1F1',
    borderColor: '#E7B5B5',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 30,
  },
  resetAllButtonPressed: {
    opacity: 0.85,
  },
  classChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  classChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  classChipRow: {
    gap: 8,
  },
  classChipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  classChipTextActive: {
    color: colors.heroText,
  },
  classHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  controlsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    alignSelf: 'stretch',
    padding: spacing.sm,
    width: '100%',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  headerWrap: {
    gap: spacing.sm,
    alignSelf: 'stretch',
    width: '100%',
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  genderChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  genderChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  genderChipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  genderChipTextActive: {
    color: colors.heroText,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hero: {
    borderRadius: 28,
    gap: spacing.sm,
    alignSelf: 'stretch',
    overflow: 'hidden',
    padding: spacing.sm,
    width: '100%',
  },
  heroBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    gap: 4,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroBadgeText: {
    ...typography.bodyStrong,
    color: colors.heroText,
    fontSize: 15,
  },
  heroChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroChipLabel: {
    color: colors.heroTextMuted,
    fontSize: 10,
    lineHeight: 12,
  },
  heroChipTextWrap: {
    flex: 1,
  },
  heroChipValue: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 13,
    lineHeight: 15,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroTopDate: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: 'right',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.heroTextMuted,
  },
  heroTitle: {
    ...typography.sectionTitle,
    color: colors.heroText,
    fontSize: 22,
    lineHeight: 26,
  },
  heroTitleWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  listContent: {
    gap: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: 12,
  },
  listHeader: {
    paddingBottom: spacing.sm,
    paddingHorizontal: 0,
    paddingTop: 0,
    zIndex: 2,
  },
  meBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  //  position: 'absolute',
  //  right: 10,
      //  top: 10,
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
  },
  meBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 11,
  },
  pointsText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 16,
    minWidth: 54,
    textAlign: 'right',
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: colors.primaryDeep,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  rankBadgeText: {
    ...typography.bodyStrong,
    color: colors.heroText,
    fontSize: 13,
  },
  rowCard: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'relative',
  },
  rowCardPressed: {
    opacity: 0.88,
  },
  rowCardEven: {
    backgroundColor: colors.surface,
  },
  rowCardMe: {
    backgroundColor: '#F1F8EA',
    borderColor: colors.primary,
  },
  rowCardOdd: {
    backgroundColor: colors.surfaceMuted,
  },
  rowCenter: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  rowClub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
  },
  rowName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 18,
  },
  rowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  filterPlacementBadge: {
    alignItems: 'center',
    backgroundColor: '#E7F4D8',
    borderColor: '#B7D2A0',
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  filterPlacementText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 12,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  list: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  separator: {
    height: 1,
  },
  modeChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  modeChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  modeChipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  modeChipTextActive: {
    color: colors.heroText,
  },
});
