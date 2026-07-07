import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchEventSplitTimesXml, fetchEventorEventById } from '@/src/api/eventorApi';
import { LoadingState } from '@/src/components/LoadingState';
import { buildEventAnalysis, buildHeadToHead, EventAnalysisHeadToHead } from '@/src/services/eventAnalysis';
import { parseEventSplitTimesXml } from '@/src/services/eventSplitTimesParser';
import { getClassificationTone } from '@/src/theme/colors';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventSplitTimesSection } from '@/src/types/eventSplitTimes';

export type AnalysisModalState = {
  emptyMessage: string;
  error: string | null;
  eventId: string;
  eventSubtitle?: string | null;
  initialClassLabel?: string | null;
  initialPersonId?: string | null;
  isLoading: boolean;
  sections: EventSplitTimesSection[];
  title: string;
};

export function AnalysisModal({ onClose, state }: { onClose: () => void; state: AnalysisModalState | null }) {
  const { colors, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const currentState = state;
  const [legTab, setLegTab] = React.useState<'splits' | 'h2h'>('splits');
  const [h2hOpponentId, setH2hOpponentId] = React.useState<string | null>(null);
  const [h2hPickerExpanded, setH2hPickerExpanded] = React.useState(false);
  const [thirdInfoVisible, setThirdInfoVisible] = React.useState(false);
  const [legInfoVisible, setLegInfoVisible] = React.useState(false);

  const selectedSection = React.useMemo(
    () => currentState?.sections.find((section) => section.classLabel === currentState?.initialClassLabel) ?? currentState?.sections[0] ?? null,
    [currentState?.initialClassLabel, currentState?.sections],
  );

  const analysis = React.useMemo(
    () => (selectedSection ? buildEventAnalysis(selectedSection, currentState?.initialPersonId ?? null) : null),
    [currentState?.initialPersonId, selectedSection],
  );

  const h2hData = React.useMemo<EventAnalysisHeadToHead | null>(() => {
    if (!selectedSection || !analysis?.targetPersonId || !h2hOpponentId) return null;
    return buildHeadToHead(selectedSection, analysis.targetPersonId, h2hOpponentId);
  }, [selectedSection, analysis?.targetPersonId, h2hOpponentId]);

  const h2hCandidates = React.useMemo(() => {
    if (!selectedSection || !analysis?.targetPersonId) return [];
    const winnerTime = selectedSection.rows.find((r) => r.position === '1')?.totalTimeSeconds ?? null;
    return selectedSection.rows
      .filter((row) => row.personId !== analysis.targetPersonId && row.status === 'OK' && row.personId)
      .map((row) => {
        const diffSeconds = row.totalTimeSeconds != null && winnerTime != null ? row.totalTimeSeconds - winnerTime : null;
        const diffLabel = diffSeconds != null && diffSeconds > 0 ? `+${formatSecondsToTime(diffSeconds)}` : diffSeconds === 0 ? '±0' : null;
        return {
          personId: row.personId!,
          label: row.primary ?? row.personId!,
          organisation: row.organisation,
          position: row.position ?? '-',
          timeLabel: row.totalTimeLabel ?? '-',
          diffLabel,
        };
      });
  }, [selectedSection, analysis?.targetPersonId]);

  React.useEffect(() => {
    setLegTab('splits');
    setH2hOpponentId(null);
    setH2hPickerExpanded(false);
  }, [currentState?.eventId, currentState?.initialPersonId]);

  if (!currentState) {
    return null;
  }

  return (
    <Modal animationType="slide" transparent visible>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text numberOfLines={2} style={styles.modalTitle}>
              {currentState.title}
            </Text>
            <Pressable onPress={onClose} style={styles.modalCloseChip}>
              <Ionicons color={colors.primaryDeep} name="close" size={14} />
              <Text style={styles.modalCloseText}>Stäng</Text>
            </Pressable>
          </View>

          {currentState.isLoading ? <LoadingState label="Hämtar analys..." fullScreen /> : null}
          {!currentState.isLoading && currentState.error ? <Text style={styles.errorText}>{currentState.error}</Text> : null}
          {!currentState.isLoading && !currentState.error && currentState.sections.length === 0 ? <Text style={styles.helperText}>{currentState.emptyMessage}</Text> : null}

          {!currentState.isLoading && !currentState.error && analysis ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <LinearGradient colors={getClassificationTone(selectedSection?.classificationId ?? 0, themeName).detailGradient} style={styles.hero}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTitleWrap}>
                    <Text numberOfLines={1} style={styles.heroEyebrow}>
                      Analys
                    </Text>
                    <Text numberOfLines={2} style={styles.heroTitle}>
                      {analysis.summary.runnerName}
                    </Text>
                    {currentState.eventSubtitle ? (
                      <Text numberOfLines={2} style={styles.heroSubtitle}>
                        {currentState.eventSubtitle}
                      </Text>
                    ) : null}
                    <Text numberOfLines={1} style={styles.heroSubtitle}>
                      {analysis.classLabel}
                      {analysis.summary.classLengthLabel ? ` • ${analysis.summary.classLengthLabel}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.heroMetricsRow}>
                  {analysis.summary.statusLabel === 'OK' ? (
                    <>
                      <HeroPill icon="time-outline" label="Tid" value={analysis.summary.totalTimeLabel ?? '-'} />
                      <HeroPill icon="trending-up-outline" label="Diff" value={analysis.summary.totalDiffLabel ?? '-'} />
                      <HeroPill icon="ribbon-outline" label="Plac." value={analysis.summary.placingLabel} />
                    </>
                  ) : (
                    <>
                      <View style={styles.heroMetricSpacer} />
                      <HeroStatusChip label={analysis.summary.statusLabel} />
                      <View style={styles.heroMetricSpacer} />
                    </>
                  )}
                </View>
              </LinearGradient>

              <View style={styles.metricGroup}>
                <MetricSection title="Resultat" icon="medal-outline">
                  <MetricLine
                    label="Placering"
                    value={`${analysis.summary.placingLabel} av ${analysis.classEntriesCount !== null ? analysis.classEntriesCount : '-'}`}
                  />
                  <MetricLine label="Sträcksegrar" value={analysis.summary.legWinCountLabel} />
                  <MetricLine label="Sträckpallplatser" value={analysis.summary.legPodiumCountLabel} />
                  <MetricLine label="Antal sträckor" value={`${analysis.legCount}`} />
                  <MetricLine label="Banlängd" value={analysis.summary.courseLengthLabel ?? '-'} />
                  <MetricLine label="Km-tid" value={analysis.summary.pacePerKmLabel} />
                  <MetricLine label="Segrare" value={analysis.summary.winnerName ?? '-'} />
                  <MetricLine label="Segrartid" value={analysis.summary.winnerTimeLabel ?? '-'} />
                </MetricSection>

                <MetricSection title="Bom & form" icon="pulse-outline">
                  <MetricLine label="Bomtid" value={analysis.summary.timeLossLabel ?? '-'} />
                  <MetricLine label="Bomfri tid" value={analysis.summary.timeWithoutLossLabel ?? '-'} />
                  <MetricLine label="Andel bommade sträckor" value={analysis.summary.bomMadeSplitShareLabel} />
                  <MetricLine label="Bomfri placering" value={analysis.summary.adjustedTotalPlaceWithoutLoss !== null ? `${analysis.summary.adjustedTotalPlaceWithoutLoss}` : '-'} />
                  <MetricLine label="Plac. om alla bomfria" value={analysis.summary.adjustedTotalPlaceIfAllAvoidLoss !== null ? `${analysis.summary.adjustedTotalPlaceIfAllAvoidLoss}` : '-'} />
                  <MetricLine label="Km-tid bomfri" value={analysis.summary.pacePerKmWithoutLossLabel} />
                </MetricSection>

                <MetricSection title="Bana" icon="map-outline">
                  <MetricLine label="Referens" value={analysis.summary.referencePercentLabel} />
                  <MetricLine label="Idealtid" value={analysis.summary.optimalRaceTimeLabel ?? '-'} />
                  <MetricLine label="Tid efter idealtid" value={analysis.summary.optimalRaceTimeDeltaLabel ?? '-'} />
                </MetricSection>
              </View>

              <View style={styles.thirdCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <Text style={styles.sectionHeaderTitle}>Banan i tre delar</Text>
                    <Pressable hitSlop={8} onPress={() => setThirdInfoVisible(true)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
                      <Ionicons color={colors.primary} name="information-circle-outline" size={18} />
                    </Pressable>
                  </View>
                  <Ionicons color={colors.primary} name="analytics-outline" size={18} />
                </View>
                {analysis.summary.thirdProgress.map((third) => (
                  <View key={third.controls} style={styles.thirdRow}>
                    <View style={styles.thirdLabelWrap}>
                      <Text style={styles.thirdLabel}>{third.controls}</Text>
                      <Text style={styles.thirdDescription}>{third.description}</Text>
                    </View>
                    <View style={styles.thirdBarTrack}>
                      <View
                        style={[
                          styles.thirdBarFill,
                          third.percent !== null && third.percent > 5 ? styles.thirdBarFillLoss : styles.thirdBarFillGood,
                          { width: `${Math.min(100, Math.max(12, Math.abs(third.percent ?? 0)))}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.thirdPercent, third.percent !== null && third.percent > 5 ? styles.thirdPercentLoss : styles.thirdPercentGood]}>
                      {third.percent === null ? '-' : `${third.percent > 0 ? '+' : ''}${third.percent}%`}
                    </Text>
                  </View>
                ))}
              </View>

              <Modal animationType="fade" onRequestClose={() => setThirdInfoVisible(false)} transparent visible={thirdInfoVisible}>
                <View style={styles.infoOverlay}>
                  <Pressable style={styles.infoBackdrop} onPress={() => setThirdInfoVisible(false)} />
                  <View style={styles.infoCard}>
                    <View style={styles.infoCardHeader}>
                      <View style={styles.infoHeaderLeft}>
                        <LinearGradient colors={[colors.heroTop, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.infoIconBadge}>
                          <Ionicons color="#fff" name="analytics-outline" size={20} />
                        </LinearGradient>
                        <Text style={styles.infoCardTitle}>Banan i tre delar</Text>
                      </View>
                      <Pressable hitSlop={8} onPress={() => setThirdInfoVisible(false)} style={styles.infoCloseChip}>
                        <Ionicons color={colors.primaryDeep} name="close" size={16} />
                      </Pressable>
                    </View>

                    <Text style={styles.infoCardBody}>
                      Banan delas in i tre tidsmässigt lika stora delar. Indelningen görs efter förväntad tid, inte efter sträckans längd:
                    </Text>

                    <View style={styles.infoList}>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="rocket-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Början</Text> – loppets första del</Text>
                      </View>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="flash-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Mitten</Text> – loppets mittdel</Text>
                      </View>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="flag-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Slutet</Text> – loppets sista del</Text>
                      </View>
                    </View>

                    <Text style={styles.infoCardBody}>
                      För varje del jämförs din tid med din förväntade tid, som bygger på fältets referensfart uppräknad till din egen nivå.
                    </Text>
                    <Text style={styles.infoCardBody}>Procenten visar avvikelsen:</Text>
                    <View style={styles.infoBadgeStack}>
                      <View style={[styles.infoPctBadge, { borderColor: colors.error }]}>
                        <Text style={[styles.infoPctBadgeSymbol, { color: colors.error }]}>+%</Text>
                        <Text style={styles.infoPctBadgeText}>Långsammare än förväntat</Text>
                      </View>
                      <View style={[styles.infoPctBadge, { borderColor: colors.primary }]}>
                        <Text style={[styles.infoPctBadgeSymbol, { color: colors.primary }]}>−%</Text>
                        <Text style={styles.infoPctBadgeText}>Snabbare än förväntat</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* === BANAN STRÄCKINDELAD === */}
              {analysis.legCategories.length > 0 ? (
                <View style={styles.thirdCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionHeaderTitleWrap}>
                      <Text style={styles.sectionHeaderTitle}>Sträcklängdsanalys</Text>
                      <Pressable hitSlop={8} onPress={() => setLegInfoVisible(true)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
                        <Ionicons color={colors.primary} name="information-circle-outline" size={18} />
                      </Pressable>
                    </View>
                    <Ionicons color={colors.primary} name="bar-chart-outline" size={18} />
                  </View>
                  {analysis.legCategories.map((cat) => (
                    <View key={cat.categoryLabel} style={styles.thirdRow}>
                      <View style={styles.thirdLabelWrap}>
                        <Text style={styles.thirdLabel}>{cat.categoryLabel}</Text>
                        <Text style={styles.thirdDescription}>{cat.description} ({cat.legCount} str.)</Text>
                      </View>
                      <View style={styles.thirdBarTrack}>
                        <View
                          style={[
                            styles.thirdBarFill,
                            cat.relativePercent > 5 ? styles.thirdBarFillLoss : styles.thirdBarFillGood,
                            { width: `${Math.min(100, Math.max(12, Math.abs(cat.relativePercent) + 10))}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.thirdPercent, cat.relativePercent > 5 ? styles.thirdPercentLoss : styles.thirdPercentGood]}>
                        {cat.relativePercent > 0 ? '+' : ''}{cat.relativePercent}%
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Modal animationType="fade" onRequestClose={() => setLegInfoVisible(false)} transparent visible={legInfoVisible}>
                <View style={styles.infoOverlay}>
                  <Pressable style={styles.infoBackdrop} onPress={() => setLegInfoVisible(false)} />
                  <View style={styles.infoCard}>
                    <View style={styles.infoCardHeader}>
                      <View style={styles.infoHeaderLeft}>
                        <LinearGradient colors={[colors.heroTop, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.infoIconBadge}>
                          <Ionicons color="#fff" name="bar-chart-outline" size={20} />
                        </LinearGradient>
                        <Text style={styles.infoCardTitle}>Sträcklängdsanalys</Text>
                      </View>
                      <Pressable hitSlop={8} onPress={() => setLegInfoVisible(false)} style={styles.infoCloseChip}>
                        <Ionicons color={colors.primaryDeep} name="close" size={16} />
                      </Pressable>
                    </View>

                    <Text style={styles.infoCardBody}>
                      Sträckorna grupperas efter längd – utifrån segrartiden på varje sträcka:
                    </Text>

                    <View style={styles.infoList}>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="flash-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Kort str.</Text> &lt; 1.20 min</Text>
                      </View>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="pulse-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Medel str.</Text> 1:20 – 3:30 min</Text>
                      </View>
                      <View style={styles.infoListItem}>
                        <View style={styles.infoListIcon}><Ionicons color={colors.primaryDeep} name="trending-up-outline" size={15} /></View>
                        <Text style={styles.infoListText}><Text style={styles.infoListStrong}>Lång str.</Text> &gt; 3:30 min</Text>
                      </View>
                    </View>

                    <Text style={styles.infoCardBody}>
                      För varje grupp jämförs din fart med din förväntade fart, som bygger på fältets bästa löpare uppräknad till din egen nivå.
                    </Text>

                    <Text style={styles.infoCardBody}>Procenten visar avvikelsen:</Text>
                    <View style={styles.infoBadgeStack}>
                      <View style={[styles.infoPctBadge, { borderColor: colors.error }]}>
                        <Text style={[styles.infoPctBadgeSymbol, { color: colors.error }]}>+%</Text>
                        <Text style={styles.infoPctBadgeText}>Långsammare än förväntat</Text>
                      </View>
                      <View style={[styles.infoPctBadge, { borderColor: colors.primary }]}>
                        <Text style={[styles.infoPctBadgeSymbol, { color: colors.primary }]}>−%</Text>
                        <Text style={styles.infoPctBadgeText}>Snabbare än förväntat</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* === STRÄCKA FÖR STRÄCKA / HEAD-TO-HEAD TABS === */}
              <View style={styles.tableCard}>
                <View style={styles.tabRow}>
                  <Pressable onPress={() => setLegTab('splits')} style={[styles.tab, legTab === 'splits' ? styles.tabActive : null]}>
                    <Text style={[styles.tabText, legTab === 'splits' ? styles.tabTextActive : null]}>Sträcka för sträcka</Text>
                  </Pressable>
                  <Pressable onPress={() => setLegTab('h2h')} style={[styles.tab, legTab === 'h2h' ? styles.tabActive : null]}>
                    <Text style={[styles.tabText, legTab === 'h2h' ? styles.tabTextActive : null]}>Head-to-Head</Text>
                  </Pressable>
                </View>

                {legTab === 'splits' ? (
                  <>
                    <View style={styles.legHeaderRow}>
                      <Text style={[styles.legHeaderCell, styles.legHeaderNo]}>#</Text>
                      <Text style={[styles.legHeaderCell, styles.legHeaderMetric]}>Sträcka</Text>
                      <Text style={[styles.legHeaderCell, styles.legHeaderMetric]}>Totalt</Text>
                      <Text style={[styles.legHeaderCell, styles.legHeaderLoss]}>Bomtid</Text>
                    </View>

                    {analysis.rows.map((row) => (
                      <View key={row.legLabel} style={styles.legRow}>
                        <View style={[styles.legCell, styles.legCellNo]}>
                          <Text style={styles.legNo}>{row.legLabel}</Text>
                        </View>
                        <View style={[styles.legCell, styles.legCellMetric]}>
                          <Text style={[styles.legPrimary, getPlacementToneStyle(row.splitPlace, styles)]}>
                            {row.splitTimeLabel ?? '-'}
                            {row.splitPlace !== null ? ` (${row.splitPlace})` : ''}
                          </Text>
                          <Text style={styles.legSecondary}>
                            {row.splitDiffLabel ?? '-'}
                            {row.splitLossSeconds && row.splitLossSeconds > 0 ? <Text style={styles.lossDot}> ●</Text> : null}
                          </Text>
                        </View>
                        <View style={[styles.legCell, styles.legCellMetric]}>
                          <Text style={[styles.legPrimary, getPlacementToneStyle(row.totalPlace, styles)]}>
                            {row.totalTimeLabel ?? '-'}
                            {row.totalPlace !== null ? ` (${row.totalPlace})` : ''}
                          </Text>
                          <Text style={styles.legSecondary}>{row.totalDiffLabel ?? '-'}</Text>
                        </View>
                        <View style={[styles.legCell, styles.legCellLoss]}>
                          <Text style={[styles.legPrimary, row.estimatedTimeLossLabel ? styles.lossPrimary : null]}>{row.estimatedTimeLossLabel ?? '-'}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    {/* H2H opponent picker */}
                    <Pressable onPress={() => setH2hPickerExpanded(!h2hPickerExpanded)} style={styles.h2hPickerToggle}>
                      <Text style={styles.h2hPickerToggleText}>
                        {h2hOpponentId ? h2hCandidates.find((c) => c.personId === h2hOpponentId)?.label ?? 'Välj duellant' : 'Välj duellant'}
                      </Text>
                      <Ionicons color={colors.textSecondary} name={h2hPickerExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
                    </Pressable>
                    {h2hPickerExpanded ? (
                      <ScrollView style={styles.h2hPickerList} nestedScrollEnabled>
                        {h2hCandidates.map((candidate) => (
                          <Pressable
                            key={candidate.personId}
                            onPress={() => { setH2hOpponentId(candidate.personId); setH2hPickerExpanded(false); }}
                            style={[styles.h2hPickerItem, h2hOpponentId === candidate.personId ? styles.h2hPickerItemActive : null]}
                          >
                            <Text style={styles.h2hPickerPosition}>{candidate.position}</Text>
                            <View style={styles.h2hPickerNameWrap}>
                              <Text numberOfLines={1} style={styles.h2hPickerName}>{candidate.label}</Text>
                              <Text numberOfLines={1} style={styles.h2hPickerOrg}>{candidate.organisation}</Text>
                            </View>
                            <Text style={styles.h2hPickerTime}>{candidate.timeLabel}</Text>
                            <Text style={styles.h2hPickerDiff}>{candidate.diffLabel ?? ''}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}

                    {h2hData ? (
                      <>
                        <View style={styles.h2hSummaryRow}>
                          <View style={styles.h2hSummaryCell}>
                            <Text style={[styles.h2hSummaryValue, styles.h2hWin]}>{h2hData.targetWins}</Text>
                            <Text style={styles.h2hSummaryLabel}>{h2hData.targetName.split(' ')[0]}</Text>
                          </View>
                          <View style={styles.h2hSummaryCell}>
                            <Text style={styles.h2hSummaryValue}>{h2hData.draws}</Text>
                            <Text style={styles.h2hSummaryLabel}>Lika</Text>
                          </View>
                          <View style={styles.h2hSummaryCell}>
                            <Text style={[styles.h2hSummaryValue, styles.h2hLoss]}>{h2hData.opponentWins}</Text>
                            <Text style={styles.h2hSummaryLabel}>{h2hData.opponentName.split(' ')[0]}</Text>
                          </View>
                        </View>

                        <View style={styles.h2hHeaderRow}>
                          <Text style={[styles.h2hHeaderCell, styles.h2hCellNo]}>#</Text>
                          <Text style={[styles.h2hHeaderCell, styles.h2hCellTime]}>Du</Text>
                          <Text style={[styles.h2hHeaderCell, styles.h2hCellTime]}>Motståndare</Text>
                          <Text style={[styles.h2hHeaderCell, styles.h2hCellDiff, { textAlign: 'right' }]}>Diff</Text>
                        </View>

                        {h2hData.legs.map((leg) => (
                          <View
                            key={leg.legLabel}
                            style={[
                              styles.h2hRow,
                              leg.result === 'win' ? styles.h2hRowWin : leg.result === 'loss' ? styles.h2hRowLoss : leg.result === 'draw' ? styles.h2hRowDraw : null,
                            ]}
                          >
                            <View style={[styles.h2hCell, styles.h2hCellNo]}>
                              <Text style={styles.legNo}>{leg.legLabel}</Text>
                            </View>
                            <View style={[styles.h2hCell, styles.h2hCellTime]}>
                              <Text style={styles.legPrimary}>{leg.targetSplitLabel ?? '-'}</Text>
                              <Text style={styles.legSecondary}>{leg.targetTotalLabel ?? '-'}</Text>
                            </View>
                            <View style={[styles.h2hCell, styles.h2hCellTime]}>
                              <Text style={styles.legPrimary}>{leg.opponentSplitLabel ?? '-'}</Text>
                              <Text style={styles.legSecondary}>{leg.opponentTotalLabel ?? '-'}</Text>
                            </View>
                            <View style={[styles.h2hCell, styles.h2hCellDiff]}>
                              <Text style={[styles.legPrimary, leg.result === 'win' ? styles.h2hWin : leg.result === 'loss' ? styles.h2hLoss : null]}>
                                {leg.splitDiffLabel ?? '-'}
                              </Text>
                              <Text style={[styles.legSecondary, leg.result === 'win' ? styles.h2hWin : leg.result === 'loss' ? styles.h2hLoss : null]}>
                                {leg.totalDiffLabel ?? '-'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text style={styles.h2hPlaceholder}>Välj en duellant för att jämföra</Text>
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function HeroPill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.heroPill}>
      <Ionicons color={colors.heroText} name={icon} size={16} />
      <View style={styles.heroPillCopy}>
        <Text style={styles.heroPillLabel}>{label}</Text>
        <Text style={styles.heroPillValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function HeroStatusChip({ label }: { label: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.heroStatusChip}>
      <Ionicons color={colors.heroText} name="alert-circle" size={16} />
      <Text style={styles.heroStatusChipText}>{label}</Text>
    </View>
  );
}

function MetricSection({ title, icon, children }: { children: React.ReactNode; icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.metricSection}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.metricSectionTitleWrap}>
          <Ionicons color={colors.primaryDeep} name={icon} size={18} />
          <Text style={styles.metricSectionTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.metricLines}>{children}</View>
    </View>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.metricLine}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function formatSecondsToTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getPlacementToneStyle(place: number | null, styles: ReturnType<typeof createStyles>) {
  if (place === 1) {
    return styles.placementToneLeader;
  }

  if (place === 2 || place === 3) {
    return styles.placementTonePodium;
  }

  return null;
}

export async function openEventAnalysisModal(
  eventId: string,
  setState: React.Dispatch<React.SetStateAction<AnalysisModalState | null>>,
  initialClassLabel?: string | null,
  initialPersonId?: string | null,
  title = 'Analys',
) {
  const selectedEventRaceId = extractSelectedEventRaceId(eventId);
  setState({
    emptyMessage: 'Ingen analys hittades.',
    error: null,
    eventId,
    eventSubtitle: null,
    initialClassLabel: initialClassLabel ?? null,
    initialPersonId: initialPersonId ?? null,
    isLoading: true,
    sections: [],
    title,
  });

  try {
    const [rawXml, eventDetail] = await Promise.all([
      fetchEventSplitTimesXml(eventId, selectedEventRaceId),
      fetchEventorEventById(eventId, selectedEventRaceId).catch(() => null),
    ]);
    const sections = parseEventSplitTimesXml(rawXml, { selectedEventRaceId });

    setState({
      emptyMessage: 'Ingen analys hittades.',
      error: null,
      eventId,
      eventSubtitle: eventDetail ? `${eventDetail.name} • ${eventDetail.dateLabel}` : null,
      initialClassLabel: initialClassLabel ?? null,
      initialPersonId: initialPersonId ?? null,
      isLoading: false,
      sections,
      title,
    });
  } catch (loadError) {
    setState({
      emptyMessage: 'Ingen analys hittades.',
      error: loadError instanceof Error ? loadError.message : 'Det gick inte att hämta analysen.',
      eventId,
      eventSubtitle: null,
      initialClassLabel: initialClassLabel ?? null,
      initialPersonId: initialPersonId ?? null,
      isLoading: false,
      sections: [],
      title,
    });
  }
}

function extractSelectedEventRaceId(eventId: string) {
  const parts = eventId.split('::');
  return parts.length > 1 ? parts.slice(1).join('::') || null : null;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
    padding: spacing.lg,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
    padding: spacing.lg,
  },
  hero: {
    borderRadius: 26,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroMetricsRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroMetricSpacer: {
    flex: 1,
  },
  heroPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroPillCopy: {
    flexShrink: 1,
  },
  heroPillLabel: {
    color: colors.heroTextMuted,
    fontSize: 10,
    lineHeight: 12,
  },
  heroPillValue: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 14,
    lineHeight: 16,
  },
  heroStatusChip: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minWidth: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  heroStatusChipText: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 14,
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.heroTextMuted,
  },
  heroEventSubtitle: {
    ...typography.buttonSmall,
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 18,
  },
  heroTitle: {
    ...typography.sectionTitle,
    color: colors.heroText,
    fontSize: 23,
    lineHeight: 27,
  },
  heroTitleWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroTopRow: {
    flexDirection: 'row',
  },
  legCell: {
    flexShrink: 1,
    minWidth: 0,
  },
  legCellLoss: {
    alignItems: 'center',
    flexBasis: '18%',
  },
  legCellLossPlace: {
    alignItems: 'flex-end',
    flexBasis: '12%',
  },
  legCellMetric: {
    flexBasis: '28%',
  },
  legCellNo: {
    flexBasis: '12%',
  },
  legHeaderCell: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 13,
  },
  legHeaderLoss: {
    flexBasis: '18%',
    textAlign: 'center',
  },
  legHeaderLossPlace: {
    flexBasis: '12%',
    textAlign: 'right',
  },
  legHeaderMetric: {
    flexBasis: '28%',
  },
  legHeaderNo: {
    flexBasis: '12%',
  },
  legHeaderRow: {
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  legNo: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 18,
  },
  legPrimary: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  legRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  legSecondary: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  lossDot: {
    color: colors.error,
    fontSize: 14,
  },
  lossPrimary: {
    color: colors.error,
  },
  metricGroup: {
    gap: spacing.sm,
  },
  metricLine: {
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 7,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  metricLines: {
    gap: 0,
  },
  metricSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  metricSectionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
  },
  metricSectionTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  metricValue: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    textAlign: 'right',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCloseChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  modalCloseText: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 16,
  },
  modalHeader: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    overflow: 'hidden',
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 24,
    minWidth: 0,
  },
  placementToneLeader: {
    color: colors.error,
  },
  placementTonePodium: {
    color: '#2F6FB8',
  },
  sectionHeaderHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionHeaderTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  infoOverlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  infoBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 460,
    padding: spacing.lg,
    width: '100%',
  },
  infoCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCardTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 20,
    minWidth: 0,
  },
  infoCardBody: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  infoHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  infoIconBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  infoCloseChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  infoList: {
    gap: 10,
    paddingVertical: 2,
  },
  infoListItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  infoListIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  infoListText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  infoListStrong: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  infoPctGood: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  infoPctLoss: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  infoBadgeStack: {
    gap: spacing.xs,
  },
  infoPctBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoPctBadgeSymbol: {
    ...typography.sectionTitle,
    fontSize: 22,
    minWidth: 44,
    textAlign: 'center',
  },
  infoPctBadgeText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  sectionHeaderTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  tableCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  thirdBarFill: {
    borderRadius: 999,
    height: 8,
  },
  thirdBarFillGood: {
    backgroundColor: colors.primary,
  },
  thirdBarFillLoss: {
    backgroundColor: colors.error,
  },
  thirdBarTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  thirdCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  thirdDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  thirdLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  thirdLabelWrap: {
    width: 128,
  },
  thirdPercent: {
    ...typography.captionStrong,
    minWidth: 48,
    textAlign: 'right',
  },
  thirdPercentGood: {
    color: colors.primary,
  },
  thirdPercentLoss: {
    color: colors.error,
  },
  thirdRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  legCategoryHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -4,
  },
  tabRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  tabActive: {
    borderBottomColor: colors.primaryDeep,
    borderBottomWidth: 2,
  },
  tabText: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 13,
  },
  tabTextActive: {
    color: colors.primaryDeep,
  },
  h2hPickerToggle: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  h2hPickerToggleText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 13,
  },
  h2hPickerList: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.xs,
    maxHeight: 220,
    overflow: 'hidden',
  },
  h2hPickerItem: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  h2hPickerItemActive: {
    backgroundColor: colors.surfaceMuted,
  },
  h2hPickerPosition: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 12,
    width: 22,
  },
  h2hPickerNameWrap: {
    flex: 1,
  },
  h2hPickerName: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 13,
  },
  h2hPickerOrg: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  h2hPickerTime: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
    width: 52,
    textAlign: 'right',
  },
  h2hPickerDiff: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    width: 46,
    textAlign: 'right',
  },
  h2hSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  h2hSummaryCell: {
    alignItems: 'center',
    gap: 2,
  },
  h2hSummaryValue: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    fontSize: 22,
  },
  h2hSummaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  h2hWin: {
    color: colors.primary,
  },
  h2hLoss: {
    color: colors.error,
  },
  h2hHeaderRow: {
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  h2hHeaderCell: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 13,
  },
  h2hCellNo: {
    flexBasis: '12%',
  },
  h2hCellTime: {
    flex: 1,
  },
  h2hCellDiff: {
    alignItems: 'flex-end',
    flexBasis: '22%',
  },
  h2hRow: {
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  h2hRowWin: {
    borderLeftColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  h2hRowLoss: {
    borderLeftColor: colors.error,
    backgroundColor: colors.error + '10',
  },
  h2hRowDraw: {
    borderLeftColor: '#F5A623',
    backgroundColor: '#F5A62310',
  },
  h2hCell: {
    flexShrink: 1,
    minWidth: 0,
  },
  h2hPlaceholder: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
});
}
