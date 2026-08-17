import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/src/components/EmptyState';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { useSeriesDetail } from '@/src/hooks/useSeriesDetail';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SeriesClassStanding, SeriesDetail, SeriesScoreMode, SeriesStandingRow, SeriesSubCompetition } from '@/src/types/eventorSeries';

// 'points' and 'table' both use the points data; 'time' loads the chase-start data.
type SeriesViewMode = 'points' | 'time' | 'table';

export default function SeriesDetailScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const seriesId = typeof params.id === 'string' ? params.id : '';
  const fallbackName = typeof params.name === 'string' ? params.name : 'Serie';

  const [viewMode, setViewMode] = React.useState<SeriesViewMode>('points');
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const scoreMode: SeriesScoreMode = viewMode === 'time' ? 'time' : 'points';
  const { detail, error, isLoading, reload } = useSeriesDetail(seriesId || null, scoreMode);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await reload(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [reload]);

  const goBack = () => router.navigate('/serier');
  const title = detail?.name ?? fallbackName;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void handleRefresh()} refreshing={isRefreshing} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[colors.heroTop, colors.heroBottom]} style={styles.hero}>
          <Pressable onPress={goBack} style={styles.heroBack}>
            <Ionicons color={colors.heroText} name="chevron-back" size={18} />
            <Text style={styles.heroBackLabel}>Serier</Text>
          </Pressable>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{title}</Text>
            {detail?.statusText ? (
              <View style={[styles.heroBadge, detail.isComplete ? styles.heroBadgeComplete : null]}>
                <Ionicons
                  color={detail.isComplete ? colors.buttonText : colors.heroText}
                  name={detail.isComplete ? 'trophy' : 'flag-outline'}
                  size={12}
                />
                <Text style={[styles.heroBadgeText, detail.isComplete ? styles.heroBadgeTextComplete : null]}>{detail.statusText}</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {isLoading && !detail ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Hämtar serien…</Text>
          </View>
        ) : error && !detail ? (
          <EmptyState description={error} title="Kunde inte hämta serien" />
        ) : detail ? (
          <SeriesBody
            colors={colors}
            detail={detail}
            onOpenEvent={(eventId, className) => void openPublishedListModal('results', 'public', eventId, null, null, setActiveListModal, className)}
            onSetViewMode={setViewMode}
            styles={styles}
            viewMode={viewMode}
          />
        ) : null}
      </ScrollView>

      <PublishedListModal onClose={() => setActiveListModal(null)} state={activeListModal} />
    </SafeAreaView>
  );
}

