import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { RankingTrendChart } from '@/src/components/RankingTrendChart';
import { useSverigelistan } from '@/src/hooks/useSverigelistan';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanTrendDirection, SverigelistanTrendPoint } from '@/src/types/sverigelistan';

const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

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

export function SverigelistanTrendBadge({ direction }: { direction: SverigelistanTrendDirection }) {
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

export function SverigelistanTrendTable({
  classTrend,
  monthlyTrend,
}: {
  classTrend: SverigelistanTrendPoint[];
  monthlyTrend: SverigelistanTrendPoint[];
}) {
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

/**
 * Full Sverigelistan history section (rank summary + trend chart + trend table)
 * for an arbitrary runner. Fetches the data itself via useSverigelistan, so the
 * caller only needs to pass the runner's id, gender and birth year.
 */
export function SverigelistanTrendSection({
  birthDate,
  gender,
  runnerId,
}: {
  birthDate: string | null;
  gender: 'D' | 'H' | null;
  runnerId: string | null;
}) {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);

  const {
    className,
    classTrend,
    currentClassRank,
    currentEntry,
    error,
    hasSupabase,
    isLoading,
    monthlyTrend,
    previousClassRank,
    previousEntry,
    trendDirection,
  } = useSverigelistan({ birthDate, gender, runnerId });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons color={colors.primaryDeep} name="trending-up-outline" size={18} />
          <Text style={styles.cardTitle}>Sverigelistan-historik</Text>
        </View>
        {!isLoading && !error && hasSupabase && currentEntry ? (
          <Text style={styles.updated}>Uppd. {formatUpdatedDate(currentEntry.Updated)}</Text>
        ) : null}
      </View>

      {isLoading ? (
        <Text style={styles.helperText}>Hämtar Sverigelistan...</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
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
                <SverigelistanTrendBadge direction={trendDirection} />
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

          <View style={styles.trendHeaderRow}>
            <Text style={styles.trendHeaderTitle}>Placering senaste månaderna</Text>
          </View>
          <RankingTrendChart classPoints={classTrend} points={monthlyTrend} showTitle={false} />
          <SverigelistanTrendTable classTrend={classTrend} monthlyTrend={monthlyTrend} />
        </>
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette, _isDark: boolean, _isSoft: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md,
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    cardHeaderLeft: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    cardTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      fontSize: 16,
    },
    updated: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    helperText: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    errorText: {
      ...typography.caption,
      color: colors.error,
    },
    rankSummaryGrid: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    rankSummaryCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
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
  });
}
