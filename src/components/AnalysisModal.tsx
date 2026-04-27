import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchEventSplitTimesXml, fetchEventorEventById } from '@/src/api/eventorApi';
import { LoadingState } from '@/src/components/LoadingState';
import { buildEventAnalysis } from '@/src/services/eventAnalysis';
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

  const selectedSection = React.useMemo(
    () => currentState?.sections.find((section) => section.classLabel === currentState?.initialClassLabel) ?? currentState?.sections[0] ?? null,
    [currentState?.initialClassLabel, currentState?.sections],
  );

  const analysis = React.useMemo(
    () => (selectedSection ? buildEventAnalysis(selectedSection, currentState?.initialPersonId ?? null) : null),
    [currentState?.initialPersonId, selectedSection],
  );

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
                  <Text style={styles.sectionHeaderTitle}>Banan i tre delar</Text>
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

              <View style={styles.tableCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>Sträcka för sträcka</Text>
                </View>

                <View style={styles.legHeaderRow}>
                  <Text style={[styles.legHeaderCell, styles.legHeaderNo]}>#</Text>
                  <Text style={[styles.legHeaderCell, styles.legHeaderMetric]}>Sträcka</Text>
                  <Text style={[styles.legHeaderCell, styles.legHeaderMetric]}>Totalt</Text>
                  <Text style={[styles.legHeaderCell, styles.legHeaderLoss]}>Bomtid</Text>
                  <Text style={[styles.legHeaderCell, styles.legHeaderLossPlace]}>Bomfri plac.</Text>
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
                      <Text style={styles.legSecondary}>
                        {row.totalDiffLabel ?? '-'}
                      </Text>
                    </View>

                    <View style={[styles.legCell, styles.legCellLoss]}>
                      <Text style={[styles.legPrimary, row.estimatedTimeLossLabel ? styles.lossPrimary : null]}>{row.estimatedTimeLossLabel ?? '-'}</Text>
                    </View>

                    <View style={[styles.legCell, styles.legCellLossPlace]}>
                      <Text style={styles.legPrimary}>{row.legPlaceWithoutLoss !== null ? `${row.legPlaceWithoutLoss}` : '-'}</Text>
                    </View>
                  </View>
                ))}
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
      fetchEventSplitTimesXml(eventId),
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
});
}
