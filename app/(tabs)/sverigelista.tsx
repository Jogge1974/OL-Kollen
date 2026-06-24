import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTextField } from '@/src/components/AppTextField';
import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { RunnerRankingModal, RunnerRankingSelection } from '@/src/components/RunnerRankingModal';
import { ClubRankingTrend, useClubRanking } from '@/src/hooks/useClubRanking';
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
  const [selectedClassLabel, setSelectedClassLabel] = React.useState<string | null>(null);
  const [selectedClubName, setSelectedClubName] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState('');
  const [clubSearchVisible, setClubSearchVisible] = React.useState(false);
  const [clubSearchText, setClubSearchText] = React.useState('');
  const [classSearchVisible, setClassSearchVisible] = React.useState(false);
  const [classSearchText, setClassSearchText] = React.useState('');
  const [activeRunnerRanking, setActiveRunnerRanking] = React.useState<RunnerRankingSelection | null>(null);
  const clubSearchListRef = React.useRef<FlatList<string> | null>(null);
  const classSearchListRef = React.useRef<FlatList<string> | null>(null);
  const listRef = React.useRef<FlatList<SverigelistanRow> | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = React.useState(false);
  const collapseAnim = React.useRef(new Animated.Value(1)).current;
  const lastScrollY = React.useRef(0);
  const { error, hasSupabase, isLoading, isRefreshing, latestUpdated, refetch, rows } = useSverigelistanDirectory({ enabled: canViewSverigelistan });
  const { rankings: clubRankings } = useClubRanking({ enabled: canViewSverigelistan });
  const [clubRankingListGender, setClubRankingListGender] = React.useState<'H' | 'D' | null>(null);
  const [clubRankingListSearch, setClubRankingListSearch] = React.useState('');
  const [clubDetailClub, setClubDetailClub] = React.useState<string | null>(null);
  const [clubRankingOverviewVisible, setClubRankingOverviewVisible] = React.useState(false);

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

        if (selectedClassLabel && classLabel !== selectedClassLabel) {
          return false;
        }

        if (selectedClubName && row.Club !== selectedClubName) {
          return false;
        }

        if (query && !haystack.includes(query)) {
          return false;
        }

        return true;
      }),
    [genderRows, rankingYear, searchText, selectedClassLabel, selectedClubName],
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
      birthYear: myRow.BirthYear,
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

  const handleOpenClassSearch = React.useCallback(() => {
    setClassSearchText(selectedClassLabel ?? '');
    setClassSearchVisible(true);
  }, [selectedClassLabel]);

  const handleMyClub = React.useCallback(() => {
    if (user?.organisationName) {
      setSelectedClubName(user.organisationName);
    }
  }, [user?.organisationName]);

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
      } else if (y <= 10 && headerCollapsed) {
        expandHeader();
      }
    },
    [collapseHeader, expandHeader, headerCollapsed],
  );

  const handleSelectClubFromSearch = React.useCallback((clubName: string) => {
    setSelectedClubName(clubName);
    setClubSearchVisible(false);
  }, []);

  const handleSelectClassFromSearch = React.useCallback((classLabel: string) => {
    setSelectedClassLabel(classLabel);
    setClassSearchVisible(false);
  }, []);

  const clubSearchResults = React.useMemo(() => {
    const query = clubSearchText.trim().toLocaleLowerCase('sv');

    if (!query) {
      return clubLabels;
    }

    return clubLabels.filter((clubName) => clubName.toLocaleLowerCase('sv').includes(query));
  }, [clubLabels, clubSearchText]);

  const classSearchResults = React.useMemo(() => {
    const query = classSearchText.trim().toLocaleLowerCase('sv');

    if (!query) {
      return classLabels;
    }

    return classLabels.filter((label) => label.toLocaleLowerCase('sv').includes(query));
  }, [classLabels, classSearchText]);

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

  React.useEffect(() => {
    if (!classSearchVisible || classSearchResults.length === 0 || !selectedClassLabel) {
      return;
    }

    const selectedIndex = classSearchResults.indexOf(selectedClassLabel);
    if (selectedIndex < 0) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      classSearchListRef.current?.scrollToIndex({
        animated: false,
        index: selectedIndex,
        viewPosition: 0.35,
      });
    });

    return () => cancelAnimationFrame(handle);
  }, [classSearchResults, classSearchVisible, selectedClassLabel]);

  const handleOpenRunnerRanking = React.useCallback((row: SverigelistanRow) => {
    if (!row.RunnerId) {
      return;
    }

    setActiveRunnerRanking({
      birthYear: row.BirthYear,
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
            <LinearGradient
              colors={[colors.heroBottom, colors.heroTop, colors.primary]}
              end={{ x: 0, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.controlsCard}
            >
                  {/* Row 1: Min sida + Min klubb (left), Reset filter (right) */}
                  <View style={styles.topBadgeRow}>
                    <View style={styles.topBadgeLeft}>
                      {currentUserRunnerId ? (
                        <Pressable onPress={handleOpenMyPage} style={({ pressed }) => [styles.myPageBadge, pressed ? styles.myPageBadgePressed : null]}>
                          <Ionicons color={colors.primaryDeep} name="person-outline" size={14} />
                          <Text style={styles.myPageBadgeText}>Min sida</Text>
                        </Pressable>
                      ) : null}
                      {user?.organisationName ? (
                        <Pressable onPress={handleMyClub} style={({ pressed }) => [styles.myClubBadge, pressed ? styles.myClubBadgePressed : null]}>
                          <Ionicons color={colors.primaryDeep} name="people-outline" size={14} />
                          <Text style={styles.myPageBadgeText}>Min klubb</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable onPress={handleResetFilters} style={({ pressed }) => [styles.resetAllButtonInline, pressed ? styles.resetAllButtonPressed : null]}>
                      <Ionicons color={colors.error} name="trash-outline" size={17} />
                      <Text style={styles.resetAllButtonText}>Filter</Text>
                    </Pressable>
                  </View>

                  {/* Row 2: Search text field */}
                  <AppTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    label="Sök namn, klubb eller klass"
                    labelColor={colors.heroText}
                    onClearText={() => setSearchText('')}
                    onChangeText={setSearchText}
                    placeholder="Skriv för att filtrera listan"
                    value={searchText}
                  />

                  {/* Row 3: Gender chips (left), Sök klubb / Sök klass (right) */}
                  <View style={styles.classHeaderRow}>
                    <View style={styles.modeRow}>
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
                    </View>
                    <View style={styles.classHeaderActions}>
                      <Pressable
                        onPress={selectedClubName ? () => setSelectedClubName(null) : handleOpenClubSearch}
                        style={({ pressed }) => [styles.searchClubChip, pressed ? styles.searchClubChipPressed : null]}
                      >
                        {!selectedClubName ? <Ionicons color={colors.primaryDeep} name="search-outline" size={15} /> : null}
                        <Text style={styles.searchClubText}>{selectedClubName ? 'Alla klubbar' : 'Sök klubb'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={selectedClassLabel ? () => setSelectedClassLabel(null) : handleOpenClassSearch}
                        style={({ pressed }) => [styles.searchClubChip, pressed ? styles.searchClubChipPressed : null]}
                      >
                        {!selectedClassLabel ? <Ionicons color={colors.primaryDeep} name="search-outline" size={15} /> : null}
                        <Text style={styles.searchClubText}>{selectedClassLabel ? 'Alla klasser' : 'Sök klass'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  {!hasSupabase ? <Text style={[styles.helperText, { color: colors.heroTextMuted }]}>Sverigelistan kan inte visas.</Text> : null}
            </LinearGradient>

            {/* Club Ranking Card — opens overview modal */}
            {(clubRankings.H.length > 0 || clubRankings.D.length > 0) ? (
              <View style={styles.clubRankingSplitCard}>
                <Pressable
                  onPress={() => setClubRankingOverviewVisible(true)}
                  style={styles.clubRankingPanelHeader}
                >
                  <Ionicons color={colors.primaryDeep} name="trophy-outline" size={18} />
                  <Text style={styles.clubRankingPanelTitle}>Klubbranking</Text>
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                </Pressable>
              </View>
            ) : null}

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
              filterLabel={selectedClassLabel ?? selectedClubName}
              onPress={() => handleOpenRunnerRanking(item)}
              showFilterPlacement={Boolean(selectedClassLabel || selectedClubName)}
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
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  clubSearchListRef.current?.scrollToIndex({ animated: false, index: info.index, viewPosition: 0.35 });
                }, 200);
              }}
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
      <Modal animationType="fade" transparent visible={classSearchVisible}>
        <View style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => setClassSearchVisible(false)} />
          <View style={styles.searchSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Sök klass</Text>
              <Pressable onPress={() => setClassSearchVisible(false)} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Sök"
              onChangeText={setClassSearchText}
              onClearText={() => setClassSearchText('')}
              placeholder="Skriv klassnamn"
              value={classSearchText}
            />

            <FlatList
              ref={classSearchListRef}
              contentContainerStyle={styles.searchResults}
              data={classSearchResults}
              initialNumToRender={12}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  classSearchListRef.current?.scrollToIndex({ animated: false, index: info.index, viewPosition: 0.35 });
                }, 200);
              }}
              ListEmptyComponent={<Text style={styles.searchEmptyText}>Inga klasser matchar sökningen.</Text>}
              renderItem={({ item }) => {
                const isSelected = item === selectedClassLabel;

                return (
                  <Pressable
                    onPress={() => handleSelectClassFromSearch(item)}
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

      {/* Club Ranking Overview Modal — Top 10 Herr + Top 10 Dam */}
      <Modal animationType="fade" transparent visible={clubRankingOverviewVisible}>
        <View style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => setClubRankingOverviewVisible(false)} />
          <View style={styles.clubRankingSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Klubbranking</Text>
              <Pressable onPress={() => setClubRankingOverviewVisible(false)} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.clubRankingOverviewContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {(['H', 'D'] as const).map((gender) => (
                <View key={gender} style={styles.clubRankingOverviewSection}>
                  <View style={styles.clubRankingOverviewSectionHeader}>
                    <Ionicons color={gender === 'H' ? '#2F6FB0' : '#C0568A'} name={gender === 'H' ? 'male' : 'female'} size={14} />
                    <Text style={[styles.clubRankingOverviewSectionTitle, { color: gender === 'H' ? '#2F6FB0' : '#C0568A' }]}>{gender === 'H' ? 'Herr' : 'Dam'}</Text>
                  </View>
                  {clubRankings[gender].slice(0, 10).map((entry, i) => (
                    <View
                      key={entry.current.club}
                      style={[
                        styles.clubRankingOverviewRow,
                        i % 2 === 1 ? styles.clubRankingOverviewRowAlt : null,
                      ]}
                    >
                      <Text style={styles.clubRankingOverviewRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</Text>
                      <Text numberOfLines={1} style={styles.clubRankingOverviewClub}>{entry.current.club}</Text>
                      <View style={styles.clubRankingOverviewPointsBadge}>
                        <Text style={styles.clubRankingOverviewPoints}>{entry.current.avgPoints.toFixed(2)}</Text>
                      </View>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      setClubRankingOverviewVisible(false);
                      setClubRankingListSearch('');
                      setClubRankingListGender(gender);
                    }}
                    style={styles.clubRankingShowAllLink}
                  >
                    <Text style={styles.clubRankingShowAllText}>Visa hela listan</Text>
                    <Ionicons color={colors.primary} name="chevron-forward" size={14} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Club Ranking Full List Modal */}
      <Modal animationType="fade" transparent visible={clubRankingListGender !== null}>
        <View style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => { setClubRankingListGender(null); setClubRankingOverviewVisible(true); }} />
          <View style={styles.clubRankingSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Klubbranking {clubRankingListGender === 'H' ? 'Herr' : 'Dam'}</Text>
              <Pressable onPress={() => { setClubRankingListGender(null); setClubRankingOverviewVisible(true); }} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Sök klubb"
              onChangeText={setClubRankingListSearch}
              onClearText={() => setClubRankingListSearch('')}
              placeholder="Skriv klubbnamn"
              value={clubRankingListSearch}
            />

            <FlatList
              contentContainerStyle={styles.clubRankingListContent}
              data={(clubRankingListGender ? clubRankings[clubRankingListGender] : []).filter((e) => {
                if (!clubRankingListSearch.trim()) return true;
                return e.current.club.toLocaleLowerCase('sv').includes(clubRankingListSearch.trim().toLocaleLowerCase('sv'));
              })}
              keyExtractor={(item) => item.current.club}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.searchEmptyText}>Inga klubbar matchar sökningen.</Text>}
              renderItem={({ item, index }) => (
                <ClubRankingAccordionRow
                  entry={item}
                  gender={clubRankingListGender ?? 'H'}
                  index={index}
                  isExpanded={clubDetailClub === item.current.club}
                  onToggle={() => setClubDetailClub(clubDetailClub === item.current.club ? null : item.current.club)}
                  rows={rows}
                />
              )}
            />

            <Text style={styles.clubRankingFootnote}>
              Snitt av {clubRankingListGender === 'H' ? '10' : '7'} bästa löpare per klubb · paddat med 302p vid färre
            </Text>
          </View>
        </View>
      </Modal>
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

function TrendIndicator({ entry }: { entry: ClubRankingTrend }) {
  const { colors } = useTheme();
  if (entry.trend === 'new') return null;
  if (entry.trend === 'same') return <Text style={{ color: '#F3DA3E', fontSize: 11, fontWeight: '700' }}>▶</Text>;
  const diff = entry.previousRank != null ? entry.previousRank - entry.current.rank : 0;
  if (entry.trend === 'up') {
    return <Text style={{ color: '#4CAF50', fontSize: 11, fontWeight: '700' }}>▲{Math.abs(diff)}</Text>;
  }
  return <Text style={{ color: '#E53935', fontSize: 11, fontWeight: '700' }}>▼{Math.abs(diff)}</Text>;
}

function ClubRankingAccordionRow({ entry, gender, index, isExpanded, onToggle, rows }: {
  entry: ClubRankingTrend;
  gender: 'H' | 'D';
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  rows: SverigelistanRow[];
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={[
          styles.clubRankingListRow,
          index % 2 === 0 ? styles.clubRankingListRowEven : styles.clubRankingListRowOdd,
          isExpanded && styles.clubRankingListRowExpanded,
        ]}
      >
        <Text style={styles.clubRankingListRank}>{entry.current.rank}</Text>
        <TrendIndicator entry={entry} />
        {entry.previousRank != null ? (
          <Text style={styles.clubRankingListPrev}>({entry.previousRank})</Text>
        ) : null}
        <Text numberOfLines={1} style={styles.clubRankingListClub}>{entry.current.club}</Text>
        <Text style={styles.clubRankingListPoints}>{entry.current.avgPoints.toFixed(2)}</Text>
        <Ionicons color={colors.textMuted} name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={14} />
      </Pressable>
      {isExpanded ? (
        <ClubDetailRunners club={entry.current.club} gender={gender} rows={rows} />
      ) : null}
    </View>
  );
}

function ClubDetailRunners({ club, gender, rows }: { club: string | null; gender: 'H' | 'D'; rows: SverigelistanRow[] }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const topN = gender === 'H' ? 10 : 7;

  const clubRunners = React.useMemo(() => {
    if (!club) return [];
    return rows
      .filter((r) => r.Club === club && r.Gender === gender)
      .sort((a, b) => a.Points - b.Points);
  }, [club, gender, rows]);

  const topRunners = clubRunners.slice(0, topN);
  const nextRunner = clubRunners[topN] ?? null;
  const avgPoints = React.useMemo(() => {
    const points = topRunners.map((r) => r.Points);
    while (points.length < topN) points.push(302);
    const sum = points.reduce((a, b) => a + b, 0);
    return (sum / topN).toFixed(2);
  }, [topRunners, topN]);

  if (!club) return null;

  return (
    <View style={styles.clubDetailContent}>
      <Text style={styles.clubDetailSubtitle}>
        Top {topN} löpare · Snitt: {avgPoints} p
      </Text>
      {topRunners.map((runner, i) => (
        <View key={runner.RunnerId ?? i} style={styles.clubDetailRunnerRow}>
          <Text style={styles.clubDetailRunnerIndex}>{i + 1}</Text>
          <Text numberOfLines={1} style={{ flex: 1 }}>
            <Text style={styles.clubDetailRunnerName}>{runner.Name}</Text>
            <Text style={styles.clubDetailRunnerMeta}> #{runner.Rank}</Text>
          </Text>
          <Text style={styles.clubDetailRunnerPoints}>{runner.Points.toFixed(2)}</Text>
        </View>
      ))}
      {topRunners.length < topN ? (
        <View style={styles.clubDetailPadRow}>
          <Text style={styles.clubDetailPadText}>
            +{topN - topRunners.length} tomma platser à 302.00 p
          </Text>
        </View>
      ) : null}
      {nextRunner ? (
        <>
          <View style={styles.clubDetailDivider} />
          <View style={styles.clubDetailRunnerRow}>
            <Text style={[styles.clubDetailRunnerIndex, { color: colors.textMuted }]}>{topN + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1 }}>
              <Text style={[styles.clubDetailRunnerName, { color: colors.textMuted }]}>{nextRunner.Name}</Text>
              <Text style={[styles.clubDetailRunnerMeta]}> #{nextRunner.Rank}</Text>
            </Text>
            <Text style={[styles.clubDetailRunnerPoints, { color: colors.textMuted }]}>{nextRunner.Points.toFixed(2)}</Text>
          </View>
        </>
      ) : null}
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
    flexDirection: 'row',
    gap: 4,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  resetAllButtonPressed: {
    opacity: 0.85,
  },
  resetAllButtonText: {
    ...typography.caption,
    color: colors.error,
    fontSize: 12,
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
    paddingHorizontal: 10,
  },
  myPageBadgePressed: {
    opacity: 0.85,
  },
  myPageBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  myClubBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primaryDeep,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  myClubBadgePressed: {
    opacity: 0.85,
  },
  topBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topBadgeLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
    borderColor: colors.primaryDeep,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: spacing.md,
    alignSelf: 'stretch',
    overflow: 'hidden',
    padding: spacing.lg,
    width: '100%',
  },
  clubRankingSplitCard: {
    backgroundColor: colors.surface,
    borderColor: isSoft
      ? (isDark ? '#3E5C8C' : '#5E7FB0')
      : (isDark ? '#4C8B47' : colors.primaryDeep),
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  clubRankingPanelHeader: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clubRankingPanelTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    flex: 1,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  clubRankingOverviewContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  clubRankingOverviewSection: {
    gap: 0,
  },
  clubRankingOverviewSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginBottom: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  clubRankingOverviewSectionTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  clubRankingOverviewRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  clubRankingOverviewRowAlt: {
    backgroundColor: colors.surfaceMuted,
  },
  clubRankingOverviewRank: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    fontSize: 12,
    minWidth: 26,
    textAlign: 'center',
  },
  clubRankingOverviewClub: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '600',
  },
  clubRankingOverviewPointsBadge: {
    backgroundColor: isSoft
      ? (isDark ? 'rgba(105, 191, 235, 0.18)' : 'rgba(15, 52, 124, 0.10)')
      : (isDark ? 'rgba(126, 196, 122, 0.18)' : 'rgba(76, 139, 71, 0.12)'),
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clubRankingOverviewPoints: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 11,
  },
  clubRankingShowAllLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    paddingVertical: 2,
  },
  clubRankingShowAllText: {
    ...typography.captionStrong,
    color: colors.primary,
  },
  clubRankingSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    maxHeight: '85%',
    padding: spacing.lg,
  },
  clubRankingListContent: {
    gap: 2,
  },
  clubRankingListRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  clubRankingListRowEven: {
    backgroundColor: colors.surfaceMuted,
  },
  clubRankingListRowOdd: {
    backgroundColor: colors.surface,
  },
  clubRankingListRowExpanded: {
    backgroundColor: isSoft
      ? (isDark ? 'rgba(15, 52, 124, 0.35)' : 'rgba(15, 52, 124, 0.12)')
      : (isDark ? 'rgba(76, 139, 71, 0.35)' : 'rgba(76, 139, 71, 0.20)'),
    borderLeftColor: colors.primaryDeep,
    borderLeftWidth: 3,
  },
  clubRankingListRank: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    fontSize: 13,
    minWidth: 24,
    textAlign: 'center',
  },
  clubRankingListClub: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
  },
  clubRankingListRunners: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  clubRankingListPrev: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  clubRankingListPoints: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  clubRankingFootnote: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  clubDetailContent: {
    backgroundColor: isSoft
      ? (isDark ? 'rgba(15, 52, 124, 0.25)' : 'rgba(15, 52, 124, 0.08)')
      : (isDark ? 'rgba(76, 139, 71, 0.18)' : 'rgba(76, 139, 71, 0.10)'),
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderLeftColor: colors.primaryDeep,
    borderLeftWidth: 3,
    gap: 4,
    marginHorizontal: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clubDetailSubtitle: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 12,
    marginBottom: 4,
  },
  clubDetailRunnerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 3,
  },
  clubDetailRunnerIndex: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 12,
    minWidth: 18,
    textAlign: 'center',
  },
  clubDetailRunnerName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
  },
  clubDetailRunnerMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  clubDetailRunnerPoints: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
  },
  clubDetailPadRow: {
    paddingVertical: 4,
  },
  clubDetailPadText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    fontSize: 11,
  },
  clubDetailDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 4,
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