function SeriesBody({
  colors,
  detail,
  onOpenEvent,
  onSetViewMode,
  styles,
  viewMode,
}: {
  colors: ColorPalette;
  detail: SeriesDetail;
  onOpenEvent: (eventId: string, className?: string | null) => void;
  onSetViewMode: (mode: SeriesViewMode) => void;
  styles: ReturnType<typeof createStyles>;
  viewMode: SeriesViewMode;
}) {
  const [selectedClassName, setSelectedClassName] = React.useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(() => new Set());
  const [infoOpen, setInfoOpen] = React.useState(false);

  const activeClass = detail.classes.find((item) => item.className === selectedClassName) ?? detail.classes[0] ?? null;

  const columnEvents = React.useMemo<{ label: string; name: string }[]>(() => {
    if (!activeClass) {
      return [];
    }
    return activeClass.columns.map((column) => {
      const sub = findSubForColumn(column.label, detail.subCompetitions);
      return { label: column.label, name: sub?.name ?? eventNameFromTitle(column.title) };
    });
  }, [activeClass, detail.subCompetitions]);

  // Derive each runner's placement per deltävling from the series points: within
  // a column the highest points = 1st, next distinct value = 2nd, etc. (dense
  // rank). Avoids fetching huge result lists that froze the app.
  const columnRanks = React.useMemo<Map<number, number>[]>(() => {
    if (!activeClass) {
      return [];
    }
    return activeClass.columns.map((_column, index) => {
      const values = new Set<number>();
      for (const row of activeClass.rows) {
        const score = parseScore(row.scores[index]);
        if (score !== null) {
          values.add(score);
        }
      }
      const ranks = new Map<number, number>();
      [...values].sort((a, b) => b - a).forEach((value, position) => ranks.set(value, position + 1));
      return ranks;
    });
  }, [activeClass]);

  const toggleRow = React.useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return (
    <>
      {detail.info ? (
        <View style={styles.panel}>
          <Pressable onPress={() => setInfoOpen((open) => !open)} style={styles.panelHeader}>
            <Ionicons color={colors.primary} name="information-circle-outline" size={16} />
            <Text style={styles.panelTitle}>Information</Text>
            <Ionicons color={colors.textMuted} name={infoOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          </Pressable>
          {infoOpen ? <Text style={styles.infoText}>{detail.info}</Text> : null}
        </View>
      ) : null}

      <View style={styles.segment}>
        <SegmentButton active={viewMode === 'points'} icon="trophy-outline" label="Totalpoäng" onPress={() => onSetViewMode('points')} styles={styles} />
        {detail.chaseStartAvailable ? (
          <SegmentButton active={viewMode === 'time'} icon="stopwatch-outline" label="Jaktstart" onPress={() => onSetViewMode('time')} styles={styles} />
        ) : null}
        <SegmentButton active={viewMode === 'table'} icon="grid-outline" label="Tabellvy" onPress={() => onSetViewMode('table')} styles={styles} />
      </View>

      {detail.classes.length === 0 ? (
        <EmptyState description="Inga resultat har publicerats för den här serien ännu." title="Inga resultat" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.classRow} horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            {detail.classes.map((item) => {
              const active = item.className === activeClass?.className;
              return (
                <Pressable
                  key={item.className}
                  onPress={() => setSelectedClassName(item.className)}
                  style={[styles.classChip, active ? styles.classChipActive : null]}
                >
                  <Text style={[styles.classChipText, active ? styles.classChipTextActive : null]}>{item.className}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {activeClass ? (
            viewMode === 'table' ? (
              <ClassTable classStanding={activeClass} colors={colors} styles={styles} />
            ) : (
              <>
                {viewMode === 'points' && detail.isComplete ? <Podium colors={colors} rows={activeClass.rows} styles={styles} /> : null}
                <View style={styles.list}>
                  {activeClass.rows.map((row, index) => {
                    const key = `${activeClass.className}-${index}`;
                    return (
                      <StandingRow
                        colors={colors}
                        columnEvents={columnEvents}
                        columnRanks={columnRanks}
                        expanded={expandedKeys.has(key)}
                        key={key}
                        mode={viewMode}
                        onToggle={() => toggleRow(key)}
                        row={row}
                        styles={styles}
                      />
                    );
                  })}
                </View>
              </>
            )
          ) : null}
        </>
      )}

      {detail.subCompetitions.length > 0 ? (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>Deltävlingar</Text>
            <View style={styles.groupHeaderLine} />
          </View>
          <View style={styles.list}>
            {detail.subCompetitions.map((sub, index) => (
              <SubCompetitionRow
                colors={colors}
                key={`${sub.name}-${index}`}
                onOpen={sub.eventId ? () => onOpenEvent(sub.eventId as string, activeClass?.className ?? null) : undefined}
                styles={styles}
                sub={sub}
              />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function SegmentButton({
  active,
  icon,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}>
      <Ionicons color={active ? styles.segmentTextActive.color : styles.segmentText.color} name={icon} size={14} />
      <Text numberOfLines={1} style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function eventNameFromTitle(title: string): string {
  return (title.split(',')[0] ?? '').trim();
}

function Podium({
  colors,
  rows,
  styles,
}: {
  colors: ColorPalette;
  rows: SeriesStandingRow[];
  styles: ReturnType<typeof createStyles>;
}) {
  const top = rows.slice(0, 3);
  if (top.length === 0) {
    return null;
  }
  const [first, second, third] = top;

  return (
    <View style={styles.podiumCard}>
      <View style={styles.podiumHeader}>
        <Ionicons color={colors.primary} name="trophy" size={14} />
        <Text style={styles.podiumHeaderText}>Prispall</Text>
      </View>
      <View style={styles.podium}>
        {second ? <PodiumSpot rank={2} row={second} styles={styles} /> : <View style={styles.podiumSpot} />}
        {first ? <PodiumSpot rank={1} row={first} styles={styles} /> : <View style={styles.podiumSpot} />}
        {third ? <PodiumSpot rank={3} row={third} styles={styles} /> : <View style={styles.podiumSpot} />}
      </View>
    </View>
  );
}

function PodiumSpot({
  rank,
  row,
  styles,
}: {
  rank: 1 | 2 | 3;
  row: SeriesStandingRow;
  styles: ReturnType<typeof createStyles>;
}) {
  const medalStyle = rank === 1 ? styles.podiumMedalGold : rank === 2 ? styles.podiumMedalSilver : styles.podiumMedalBronze;
  const barStyle = rank === 1 ? styles.podiumBarFirst : rank === 2 ? styles.podiumBarSecond : styles.podiumBarThird;

  return (
    <View style={styles.podiumSpot}>
      <View style={[styles.podiumMedal, medalStyle]}>
        {rank === 1 ? <Ionicons color="#5B4A00" name="trophy" size={15} /> : <Text style={styles.podiumMedalText}>{rank}</Text>}
      </View>
      <Text numberOfLines={1} style={styles.podiumName}>
        {row.name}
      </Text>
      {row.club ? (
        <Text numberOfLines={1} style={styles.podiumClub}>
          {row.club}
        </Text>
      ) : null}
      <View style={[styles.podiumBar, barStyle]}>
        <Text style={styles.podiumBarPlace}>{row.place || String(rank)}</Text>
        <Text numberOfLines={1} style={styles.podiumBarPoints}>
          {row.total || '–'}
        </Text>
      </View>
    </View>
  );
}

// Converts a standings column label "D/M" to a comparable month*100+day number.
function columnLabelToMonthDay(label: string): number | null {
  const match = label.match(/(\d{1,2})\/(\d{1,2})/);
  return match ? Number(match[2]) * 100 + Number(match[1]) : null;
}

// A sub-competition's date can be a single day or a range; returns [start, end]
// as month*100+day numbers.
function subDateRange(date: string): [number, number] | null {
  const iso = date.match(/\d{4}-\d{2}-\d{2}/g);
  if (!iso || iso.length === 0) {
    return null;
  }
  const nums = iso.map((value) => Number(value.slice(5, 7)) * 100 + Number(value.slice(8, 10)));
  return [Math.min(...nums), Math.max(...nums)];
}

function findSubForColumn(label: string, subs: SeriesSubCompetition[]): SeriesSubCompetition | undefined {
  const target = columnLabelToMonthDay(label);
  if (target === null) {
    return undefined;
  }
  return subs.find((sub) => {
    const range = subDateRange(sub.date);
    return range ? target >= range[0] && target <= range[1] : false;
  });
}

function parseScore(raw?: string): number | null {
  if (!raw) {
    return null;
  }
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// True when the sub-competition's (start) date is in the future — not yet held.
function isSubUpcoming(date: string): boolean {
  const iso = date.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] > new Date().toLocaleDateString('sv-SE') : false;
}

function StandingRow({
  colors,
  columnEvents,
  columnRanks,
  expanded,
  mode,
  onToggle,
  row,
  styles,
}: {
  colors: ColorPalette;
  columnEvents: { label: string; name: string }[];
  columnRanks: Map<number, number>[];
  expanded: boolean;
  mode: SeriesScoreMode;
  onToggle: () => void;
  row: SeriesStandingRow;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.standingRow, pressed ? styles.cardPressed : null]}>
      <View style={styles.standingHeader}>
        <Text style={styles.placeText}>{row.place || '–'}</Text>
        <View style={styles.nameClubWrap}>
          <Text numberOfLines={1} style={styles.standingName}>
            {row.name}
          </Text>
          {row.club ? (
            <Text numberOfLines={1} style={styles.standingClub}>
              {row.club}
            </Text>
          ) : null}
        </View>
        <View style={styles.totalWrap}>
          <Ionicons color={colors.primary} name={mode === 'time' ? 'stopwatch-outline' : 'trophy-outline'} size={12} />
          <Text style={styles.totalText}>{row.total || '–'}</Text>
        </View>
        <Ionicons color={colors.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
      </View>

      {expanded ? (
        <View style={styles.breakdown}>
          {columnEvents.map((column, index) => {
            const score = parseScore(row.scores[index]);
            const place = score !== null ? columnRanks[index]?.get(score) : undefined;
            return (
              <View key={`${column.label}-${index}`} style={styles.breakdownRow}>
                <Text style={styles.breakdownDate}>{column.label || '—'}</Text>
                <Text numberOfLines={1} style={styles.breakdownEvent}>
                  {column.name}
                </Text>
                {place ? (
                  <View style={styles.breakdownPlace}>
                    <Text style={styles.breakdownPlaceText}>{place}</Text>
                  </View>
                ) : null}
                <Text style={styles.breakdownValue}>{row.scores[index] || '–'}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

// A wide results grid with a frozen header row and a frozen name+club column.
// The name column starts at 60% of the screen and shrinks as the score columns
// are scrolled in; the header scroll is kept in sync with the body.
function ClassTable({
  classStanding,
  styles,
}: {
  classStanding: SeriesClassStanding;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const window = Dimensions.get('window');
  const maxNameWidth = Math.round(window.width * 0.6);
  const minNameWidth = Math.round(window.width * 0.34);
  const bodyMaxHeight = Math.round(window.height * 0.58);
  const scrollX = React.useRef(new Animated.Value(0)).current;
  const headerScrollRef = React.useRef<ScrollView>(null);
  const nameWidth = scrollX.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, maxNameWidth - minNameWidth],
    outputRange: [maxNameWidth, minNameWidth],
  });

  const onBodyScroll = React.useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          headerScrollRef.current?.scrollTo({ animated: false, x: event.nativeEvent.contentOffset.x });
        },
        useNativeDriver: false,
      }),
    [scrollX],
  );

  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Animated.View style={[styles.tableCell, styles.tableHeadCell, styles.tableNameCell, { width: nameWidth }]}>
          <Text style={styles.tableHeadText}>Namn</Text>
        </Animated.View>
        <ScrollView horizontal ref={headerScrollRef} scrollEnabled={false} showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
          <View style={styles.tableHeadRow}>
            {classStanding.columns.map((column, index) => (
              <View key={`${column.label}-${index}`} style={[styles.tableCell, styles.tableHeadCell, styles.tableScoreCell]}>
                <Text style={styles.tableHeadText}>{column.label}</Text>
              </View>
            ))}
            <View style={[styles.tableCell, styles.tableHeadCell, styles.tableTotalCell]}>
              <Text style={styles.tableHeadText}>Tot</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: bodyMaxHeight }}>
        <View style={styles.tableBodyRow}>
          <Animated.View style={[styles.tableNameCol, { width: nameWidth }]}>
            {classStanding.rows.map((row, index) => (
              <View key={`${row.name}-${index}`} style={[styles.tableCell, styles.tableNameCell, index % 2 === 1 ? styles.tableRowAlt : null]}>
                <Text numberOfLines={1} style={styles.tableName}>
                  {row.place ? `${row.place}. ` : ''}
                  {row.name}
                  {row.club ? <Text style={styles.tableClubInline}>{`  ·  ${row.club}`}</Text> : null}
                </Text>
              </View>
            ))}
          </Animated.View>

          <ScrollView horizontal onScroll={onBodyScroll} scrollEventThrottle={16} showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View>
              {classStanding.rows.map((row, rowIndex) => (
                <View key={`${row.name}-${rowIndex}`} style={[styles.tableRow, rowIndex % 2 === 1 ? styles.tableRowAlt : null]}>
                  {classStanding.columns.map((column, index) => (
                    <View key={`${column.label}-${index}`} style={[styles.tableCell, styles.tableScoreCell]}>
                      <Text style={styles.tableScore}>{row.scores[index] || '–'}</Text>
                    </View>
                  ))}
                  <View style={[styles.tableCell, styles.tableTotalCell]}>
                    <Text style={styles.tableTotal}>{row.total || '–'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function SubCompetitionRow({
  colors,
  onOpen,
  styles,
  sub,
}: {
  colors: ColorPalette;
  onOpen?: () => void;
  styles: ReturnType<typeof createStyles>;
  sub: SeriesSubCompetition;
}) {
  const upcoming = isSubUpcoming(sub.date);
  const pressable = Boolean(onOpen) && !upcoming;

  return (
    <Pressable
      disabled={!pressable}
      onPress={pressable ? onOpen : undefined}
      style={({ pressed }) => [styles.subRow, upcoming ? styles.subRowUpcoming : null, pressed && pressable ? styles.cardPressed : null]}
    >
      <View style={[styles.subBar, { backgroundColor: upcoming ? '#8A8A8A' : '#3E9B57' }]} />
      <View style={styles.subBody}>
        <Text numberOfLines={1} style={styles.subName}>
          {sub.name}
        </Text>
        <View style={styles.subMetaRow}>
          <View style={styles.cardMetaItem}>
            <Ionicons color={colors.primary} name="calendar-outline" size={12} />
            <Text style={styles.subMetaText}>{sub.date}</Text>
          </View>
          {sub.discipline ? (
            <View style={styles.cardMetaItem}>
              <Ionicons color={colors.primary} name="map-outline" size={12} />
              <Text style={styles.subMetaText}>{sub.discipline}</Text>
            </View>
          ) : null}
        </View>
        {sub.organiser ? (
          <Text numberOfLines={1} style={styles.subOrganiser}>
            {sub.organiser}
          </Text>
        ) : null}
      </View>
      {pressable ? <Ionicons color={colors.textMuted} name="chevron-forward" size={16} /> : null}
    </Pressable>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    breakdown: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: 3,
      marginTop: 6,
      paddingTop: 6,
    },
    breakdownDate: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      width: 36,
    },
    breakdownEvent: {
      ...typography.caption,
      color: colors.textSecondary,
      flex: 1,
      fontSize: 11,
    },
    breakdownPlace: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 6,
      minWidth: 22,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    breakdownPlaceText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 10,
      textAlign: 'center',
    },
    breakdownRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    breakdownValue: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      fontSize: 11,
      minWidth: 26,
      textAlign: 'right',
    },
    cardMetaItem: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    cardPressed: {
      opacity: 0.85,
    },
    classChip: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    classChipActive: {
      backgroundColor: colors.primary,
    },
    classChipText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 12,
    },
    classChipTextActive: {
      color: isDark ? colors.background : '#fff',
    },
    classRow: {
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    classScroll: {
      flexGrow: 0,
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    group: {
      gap: spacing.sm,
    },
    groupHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    groupHeaderLine: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1,
    },
    groupHeaderText: {
      ...typography.captionStrong,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    hero: {
      borderRadius: 26,
      gap: spacing.md,
      overflow: 'hidden',
      padding: spacing.lg,
    },
    heroBack: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    heroBackLabel: {
      ...typography.captionStrong,
      color: colors.heroText,
    },
    heroBody: {
      gap: 6,
    },
    heroBadge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    heroBadgeText: {
      ...typography.captionStrong,
      color: colors.heroText,
      fontSize: 12,
    },
    heroBadgeComplete: {
      backgroundColor: colors.accent,
    },
    heroBadgeTextComplete: {
      color: colors.buttonText,
    },
    podiumCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md,
    },
    podiumHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    podiumHeaderText: {
      ...typography.captionStrong,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    podium: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      paddingTop: spacing.xs,
    },
    podiumSpot: {
      alignItems: 'center',
      flex: 1,
      gap: 3,
    },
    podiumMedal: {
      alignItems: 'center',
      borderRadius: 999,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    podiumMedalGold: {
      backgroundColor: '#F2CB45',
    },
    podiumMedalSilver: {
      backgroundColor: '#C7CDD6',
    },
    podiumMedalBronze: {
      backgroundColor: '#D08B4E',
    },
    podiumMedalText: {
      color: '#2A2A2A',
      fontSize: 15,
      fontWeight: '800',
    },
    podiumName: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      fontSize: 12,
      textAlign: 'center',
    },
    podiumClub: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      textAlign: 'center',
    },
    podiumBar: {
      alignItems: 'center',
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      gap: 1,
      justifyContent: 'center',
      marginTop: 2,
      width: '100%',
    },
    podiumBarFirst: {
      backgroundColor: '#F7E08A',
      height: 68,
    },
    podiumBarSecond: {
      backgroundColor: '#DDE1E8',
      height: 50,
    },
    podiumBarThird: {
      backgroundColor: '#E7C29B',
      height: 38,
    },
    podiumBarPlace: {
      color: '#2A2A2A',
      fontSize: 20,
      fontWeight: '800',
    },
    podiumBarPoints: {
      color: '#3A3A3A',
      fontSize: 11,
      fontWeight: '600',
    },
    heroTitle: {
      color: colors.heroText,
      fontFamily: typography.heroTitle.fontFamily,
      fontSize: 20,
      lineHeight: 25,
    },
    infoText: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    panelHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    panelTitle: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    list: {
      // White cards on a light background read as more spaced than dark cards on
      // a dark background, so tighten the light-theme gap to match dark visually.
      gap: isDark ? spacing.xs : 3,
    },
    loadingBox: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    loadingText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    placeText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 13,
      minWidth: 20,
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    segment: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
    segmentButton: {
      alignItems: 'center',
      borderRadius: 9,
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
    },
    segmentButtonActive: {
      backgroundColor: colors.surface,
    },
    segmentText: {
      ...typography.captionStrong,
      color: colors.textMuted,
    },
    segmentTextActive: {
      color: colors.primary,
    },
    standingClub: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 4,
      fontSize: 12,
    },
    standingHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    standingName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flexShrink: 1,
      fontSize: 13,
    },
    standingRow: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    nameClubWrap: {
      alignItems: 'baseline',
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      minWidth: 0,
    },
    subBar: {
      alignSelf: 'stretch',
      borderRadius: 999,
      width: 4,
    },
    subBody: {
      flex: 1,
      gap: 2,
    },
    subMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    subMetaText: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    subName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
    },
    subOrganiser: {
      ...typography.caption,
      color: colors.textMuted,
    },
    subRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    subRowUpcoming: {
      opacity: 0.5,
    },
    table: {
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      overflow: 'hidden',
    },
    tableBodyRow: {
      flexDirection: 'row',
    },
    tableCell: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      height: 36,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    tableClubInline: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '400',
    },
    tableHeadCell: {
      backgroundColor: colors.surfaceMuted,
    },
    tableHeaderRow: {
      flexDirection: 'row',
    },
    tableHeadRow: {
      flexDirection: 'row',
    },
    tableHeadText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 11,
    },
    tableName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 12,
    },
    tableNameCell: {
      alignItems: 'flex-start',
      borderRightColor: colors.border,
      borderRightWidth: 1,
    },
    tableNameCol: {
      backgroundColor: colors.surface,
    },
    tableRow: {
      flexDirection: 'row',
    },
    tableRowAlt: {
      backgroundColor: colors.surfaceMuted,
    },
    tableScore: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 12,
    },
    tableScoreCell: {
      alignItems: 'center',
      width: 52,
    },
    tableScroll: {
      flex: 1,
    },
    tableTotal: {
      ...typography.bodyStrong,
      color: colors.primary,
      fontSize: 13,
    },
    tableTotalCell: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      width: 58,
    },
    totalText: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    totalWrap: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 3,
    },
  });
}
