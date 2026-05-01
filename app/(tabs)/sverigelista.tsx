import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTextField } from '@/src/components/AppTextField';
import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { RunnerRankingModal, RunnerRankingSelection } from '@/src/components/RunnerRankingModal';
import { getSverigelistanClassLabel, useSverigelistanDirectory } from '@/src/hooks/useSverigelistanDirectory';
import { useAuthStore } from '@/src/store/authStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanRow } from '@/src/types/sverigelistan';

export default function SverigelistaScreen() {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const user = useAuthStore((state) => state.user);
  const canViewSverigelistan = Boolean(user);
  const [selectedGender, setSelectedGender] = React.useState<'D' | 'H'>(user?.gender ?? 'H');
  const [selectedFilterMode, setSelectedFilterMode] = React.useState<'class' | 'club'>('class');
  const [selectedClassLabel, setSelectedClassLabel] = React.useState<string | null>(null);
  const [selectedClubName, setSelectedClubName] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState('');
  const [clubSearchVisible, setClubSearchVisible] = React.useState(false);
  const [clubSearchText, setClubSearchText] = React.useState('');
  const [activeRunnerRanking, setActiveRunnerRanking] = React.useState<RunnerRankingSelection | null>(null);
  const clubSearchListRef = React.useRef<FlatList<string> | null>(null);
  const listRef = React.useRef<FlatList<SverigelistanRow> | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = React.useState(false);
  const collapseAnim = React.useRef(new Animated.Value(1)).current;
  const lastScrollY = React.useRef(0);
  const { error, hasSupabase, isLoading, isRefreshing, latestUpdated, refetch, rows } = useSverigelistanDirectory({ enabled: canViewSverigelistan });

  React.useEffect(() => {
    if (user?.gender === 'D' || user?.gender === 'H') {
      setSelectedGender(user.gender);
    }
  }, [user?.gender]);

  React.useEffect(() => {
    if (!user) {
      setActiveRunnerRanking(null);
    }
  }, [user]);

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

  const handleOpenMyPage = React.useCallback(() => {
    if (!currentUserRunnerId) {
      return;
    }

    const myRow = rows.find((row) => row.RunnerId === currentUserRunnerId);
    if (!myRow) {
      return;
    }

    setActiveRunnerRanking({
      clubName: myRow.Club,
      currentPoints: myRow.Points,
      currentRank: myRow.Rank,
      gender: myRow.Gender === 'D' ? 'D' : 'H',
      name: myRow.Name,
      personId: myRow.RunnerId,
    });
  }, [currentUserRunnerId, rows]);

  const handleOpenClubSearch = React.useCallback(() => {
    setClubSearchText(selectedClubName ?? '');
    setClubSearchVisible(true);
  }, [selectedClubName]);

  const collapseHeader = React.useCallback(() => {
    if (!headerCollapsed) {
      setHeaderCollapsed(true);
      Animated.timing(collapseAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    }
  }, [collapseAnim, headerCollapsed]);

  const expandHeader = React.useCallback(() => {
    if (headerCollapsed) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setHeaderCollapsed(false);
      Animated.timing(collapseAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    }
  }, [collapseAnim, headerCollapsed]);

  const handleScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = event.nativeEvent.contentOffset.y;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      if (delta > 12 && y > 80 && !headerCollapsed) {
        collapseHeader();
      }
    },
    [collapseHeader, headerCollapsed],
  );

  const handleSelectClubFromSearch = React.useCallback((clubName: string) => {
    setSelectedFilterMode('club');
    setSelectedClubName(clubName);
    setClubSearchVisible(false);
  }, []);

  const clubSearchResults = React.useMemo(() => {
    const query = clubSearchText.trim().toLocaleLowerCase('sv');

    if (!query) {
      return clubLabels;
    }

    return clubLabels.filter((clubName) => clubName.toLocaleLowerCase('sv').includes(query));
  }, [clubLabels, clubSearchText]);

  React.useEffect(() => {
    if (!clubSearchVisible || clubSearchResults.length === 0 || !selectedClubName) {
      return;
    }

    const selectedIndex = clubSearchResults.indexOf(selectedClubName);
    if (selectedIndex < 0) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      clubSearchListRef.current?.scrollToIndex({
        animated: false,
        index: selectedIndex,
        viewPosition: 0.35,
      });
    });

    return () => cancelAnimationFrame(handle);
  }, [clubSearchResults, clubSearchVisible, selectedClubName]);

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

  if (!canViewSverigelistan) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.blockedContainer}>
          <EmptyState
            action={<AppButton label="Logga in" onPress={() => router.push('/profile')} />}
            description="Logga in med Eventor för att se Sverigelistan."
            title="Sverigelistan kräver inloggning"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        ref={listRef}
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
          <Pressable style={styles.headerWrap} onPress={headerCollapsed ? expandHeader : undefined} disabled={!headerCollapsed}>
            <ScreenHeroHeader
              chips={headerCollapsed ? undefined : [
                { icon: 'man-outline', label: 'Herr / Dam', value: selectedGender === 'H' ? 'Herr' : 'Dam' },
                { icon: 'filter-outline', label: 'Klass', value: selectedClassLabel ?? 'Alla' },
                { icon: 'people-outline', label: 'Visar', value: `${filteredRows.length} / ${genderRows.length}` },
              ]}
              eyebrow="Ranking"
              title="Sverigelistan"
              topRightText={headerCollapsed
                ? `${selectedGender === 'H' ? 'Herr' : 'Dam'} · ${selectedClassLabel ?? 'Alla'} · ${filteredRows.length} st  ▼`
                : latestUpdated ? `Uppd. ${formatPrettyDate(latestUpdated)}` : ''}
            />

            <Animated.View style={{ maxHeight: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }), opacity: collapseAnim, overflow: 'hidden' }}>
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
                    {currentUserRunnerId ? (
                      <Pressable onPress={handleOpenMyPage} style={({ pressed }) => [styles.myPageBadge, pressed ? styles.myPageBadgePressed : null]}>
                        <Ionicons color={colors.primaryDeep} name="person-outline" size={14} />
                        <Text style={styles.myPageBadgeText}>Min sida</Text>
                      </Pressable>
                    ) : null}
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
                    <View style={styles.classHeaderActions}>
                      <Pressable onPress={handleOpenClubSearch} style={({ pressed }) => [styles.searchClubChip, pressed ? styles.searchClubChipPressed : null]}>
                        <Ionicons color={colors.primaryDeep} name="search-outline" size={15} />
                        <Text style={styles.searchClubText}>Sök klubb</Text>
                      </Pressable>
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
                  {!hasSupabase ? <Text style={styles.helperText}>Sverigelistan kan inte visas.</Text> : null}
            </View>
            </Animated.View>
          </Pressable>
        }
        ListHeaderComponentStyle={styles.listHeader}
        style={styles.list}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={isLoading || isRefreshing} tintColor={colors.primary} onRefresh={refetch} />}
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
      <Modal animationType="fade" transparent visible={clubSearchVisible}>
        <View style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => setClubSearchVisible(false)} />
          <View style={styles.searchSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Sök klubb</Text>
              <Pressable onPress={() => setClubSearchVisible(false)} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Sök"
              onChangeText={setClubSearchText}
              onClearText={() => setClubSearchText('')}
              placeholder="Skriv klubbnamn"
              value={clubSearchText}
            />

            <FlatList
              ref={clubSearchListRef}
              contentContainerStyle={styles.searchResults}
              data={clubSearchResults}
              initialNumToRender={12}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.searchEmptyText}>Inga klubbar matchar sökningen.</Text>}
              renderItem={({ item }) => {
                const isSelected = item === selectedClubName;

                return (
                  <Pressable
                    onPress={() => handleSelectClubFromSearch(item)}
                    style={({ pressed }) => [styles.searchResultItem, isSelected ? styles.searchResultItemSelected : null, pressed ? styles.searchResultItemPressed : null]}
                  >
                    <Text numberOfLines={1} style={[styles.searchResultText, isSelected ? styles.searchResultTextSelected : null]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
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

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
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
    backgroundColor: isDark ? (isSoft ? '#2A1020' : '#301717') : '#FFF1F1',
    borderColor: isDark ? (isSoft ? '#4A2040' : '#5A2E2E') : '#E7B5B5',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  resetAllButtonPressed: {
    opacity: 0.85,
  },
  myPageBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primaryDeep,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 30,
    justifyContent: 'center',
    marginLeft: 'auto',
    paddingHorizontal: 10,
  },
  myPageBadgePressed: {
    opacity: 0.85,
  },
  myPageBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
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
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
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
  classHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
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
    padding: spacing.lg,
    width: '100%',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  headerWrap: {
    backgroundColor: colors.background,
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
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
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
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  listContent: {
    gap: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  listHeader: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
    paddingHorizontal: 0,
    paddingTop: 0,
    zIndex: 2,
  },
  searchBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  searchCloseButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  searchCloseText: {
    ...typography.captionStrong,
    color: colors.primary,
  },
  searchEmptyText: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  searchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchOverlay: {
    backgroundColor: 'rgba(20, 24, 30, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  searchResultItem: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  searchResultItemPressed: {
    opacity: 0.85,
  },
  searchResultItemSelected: {
    backgroundColor: isSoft ? '#E0ECF8' : isDark ? colors.surfaceMuted : '#E7F4D8',
    borderColor: colors.primary,
  },
  searchResultText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  searchResultTextSelected: {
    color: colors.primaryDeep,
  },
  searchResults: {
    gap: 8,
    paddingTop: spacing.sm,
  },
  searchSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    maxHeight: '80%',
    padding: spacing.lg,
  },
  searchTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  searchClubChip: {
    alignItems: 'center',
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#0F1E30') : isSoft ? '#E8F0FA' : '#EEF4FF',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2E4A6E') : isSoft ? '#B0C4DE' : '#C8D6FF',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  searchClubChipPressed: {
    opacity: 0.85,
  },
  searchClubText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
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
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    minWidth: 30,
    paddingHorizontal: 6,
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
    backgroundColor: isSoft ? '#E0ECF8' : isDark ? colors.surfaceMuted : '#F1F8EA',
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
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#17301A') : isSoft ? '#E0ECF8' : '#E7F4D8',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2E5A30') : isSoft ? '#A0C0E0' : '#B7D2A0',
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
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
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
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
  },
  modeChipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  modeChipTextActive: {
    color: colors.heroText,
  },
});
}
