import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { RankingTrendChart } from '@/src/components/RankingTrendChart';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { SplitTimesModal, SplitTimesModalState, openEventSplitTimesModal } from '@/src/components/SplitTimesModal';
import { UpcomingStartsPanel } from '@/src/components/UpcomingStartsPanel';
import { useHeadToHead } from '@/src/hooks/useHeadToHead';
import { usePersonEventorLists } from '@/src/hooks/usePersonEventorLists';
import { useSverigelistan } from '@/src/hooks/useSverigelistan';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendsStore } from '@/src/store/friendsStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { PersonResultsFilter } from '@/src/types/personLists';
import { SverigelistanTrendDirection, SverigelistanTrendPoint } from '@/src/types/sverigelistan';

export default function FriendDetailScreen() {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);
  const { personId: personIdParam } = useLocalSearchParams<{ personId: string }>();
  const personId = personIdParam ?? null;

  const friends = useFriendsStore((state) => state.friends);
  const updateFriendPush = useFriendsStore((state) => state.updateFriendPush);
  const user = useAuthStore((state) => state.user);
  const friend = React.useMemo(
    () => friends.find((f) => String(f.personId) === personId) ?? null,
    [friends, personId],
  );

  const h2h = useHeadToHead(user?.personId ?? null, personId);

  const {
    availableYears,
    isLoadingResults,
    isLoadingStarts,
    refetch,
    resultsCompetitionCount,
    resultsError,
    resultsFilter,
    resultsSections,
    resultsYear,
    setResultsFilter,
    setResultsYear,
    startsError,
    startsSections,
  } = usePersonEventorLists({ personId });

  const {
    className,
    classTrend,
    currentClassRank,
    currentEntry,
    error: sverigelistanError,
    hasSupabase,
    isLoading: isSverigelistanLoading,
    monthlyTrend,
    previousClassRank,
    previousEntry,
    refetch: refetchSverigelistan,
    trendDirection,
  } = useSverigelistan({
    birthDate: friend?.birthYear ? `${friend.birthYear}` : null,
    gender: friend?.gender ?? null,
    runnerId: personId,
  });

  const [showSverigelistanTrend, setShowSverigelistanTrend] = React.useState(false);
  const [isH2hExpanded, setIsH2hExpanded] = React.useState(false);

  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [activeResultListModal, setActiveResultListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeSplitTimesModal, setActiveSplitTimesModal] = React.useState<SplitTimesModalState | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const podiumCount = React.useMemo(() => {
    let count = 0;
    for (const section of resultsSections) {
      for (const row of section.rows) {
        const pos = Number(row.position);
        if (pos >= 1 && pos <= 3) {
          count++;
        }
      }
    }
    return count;
  }, [resultsSections]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchSverigelistan()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleOpenResultList = React.useCallback(
    (eventId: string, classLabel: string, eventRaceId?: string | null) => {
      void openPublishedListModal('results', 'public', eventId, null, null, setActiveResultListModal, classLabel, eventRaceId ?? null);
    },
    [],
  );

  const handleOpenSplitTimes = React.useCallback((eventId: string, classLabel: string) => {
    void openEventSplitTimesModal(eventId, setActiveSplitTimesModal, classLabel);
  }, []);

  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personIdArg?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personIdArg ?? null);
  }, []);

  const filterChips: { label: string; value: PersonResultsFilter }[] = [
    { label: 'Nationella', value: 'national' },
    { label: 'Distrikt', value: 'district' },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={isRefreshing} tintColor={colors.primary} />}
      >
        <ScreenHeroHeader
          chips={friend ? [
            { icon: 'trophy-outline', label: 'Plac.', value: currentEntry ? `${currentEntry.Rank}` : '—' },
            { icon: 'flag-outline', label: 'Ant. starter', value: `${resultsCompetitionCount}` },
            { icon: 'medal-outline', label: 'Pallplatser', value: `${podiumCount}` },
          ] : undefined}
          eyebrowContent={
            <Pressable onPress={() => router.navigate('/friends')} style={styles.backButton}>
              <Ionicons color={colors.heroEyebrow} name="arrow-back" size={14} />
              <Text style={styles.backText}>Vänner</Text>
            </Pressable>
          }
          subtitle={friend ? friend.club : undefined}
          title={friend?.name ?? 'Okänd'}
          topRightContent={
            friend ? <Text style={styles.pushToggleGroupLabel}>Notiser</Text> : undefined
          }
          titleRightContent={
            friend ? (
              <View style={styles.pushToggles}>
                <Pressable
                  onPress={() => void updateFriendPush(friend.personId, 'pushOnStart', !friend.pushOnStart)}
                  style={[styles.pushPill, friend.pushOnStart ? styles.pushPillActive : null]}
                >
                  <Ionicons color={friend.pushOnStart ? colors.primaryDeep : colors.textMuted} name="time-outline" size={11} />
                  <Text style={[styles.pushPillText, friend.pushOnStart ? styles.pushPillTextActive : null]}>Starttid</Text>
                </Pressable>
                <Pressable
                  onPress={() => void updateFriendPush(friend.personId, 'pushOnResult', !friend.pushOnResult)}
                  style={[styles.pushPill, friend.pushOnResult ? styles.pushPillActive : null]}
                >
                  <Ionicons color={friend.pushOnResult ? colors.primaryDeep : colors.textMuted} name="trophy-outline" size={11} />
                  <Text style={[styles.pushPillText, friend.pushOnResult ? styles.pushPillTextActive : null]}>Resultat</Text>
                </Pressable>
              </View>
            ) : undefined
          }
        />

        {friend ? (
          <Pressable
            onPress={
              isSverigelistanLoading || sverigelistanError || !hasSupabase || !currentEntry
                ? undefined
                : () => setShowSverigelistanTrend((value) => !value)
            }
            style={styles.panel}
          >
            <View style={styles.sverigelistanHeader}>
              <Text style={styles.panelTitle}>Sverigelistan</Text>
              {isSverigelistanLoading || sverigelistanError || !hasSupabase || !currentEntry ? null : (
                <Text style={styles.sverigelistanUpdated}>Uppd. {formatUpdatedDate(currentEntry.Updated)}</Text>
              )}
            </View>

            {isSverigelistanLoading ? (
              <Text style={styles.helperText}>Hämtar Sverigelistan...</Text>
            ) : sverigelistanError ? (
              <Text style={styles.errorText}>{sverigelistanError}</Text>
            ) : !hasSupabase ? (
              <Text style={styles.helperText}>Sverigelistan kan inte visas just nu.</Text>
            ) : !currentEntry ? (
              <Text style={styles.helperText}>Det finns ännu ingen Sverigelistan-post för den här löparen.</Text>
            ) : (
              <>
                <View style={styles.rankSummaryGrid}>
                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardWide]}>
                    <Text style={styles.rankSummaryLabel}>Plac. (förra mån.)</Text>
                    <View style={styles.rankSummaryValueRow}>
                      <View style={styles.rankSummaryValueWrap}>
                        <Text style={styles.rankSummaryValue}>{currentEntry.Rank}</Text>
                        <Text style={styles.rankSummaryComparison}>({previousEntry ? previousEntry.Rank : '-'})</Text>
                      </View>
                      <TrendBadge direction={trendDirection} />
                    </View>
                  </View>

                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardWide]}>
                    <Text style={styles.rankSummaryLabel}>{className ? `Plac. ${className}` : 'Plac. klass'}</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{currentClassRank ?? '—'}</Text>
                      {previousClassRank ? <Text style={styles.rankSummaryComparison}>({previousClassRank})</Text> : null}
                    </View>
                  </View>

                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardNarrow]}>
                    <Text style={styles.rankSummaryLabel}>Poäng</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{formatPoints(currentEntry.Points)}</Text>
                    </View>
                  </View>
                </View>

                {showSverigelistanTrend ? (
                  <>
                    <View style={styles.trendHeaderRow}>
                      <Text style={styles.trendHeaderTitle}>Placering senaste månaderna</Text>
                      <Text style={styles.trendToggleLink}>&lt; Visa mindre</Text>
                    </View>
                    <RankingTrendChart classPoints={classTrend} points={monthlyTrend} showTitle={false} />
                    <TrendTable classTrend={classTrend} monthlyTrend={monthlyTrend} />
                  </>
                ) : (
                  <Text style={styles.trendToggleLink}>Visa mer &gt;</Text>
                )}
              </>
            )}
          </Pressable>
        ) : null}

        {user && friend ? (
          <View style={styles.panel}>
            <Pressable onPress={() => setIsH2hExpanded((v) => !v)} style={styles.h2hHeader}>
              <Text style={styles.panelTitle}>Head-To-Head</Text>
              <Text style={styles.h2hSubtitle}>
                {h2h.isLoading ? 'Laddar...' : `${h2h.sharedEvents} möten i år`}
              </Text>
              <Ionicons color={colors.textMuted} name={isH2hExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
            </Pressable>

            {isH2hExpanded && !h2h.isLoading ? (
              h2h.matches.length === 0 ? (
                <Text style={styles.helperText}>Inga gemensamma tävlingar hittades i år.</Text>
              ) : (
                <>
                  <View style={styles.h2hStatsRow}>
                    <View style={styles.h2hStatCard}>
                      <Text style={styles.h2hStatValue}>{h2h.myWins}</Text>
                      <Text style={styles.h2hStatLabel}>Mina segrar</Text>
                    </View>
                    <View style={styles.h2hStatCard}>
                      <Text style={styles.h2hStatValue}>{h2h.ties}</Text>
                      <Text style={styles.h2hStatLabel}>Lika</Text>
                    </View>
                    <View style={styles.h2hStatCard}>
                      <Text style={styles.h2hStatValue}>{h2h.friendWins}</Text>
                      <Text style={styles.h2hStatLabel}>{friend.name.split(' ')[0]}</Text>
                    </View>
                  </View>

                  <View style={styles.h2hMatchList}>
                    {h2h.matches.map((match) => (
                      <View
                        key={match.eventId}
                        style={[
                          styles.h2hMatchRow,
                          match.winner === 'me' ? styles.h2hMatchRowWin : null,
                          match.winner === 'friend' ? styles.h2hMatchRowLoss : null,
                          match.winner === 'tie' ? styles.h2hMatchRowTie : null,
                        ]}
                      >
                        <View style={styles.h2hMatchInfo}>
                          <Text numberOfLines={1} style={styles.h2hMatchName}>{match.eventName}</Text>
                          <Text style={styles.h2hMatchDate}>{match.date}</Text>
                        </View>
                        <View style={styles.h2hMatchTimes}>
                          <View style={styles.h2hMatchSide}>
                            <Text style={[styles.h2hTime, match.winner === 'me' ? styles.h2hTimeWin : null]}>
                              {match.myTime ?? '—'}
                            </Text>
                            <Text style={[styles.h2hPos, match.winner === 'me' ? styles.h2hTimeWin : null]}>
                              {match.myPosition != null ? `#${match.myPosition}` : '—'}
                            </Text>
                          </View>
                          <Text style={styles.h2hTimeSep}>vs</Text>
                          <View style={styles.h2hMatchSide}>
                            <Text style={[styles.h2hTime, match.winner === 'friend' ? styles.h2hTimeWin : null]}>
                              {match.friendTime ?? '—'}
                            </Text>
                            <Text style={[styles.h2hPos, match.winner === 'friend' ? styles.h2hTimeWin : null]}>
                              {match.friendPosition != null ? `#${match.friendPosition}` : '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )
            ) : null}
          </View>
        ) : null}

        <UpcomingStartsPanel error={startsError} isLoading={isLoadingStarts} sections={startsSections} />

        <View style={styles.resultsPanel}>
          <View style={styles.resultsPanelHeader}>
            <Text style={styles.resultsPanelTitle}>Resultat</Text>
            <View style={styles.yearRow}>
              {availableYears.map((year) => (
                <Pressable
                  key={year}
                  onPress={() => setResultsYear(year)}
                  style={[styles.yearChip, resultsYear === year ? styles.yearChipActive : null]}
                >
                  <Text style={[styles.yearChipText, resultsYear === year ? styles.yearChipTextActive : null]}>
                    {year}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            {filterChips.map((chip) => (
              <Pressable
                key={chip.value}
                onPress={() => setResultsFilter(chip.value)}
                style={[styles.filterChip, resultsFilter === chip.value ? styles.filterChipActive : null]}
              >
                <Text style={[styles.filterChipText, resultsFilter === chip.value ? styles.filterChipTextActive : null]}>
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <PersonActivitySectionList
            emptyLabel="Inga resultat hittades."
            error={resultsError}
            isLoading={isLoadingResults}
            kind="results"
            onOpenAnalysis={handleOpenAnalysis}
            onOpenResultList={handleOpenResultList}
            onOpenSplitTimes={handleOpenSplitTimes}
            sections={resultsSections}
          />
        </View>
      </ScrollView>

      <PublishedListModal onClose={() => setActiveResultListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeResultListModal} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
      <SplitTimesModal onClose={() => setActiveSplitTimesModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeSplitTimesModal} />
    </SafeAreaView>
  );
}

function TrendBadge({ direction }: { direction: SverigelistanTrendDirection }) {
  const colors = useColors();
  if (direction === 'unknown') {
    return null;
  }
  const iconName = direction === 'better' ? 'arrow-up' : direction === 'worse' ? 'arrow-down' : 'arrow-forward';
  const iconColor = direction === 'better' ? colors.primary : direction === 'worse' ? colors.error : colors.textSecondary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 24, minWidth: 24 }}>
      <Ionicons color={iconColor} name={iconName} size={22} />
    </View>
  );
}

function formatPoints(points: number) {
  return points.toLocaleString('sv-SE', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatUpdatedDate(updated: string) {
  const parsed = new Date(updated);
  if (Number.isNaN(parsed.getTime())) {
    return updated;
  }
  return parsed.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatMonthLabel(monthKey: string | undefined) {
  if (!monthKey || monthKey.length < 7) {
    return '-';
  }
  const month = Number(monthKey.slice(5, 7)) - 1;
  const year = monthKey.slice(2, 4);
  return `${MONTH_SHORT[month] ?? '?'} '${year}`;
}

function buildClassColumnHeader(classTrend: SverigelistanTrendPoint[]) {
  const classNames = new Set<string>();
  for (const point of classTrend) {
    if (point.className) {
      classNames.add(point.className);
    }
  }
  const sorted = [...classNames].sort();
  return sorted.length === 0 ? 'Klass' : sorted.join('/');
}

function TrendTable({ classTrend, monthlyTrend }: { classTrend: SverigelistanTrendPoint[]; monthlyTrend: SverigelistanTrendPoint[] }) {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);

  const classHeader = React.useMemo(() => buildClassColumnHeader(classTrend), [classTrend]);
  const classLookup = React.useMemo(() => {
    const map = new Map<string, number | null>();
    for (const point of classTrend) {
      if (point.monthKey) {
        map.set(point.monthKey, point.rank);
      }
    }
    return map;
  }, [classTrend]);

  const hasAnyData = monthlyTrend.some((p) => p.rank !== null);
  if (!hasAnyData) {
    return null;
  }

  const dataRows = monthlyTrend.filter((p) => p.rank !== null || classLookup.get(p.monthKey ?? '') !== undefined);

  return (
    <View style={styles.trendTable}>
      <View style={[styles.trendTableRow, styles.trendTableHeaderRow]}>
        <Text style={[styles.trendTableCell, styles.trendTableHeaderCell, styles.trendTableCellMonth]}>Månad</Text>
        <Text style={[styles.trendTableCell, styles.trendTableHeaderCell, styles.trendTableCellRank]}>Riks</Text>
        <Text style={[styles.trendTableCell, styles.trendTableHeaderCell, styles.trendTableCellRank]}>{classHeader}</Text>
        <Text style={[styles.trendTableCell, styles.trendTableHeaderCell, styles.trendTableCellPoints]}>Po.</Text>
      </View>
      {dataRows.map((point, index) => {
        const classRank = classLookup.get(point.monthKey ?? '') ?? null;
        return (
          <View key={point.monthKey ?? index} style={[styles.trendTableRow, index % 2 === 0 ? styles.trendTableRowEven : null]}>
            <Text style={[styles.trendTableCell, styles.trendTableCellMonth]}>{formatMonthLabel(point.monthKey)}</Text>
            <Text style={[styles.trendTableCell, styles.trendTableCellRank]}>{point.rank ?? '-'}</Text>
            <Text style={[styles.trendTableCell, styles.trendTableCellRank]}>{classRank ?? '-'}</Text>
            <Text style={[styles.trendTableCell, styles.trendTableCellPoints]}>{point.points != null ? formatPoints(point.points) : '-'}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean, isSoft: boolean) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    container: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
    },
    backButton: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    backText: {
      ...typography.eyebrow,
      color: colors.heroEyebrow,
      fontSize: 11,
      letterSpacing: 0.8,
    },
    pushToggles: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: 5,
      marginTop: -2,
    },
    pushToggleGroupLabel: {
      ...typography.eyebrow,
      color: colors.heroEyebrow,
      fontSize: 11,
      letterSpacing: 0.8,
    },
    pushPill: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    pushPillActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.primary,
    },
    pushPillText: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
    },
    pushPillTextActive: {
      color: colors.primaryDeep,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.sm,
    },
    panelTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
    h2hHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    h2hSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      flex: 1,
      textAlign: 'right',
    },
    h2hStatsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    h2hStatCard: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderRadius: 14,
      flex: 1,
      gap: 2,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    h2hStatValue: {
      ...typography.sectionTitle,
      color: colors.primaryDeep,
      fontSize: 20,
    },
    h2hStatLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 11,
    },
    h2hMatchList: {
      gap: 6,
    },
    h2hMatchRow: {
      alignItems: 'center',
      borderRadius: 10,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
    },
    h2hMatchRowWin: {
      backgroundColor: `${colors.primary}${isDark ? '1F' : '14'}`,
    },
    h2hMatchRowLoss: {
      backgroundColor: isDark ? 'rgba(244,67,54,0.10)' : 'rgba(244,67,54,0.06)',
    },
    h2hMatchRowTie: {
      backgroundColor: isDark ? 'rgba(255,193,7,0.10)' : 'rgba(255,193,7,0.08)',
    },
    h2hMatchInfo: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    h2hMatchName: {
      ...typography.caption,
      color: colors.textPrimary,
      fontSize: 12,
    },
    h2hMatchDate: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
    },
    h2hMatchTimes: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    h2hMatchSide: {
      alignItems: 'center',
    },
    h2hTime: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 12,
      minWidth: 44,
      textAlign: 'center',
    },
    h2hPos: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      textAlign: 'center',
    },
    h2hTimeWin: {
      color: colors.primary,
    },
    h2hTimeSep: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
    },
    helperText: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 20,
    },
    errorText: {
      ...typography.captionStrong,
      color: colors.error,
    },
    sverigelistanHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sverigelistanUpdated: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 13,
    },
    rankSummaryCard: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      flex: 1,
      gap: 3,
      paddingHorizontal: spacing.xs,
      paddingVertical: 6,
    },
    rankSummaryCardNarrow: {
      flex: 0.82,
    },
    rankSummaryCardWide: {
      flex: 1.08,
    },
    rankSummaryGrid: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    rankSummaryLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 13,
      textAlign: 'center',
      width: '100%',
    },
    rankSummaryValue: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 20,
      textAlign: 'center',
    },
    rankSummaryComparison: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    rankSummaryValueRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'space-between',
      width: '100%',
    },
    rankSummaryValueWrap: {
      alignItems: 'baseline',
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 4,
      justifyContent: 'center',
    },
    trendHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    trendHeaderTitle: {
      ...typography.captionStrong,
      color: colors.textPrimary,
    },
    trendToggleLink: {
      ...typography.captionStrong,
      color: colors.textMuted,
      alignSelf: 'flex-end',
      paddingRight: 2,
      paddingVertical: 2,
    },
    trendTable: {
      marginTop: spacing.sm,
    },
    trendTableRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    trendTableHeaderRow: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    trendTableRowEven: {
      backgroundColor: colors.background,
    },
    trendTableCell: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 12,
    },
    trendTableHeaderCell: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      fontSize: 12,
    },
    trendTableCellMonth: {
      flex: 2,
    },
    trendTableCellRank: {
      flex: 1,
      textAlign: 'center',
    },
    trendTableCellPoints: {
      flex: 1.5,
      textAlign: 'right',
    },
    resultsPanel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md,
    },
    resultsPanelHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    resultsPanelTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
    yearRow: {
      flexDirection: 'row',
      gap: 6,
    },
    yearChip: {
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    yearChipActive: {
      backgroundColor: colors.primaryDeep,
      borderColor: colors.primaryDeep,
    },
    yearChipText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
    },
    yearChipTextActive: {
      color: '#fff',
    },
    filterRow: {
      flexDirection: 'row',
      gap: 6,
    },
    filterChip: {
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    filterChipActive: {
      backgroundColor: isSoft
        ? (isDark ? '#1E3058' : '#D0E0F0')
        : (isDark ? '#1E4428' : '#E7F4D8'),
      borderColor: colors.primary,
    },
    filterChipText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
    },
    filterChipTextActive: {
      color: colors.primaryDeep,
    },
  });
}
