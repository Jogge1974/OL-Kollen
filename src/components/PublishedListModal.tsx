import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { fetchEventClassNameMap, fetchEventPublishedListXml, fetchEventorEventById } from '@/src/api/eventorApi';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { LoadingState } from '@/src/components/LoadingState';
import { OrganisationLabel } from '@/src/components/OrganisationLabel';
import { PublishedListRow, PublishedListSection, formatPublishedListXml, formatResultStatus } from '@/src/services/publishedListFormatter';
import { calculateClassPoints, fetchSverigelistanForPoints } from '@/src/services/sverigelistanPointsCalculator';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';

function formatRelayStatusLabel(status: string | null) {
  return formatResultStatus(status);
}

export type PublishedListModalState = {
  emptyMessage: string;
  error: string | null;
  eventId: string;
  selectedEventRaceId?: string | null;
  eventSubtitle?: string | null;
  initialAnchorKey?: string | null;
  isLoading: boolean;
  kind: EventPublishedListKind;
  scope: EventPublishedListScope;
  sections: PublishedListSection[];
  title: string;
};

type PickerAnchor = {
  key: string;
  label: string;
};

type OpenAnalysisHandler = (eventId: string, classLabel: string, personId?: string | null) => void;
type PendingChoice = {
  classLabel: string;
  eventId: string;
  organisationId: string;
  organisationLabel: string | null;
  personId: string;
  personLabel: string;
};

export function PublishedListModal({
  onClose,
  onOpenAnalysis,
  state,
}: {
  onClose: () => void;
  onOpenAnalysis?: OpenAnalysisHandler;
  state: PublishedListModalState | null;
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorOffsets, setAnchorOffsets] = React.useState<Record<string, number>>({});
  const anchorOffsetsRef = React.useRef<Record<string, number>>({});
  const [nestedAnalysisState, setNestedAnalysisState] = React.useState<AnalysisModalState | null>(null);
  const [nestedState, setNestedState] = React.useState<PublishedListModalState | null>(null);
  const [selectedAnchorKey, setSelectedAnchorKey] = React.useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = React.useState<PendingChoice | null>(null);
  const [sverigelistanRanks, setSverigelistanRanks] = React.useState<Record<string, number> | null>(null);
  const [sverigelistanLoading, setSverigelistanLoading] = React.useState(false);
  const [sverigelistanVisible, setSverigelistanVisible] = React.useState(false);
  const currentState = state;
  const favoriteClasses = usePreferencesStore((store) => store.favoriteClasses);
  const handleOpenNestedAnalysis = React.useCallback(
    (eventId: string, classLabel: string, personId?: string | null) => {
      void openEventAnalysisModal(eventId, setNestedAnalysisState, classLabel, personId ?? null);
    },
    [],
  );

  const pickerAnchors = React.useMemo(
    () => buildPickerAnchors(currentState?.sections ?? [], currentState?.scope ?? 'public', favoriteClasses),
    [currentState?.scope, currentState?.sections, favoriteClasses],
  );

  const shouldShowPicker = !currentState?.isLoading && !currentState?.error && currentState?.scope === 'public' && pickerAnchors.length > 1;

  React.useEffect(() => {
    setAnchorOffsets({});
    anchorOffsetsRef.current = {};
    setSelectedAnchorKey(currentState?.initialAnchorKey ?? pickerAnchors[0]?.key ?? null);
    setPendingChoice(null);
  }, [currentState?.initialAnchorKey, currentState?.title, pickerAnchors]);

  React.useEffect(() => {
    setSverigelistanRanks(null);
    setSverigelistanLoading(false);
    setSverigelistanVisible(false);
  }, [currentState?.eventId, currentState?.kind]);

  React.useEffect(() => {
    return () => {
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    };
  }, []);

  const scrollToAnchorKey = React.useCallback(
    (anchorKey: string, retries = 20) => {
      if (Platform.OS === 'android') {
        // Android: filtering handled via visibleSections, no scroll needed
        return;
      }

      const offset = anchorOffsetsRef.current[anchorKey];

      if (typeof offset === 'number') {
        scrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(offset - 56, 0),
        });
        return;
      }

      if (retries <= 0) {
        return;
      }

      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }

      scrollRetryTimerRef.current = setTimeout(() => {
        scrollToAnchorKey(anchorKey, retries - 1);
      }, 100);
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedAnchorKey) {
      return;
    }

    scrollToAnchorKey(selectedAnchorKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnchorKey]);

  const handleAnchorPress = React.useCallback(
    (anchorKey: string) => {
      setSelectedAnchorKey(anchorKey);
      if (Platform.OS === 'android') {
        // Android: scroll to top when filtering to new section
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    },
    [],
  );

  const handleAnchorLayout = React.useCallback((anchorKey: string, event: LayoutChangeEvent) => {
    const nextOffset = event.nativeEvent.layout.y;
    anchorOffsetsRef.current = { ...anchorOffsetsRef.current, [anchorKey]: nextOffset };
    setAnchorOffsets((current) => (current[anchorKey] === nextOffset ? current : { ...current, [anchorKey]: nextOffset }));
  }, []);

  const handleSverigelistanPress = React.useCallback(async () => {
    if (sverigelistanLoading) return;

    if (sverigelistanRanks !== null) {
      setSverigelistanVisible((prev) => !prev);
      return;
    }

    setSverigelistanLoading(true);
    try {
      const response = await fetch('https://hvscmyudneihjbtitffy.supabase.co/functions/v1/sverigelistan-latest');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as { rows: Array<{ Rank: number; RunnerId: number | null }> };
      const data = json.rows ?? [];
      const rankMap: Record<string, number> = {};
      for (const entry of data) {
        if (entry.RunnerId != null) {
          rankMap[String(entry.RunnerId)] = entry.Rank;
        }
      }
      setSverigelistanRanks(rankMap);
      setSverigelistanVisible(true);
    } catch (error) {
      console.error('[PublishedListModal] failed to fetch sverigelistan', error);
    } finally {
      setSverigelistanLoading(false);
    }
  }, [sverigelistanLoading, sverigelistanRanks]);

  return (
    <Modal animationType="slide" transparent visible={Boolean(state)}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTopRow}>
              <Text numberOfLines={2} style={styles.modalTitle}>
                {currentState?.title}
              </Text>
              <View style={styles.modalHeaderChips}>
                {(currentState?.kind === 'starts' || currentState?.kind === 'entries') && !currentState?.isLoading ? (
                  <Pressable onPress={handleSverigelistanPress} style={styles.sverigelistanChip} disabled={sverigelistanLoading}>
                    {sverigelistanLoading ? (
                      <>
                        <ActivityIndicator color={colors.primaryDeep} size="small" />
                        <Text style={styles.sverigelistanChipText}>Hämtar Sverigelistan</Text>
                      </>
                    ) : sverigelistanRanks !== null && sverigelistanVisible ? (
                      <>
                        <Text style={styles.sverigelistanChipText}>Sv.Plac.</Text>
                        <Ionicons color={colors.primaryDeep} name="trash-outline" size={13} />
                      </>
                    ) : (
                      <Text style={styles.sverigelistanChipText}>Sv.plac.</Text>
                    )}
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} style={styles.modalCloseChip}>
                  <Ionicons color={colors.primaryDeep} name="close" size={14} />
                  <Text style={styles.modalCloseText}>Stäng</Text>
                </Pressable>
              </View>
            </View>
            {currentState?.eventSubtitle ? (
              <Text numberOfLines={2} style={styles.modalSubtitle}>
                {currentState.eventSubtitle}
              </Text>
            ) : null}
          </View>

          {shouldShowPicker ? (
            <View style={styles.classPickerContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.classPickerRow}>
                {pickerAnchors.map((anchor) => (
                  <Pressable
                    key={anchor.key}
                    onPress={() => handleAnchorPress(anchor.key)}
                    style={[styles.classChip, selectedAnchorKey === anchor.key ? styles.classChipActive : null]}
                  >
                    <Text style={[styles.classChipText, selectedAnchorKey === anchor.key ? styles.classChipTextActive : null]}>{anchor.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <ScrollView ref={scrollRef} contentContainerStyle={styles.listModalContent}>
            {currentState?.isLoading ? <LoadingState label="Hämtar listan..." /> : null}
            {currentState?.error ? <Text style={styles.documentsErrorText}>{currentState.error}</Text> : null}
            {!currentState?.isLoading && !currentState?.error && currentState?.sections.length === 0 ? (
              <Text style={styles.sectionText}>{currentState.emptyMessage}</Text>
            ) : null}

            {!currentState?.isLoading && !currentState?.error && currentState
              ? currentState.sections
                  .filter((section) => {
                    // Android: show only the selected section (public scope with picker only)
                    if (Platform.OS !== 'android' || !selectedAnchorKey || currentState.scope === 'organisation') return true;
                    return `section:${section.title}` === selectedAnchorKey;
                  })
                  .map((section) => (
                  <PublishedTableSection
                    eventId={currentState.eventId}
                    key={section.title}
                    kind={currentState.kind}
                    onAnchorLayout={handleAnchorLayout}
                    onOpenNestedAnalysis={handleOpenNestedAnalysis}
                    onOpenAnalysis={onOpenAnalysis}
                    onOpenAnalysisChoice={setPendingChoice}
                    onOpenOrganisation={setNestedState}
                    selectedEventRaceId={currentState.selectedEventRaceId ?? null}
                    scope={currentState.scope}
                    section={section}
                    sverigelistanRanks={sverigelistanRanks}
                    sverigelistanVisible={sverigelistanVisible}
                  />
                ))
              : null}
          </ScrollView>

          {pendingChoice ? (
            <View style={styles.choiceOverlay}>
              <Pressable style={styles.choiceBackdrop} onPress={() => setPendingChoice(null)} />
              <View style={styles.choiceCard}>
                <Text style={styles.choiceTitle}>Klubbresultat eller Analys</Text>

                <View style={styles.choiceButtons}>
                  <Pressable
                    onPress={() => {
                      setPendingChoice(null);
                      void openPublishedListModal(
                        'results',
                        'organisation',
                        pendingChoice.eventId,
                        pendingChoice.organisationId,
                        pendingChoice.organisationLabel,
                        setNestedState,
                        null,
                        currentState?.selectedEventRaceId ?? null,
                      );
                    }}
                    style={[styles.choiceButton, styles.choiceButtonSecondary]}
                  >
                    <View style={styles.choiceButtonStack}>
                      <Text style={[styles.choiceButtonLabel, styles.choiceButtonSecondaryLabel]}>Klubbresultat</Text>
                      <OrganisationLabel
                        label={pendingChoice.organisationLabel}
                        logoSize={19}
                        organisationId={pendingChoice.organisationId}
                        textStyle={styles.choiceButtonClubText}
                        viewStyle={styles.choiceButtonClubRow}
                      />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPendingChoice(null);
                      void openEventAnalysisModal(pendingChoice.eventId, setNestedAnalysisState, pendingChoice.classLabel, pendingChoice.personId);
                    }}
                    style={[styles.choiceButton, styles.choiceButtonAnalysis]}
                  >
                    <View style={styles.choiceButtonStack}>
                      <View style={styles.choiceButtonAnalysisTitleRow}>
                        <Ionicons color={colors.primaryDeep} name="analytics-outline" size={14} />
                        <Text style={styles.choiceButtonLabelAnalysis}>Analys</Text>
                      </View>
                      <Text numberOfLines={1} style={styles.choiceButtonPersonText}>
                        {pendingChoice.personLabel}
                      </Text>
                    </View>
                  </Pressable>
                </View>

                <Pressable onPress={() => setPendingChoice(null)} style={styles.choiceCancel}>
                  <Text style={styles.choiceCancelText}>Avbryt</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <PublishedListModal onClose={() => setNestedState(null)} onOpenAnalysis={onOpenAnalysis} state={nestedState} />
      <AnalysisModal onClose={() => setNestedAnalysisState(null)} state={nestedAnalysisState} />
    </Modal>
  );
}

function PublishedTableSection({
  eventId,
  kind,
  onAnchorLayout,
  onOpenAnalysis,
  onOpenAnalysisChoice,
  onOpenNestedAnalysis,
  onOpenOrganisation,
  selectedEventRaceId,
  scope,
  section,
  sverigelistanRanks,
  sverigelistanVisible,
}: {
  eventId: string;
  kind: EventPublishedListKind;
  onAnchorLayout: (anchorKey: string, event: LayoutChangeEvent) => void;
  onOpenAnalysis?: OpenAnalysisHandler;
  onOpenAnalysisChoice: (choice: PendingChoice) => void;
  onOpenNestedAnalysis: OpenAnalysisHandler;
  onOpenOrganisation: React.Dispatch<React.SetStateAction<PublishedListModalState | null>>;
  selectedEventRaceId: string | null;
  scope: EventPublishedListScope;
  section: PublishedListSection;
  sverigelistanRanks: Record<string, number> | null;
  sverigelistanVisible: boolean;
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const seenClassAnchors = React.useRef<Set<string>>(new Set());
  seenClassAnchors.current.clear();
  const { width: windowWidth } = useWindowDimensions();

  const isEntries = kind === 'entries';
  const isRelaySection = section.rows.some((row) => Boolean(row.relayMembers?.length));
  const isOrganisationResults = scope === 'organisation' && kind === 'results';
  const hasBibColumn = kind === 'starts' && section.rows.some((row) => Boolean(row.bibNumber));
  const relayLabel = scope === 'organisation' ? 'Klass' : 'Klubb';
  const relayStartWidths = React.useMemo(() => {
    if (kind !== 'starts' || !isRelaySection) {
      return null;
    }

    const bib = Math.max(42, estimateColumnWidth(['Bib', ...section.rows.map((row) => row.bibNumber ?? '-')], 42, 58));
    const brick = Math.max(
      72,
      estimateColumnWidth(
        ['Bricknr', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.controlCard ?? '') ?? [])],
        72,
        104,
      ),
    );
    const time = Math.max(74, estimateColumnWidth(['Starttid', ...section.rows.map((row) => row.time ?? '-')], 74, 94));
    const available = Math.max(windowWidth - spacing.sm * 2, 260);
    const name = Math.max(available - bib - brick - time - 12, 120);

    return {
      bib,
      brick,
      name,
      time,
    };
  }, [isRelaySection, kind, section.rows, windowWidth]);
  const relayResultWidths = React.useMemo(() => {
    if (kind !== 'results' || !isRelaySection) {
      return null;
    }

    const placement = Math.max(18, estimateColumnWidth(['#', ...section.rows.map((row) => row.position ?? '-')], 18, 26));
    const splitTime = Math.max(
      62,
      estimateColumnWidth(
        ['Str.tid', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.time ?? '') ?? [])],
        62,
        84,
      ),
    );
    const splitPosition = Math.max(
      44,
      estimateColumnWidth(
        ['Str.pl.', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.position ?? '') ?? [])],
        44,
        56,
      ),
    );
    const splitDiff = Math.max(
      54,
      estimateColumnWidth(
        ['Str.diff', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.diff ?? '') ?? [])],
        54,
        74,
      ),
    );
    const totalTime = Math.max(
      62,
      estimateColumnWidth(
        ['Tid', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.overallTime ?? '') ?? [])],
        62,
        84,
      ),
    );
    const totalPosition = Math.max(
      44,
      estimateColumnWidth(
        ['Växl.pl.', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.overallPosition ?? '') ?? [])],
        44,
        56,
      ),
    );
    const totalDiff = Math.max(
      54,
      estimateColumnWidth(
        ['Tidsdiff', ...section.rows.flatMap((row) => row.relayMembers?.map((member) => member.overallDiff ?? '') ?? [])],
        54,
        74,
      ),
    );
    const available = Math.max(windowWidth - spacing.sm * 2, 320);
    const name = Math.max(available - placement - splitTime - splitPosition - splitDiff - totalTime - totalPosition - totalDiff - 28, 150);

    return {
      name,
      placement,
      splitDiff,
      splitPosition,
      splitTime,
      totalDiff,
      totalPosition,
      totalTime,
    };
  }, [isRelaySection, kind, section.rows, windowWidth]);
  const columnWidths = React.useMemo(
    () => ({
      bib: hasBibColumn ? estimateColumnWidth(['Bib', ...section.rows.map((row) => row.bibNumber ?? '-')], 42, 54) : undefined,
      class: scope === 'organisation' ? estimateColumnWidth(['Klass', ...section.rows.map((row) => row.classLabel ?? '-')], 72, isEntries ? 132 : 96) : undefined,
      course: scope === 'organisation' && !isEntries ? estimateColumnWidth(['Langd', ...section.rows.map((row) => row.courseLengthLabel ?? '-')], 68, 84) : undefined,
      diff: kind === 'results' ? estimateColumnWidth(['Diff', ...section.rows.map((row) => row.diff ?? '-')], 46, 74) : undefined,
      pace: kind === 'results' ? estimateColumnWidth(['Km-tid', ...section.rows.map((row) => row.pace ?? '-')], 54, 78) : undefined,
      placement: kind === 'results' ? estimateColumnWidth(['#', ...section.rows.map((row) => row.position ?? '-')], 22, 42) : undefined,
      time: !isEntries
        ? estimateColumnWidth([kind === 'starts' ? 'Starttid' : 'Tid', ...section.rows.map((row) => row.time ?? '-')], kind === 'starts' ? 70 : 44, kind === 'starts' ? 82 : 74)
        : undefined,
    }),
    [hasBibColumn, isEntries, kind, scope, section.rows],
  );

  const publicEntryNameColumnWidth = React.useMemo(() => {
    if (!(scope === 'public' && isEntries)) {
      return null;
    }

    const estimatedWidth = Math.max(...section.rows.map((row) => estimateNameWidth([row.givenName, row.familyName].filter(Boolean).join(' ') || row.primary)), 120);
    return Math.min(Math.floor(windowWidth * 0.6), estimatedWidth);
  }, [isEntries, scope, section.rows, windowWidth]);

  const [classPoints, setClassPoints] = React.useState<Record<string, number> | null>(null);
  const [classPointsLoading, setClassPointsLoading] = React.useState(false);
  const [classPointsVisible, setClassPointsVisible] = React.useState(false);

  const isEligibleForPoints = React.useMemo(() => {
    if (kind !== 'results' || scope !== 'public' || isRelaySection) return false;
    const label = section.title;
    const pattern = /^[HDWM]\d/i;
    if (!pattern.test(label)) return false;
    const match = label.match(/^[HDWM](\d+)/i);
    if (!match) return false;
    return Number(match[1]) >= 16;
  }, [kind, scope, isRelaySection, section.title]);

  const handlePointsBadgePress = React.useCallback(async () => {
    if (classPointsLoading) return;

    if (classPoints !== null) {
      setClassPointsVisible((prev) => !prev);
      return;
    }

    setClassPointsLoading(true);
    try {
      const svMap = await fetchSverigelistanForPoints();
      const points = calculateClassPoints(section, svMap);
      setClassPoints(points ?? {});
      setClassPointsVisible(true);
    } catch (error) {
      console.error('[PublishedListModal] failed to calculate points', error);
    } finally {
      setClassPointsLoading(false);
    }
  }, [classPointsLoading, classPoints, section]);

  const handleRowPress = React.useCallback(
    (row: PublishedListRow) => {
      console.log('[PublishedListModal] row press', {
        classLabel: row.classLabel ?? section.title,
        kind,
        organisationId: row.organisationId ?? null,
        personId: row.personId ?? null,
        primary: row.primary,
        scope,
      });

      if (kind === 'results' && scope === 'organisation' && row.personId) {
        console.log('[PublishedListModal] opening nested analysis from organisation results');
        onOpenNestedAnalysis(eventId, row.classLabel ?? section.title, row.personId);
        return;
      }

      if (!row.organisationId) {
        console.log('[PublishedListModal] row press ignored: missing organisationId');
        return;
      }

      if (kind === 'results' && onOpenAnalysis && row.personId) {
        console.log('[PublishedListModal] opening choice overlay for public results');
        onOpenAnalysisChoice({
          classLabel: row.classLabel ?? section.title,
          eventId,
          organisationId: row.organisationId,
          organisationLabel: row.organisation ?? null,
          personId: row.personId,
          personLabel: row.primary,
        });
        return;
      }

      console.log('[PublishedListModal] opening organisation results');
      void openPublishedListModal(
        kind,
        'organisation',
        eventId,
        row.organisationId ?? null,
        row.organisation ?? null,
        onOpenOrganisation,
        null,
        selectedEventRaceId,
      );
    },
    [eventId, kind, onOpenNestedAnalysis, onOpenAnalysis, onOpenOrganisation, scope, section.title, selectedEventRaceId],
  );

  return (
    <View
      onLayout={scope === 'public' ? (event) => onAnchorLayout(`section:${section.title}`, event) : undefined}
      style={styles.tableSection}
    >
      <View style={styles.tableClassHeader}>
        <View style={styles.tableClassHeaderTopRow}>
          <Text numberOfLines={1} style={styles.tableClassHeaderText}>
            {formatSectionTitle(section)}
          </Text>
          <View style={styles.tableClassHeaderRightRow}>
            {isEligibleForPoints ? (
              <Pressable onPress={handlePointsBadgePress} style={styles.pointsBadge} disabled={classPointsLoading}>
                {classPointsLoading ? (
                  <>
                    <ActivityIndicator color={colors.primaryDeep} size={12} />
                    <Text style={styles.pointsBadgeText}>Beräknar...</Text>
                  </>
                ) : classPoints !== null && classPointsVisible ? (
                  <>
                    <Text style={styles.pointsBadgeText}>Beräk. Sv.poä</Text>
                    <Ionicons color={colors.primaryDeep} name="trash-outline" size={11} />
                  </>
                ) : (
                  <Text style={styles.pointsBadgeText}>Beräk. Sv.poä</Text>
                )}
              </Pressable>
            ) : null}
            {section.meta ? <Text style={styles.tableClassHeaderMeta}>{formatSectionMeta(section.meta)}</Text> : null}
          </View>
        </View>

        {isRelaySection ? (
          <View style={styles.relaySectionHeaderWrap}>
            <View style={styles.tableColumnHeaderRow}>
              {kind === 'starts' ? (
                <>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tableColumnHeaderText,
                    styles.relayStartBibCell,
                    styles.relayHeaderStartBibCell,
                    styles.relayStartFixedCell,
                    relayStartWidths ? { width: relayStartWidths.bib } : null,
                  ]}
                >
                  Bib
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tableColumnHeaderText,
                    styles.relayStartTeamCell,
                    styles.relayHeaderStartTeamCell,
                    styles.relayStartFixedCell,
                    relayStartWidths ? { width: relayStartWidths.brick + relayStartWidths.name + 4 } : null,
                  ]}
                >
                  Lag/Bricknr
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tableColumnHeaderText,
                    styles.relayStartTimeCell,
                    styles.relayHeaderStartTimeCell,
                    styles.relayStartFixedCell,
                    styles.relayStartTimeHeaderText,
                    relayStartWidths ? { width: relayStartWidths.time } : null,
                  ]}
                  >
                    Starttid
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tableColumnHeaderText,
                      styles.relayResultPlacementCell,
                      relayResultWidths ? { width: relayResultWidths.placement } : null,
                    ]}
                  >
                    #
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tableColumnHeaderText,
                      styles.relayResultHeaderCell,
                      relayResultWidths ? { width: relayResultWidths.name } : null,
                    ]}
                  >
                    Lag
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tableColumnHeaderText,
                      styles.relayResultHeaderCell,
                      relayResultWidths ? { width: relayResultWidths.splitTime + relayResultWidths.splitPosition + relayResultWidths.splitDiff } : null,
                    ]}
                  >
                    Str.tid / Str.pl. / Str.diff
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tableColumnHeaderText,
                      styles.relayResultHeaderCell,
                      relayResultWidths ? { width: relayResultWidths.totalTime + relayResultWidths.totalPosition + relayResultWidths.totalDiff } : null,
                    ]}
                  >
                    Tid / Växl.pl. / Tid.diff
                  </Text>
                </>
              )}
            </View>
          </View>
        ) : null}

        {isRelaySection ? null : (
          <View style={styles.tableColumnHeaderRow}>
            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tablePlacementColumn, { width: columnWidths.placement }]}>
                #
              </Text>
            ) : null}

            {hasBibColumn ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableBibColumn, { width: columnWidths.bib }]}>
                Bib
              </Text>
            ) : null}

            <Text
              numberOfLines={1}
              style={[
                styles.tableColumnHeaderText,
                scope === 'public' && !isEntries ? styles.tableNameClubColumn : null,
                scope === 'public' && isEntries ? [styles.tableNameColumn, publicEntryNameColumnWidth ? { width: publicEntryNameColumnWidth } : null] : null,
                scope !== 'public' || !isEntries ? styles.tableNameColumn : null,
              ]}
            >
              {scope === 'public' && !isEntries ? 'Namn/Klubb' : 'Namn'}
            </Text>

            {scope === 'public' && isEntries ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableEntryClubColumn]}>
                Klubb
              </Text>
            ) : null}

            {scope === 'organisation' && !isOrganisationResults ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableClassColumn, { width: columnWidths.class }]}>
                Klass
              </Text>
            ) : null}

            {scope === 'organisation' && !isEntries && !isOrganisationResults ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableCourseColumn, { width: columnWidths.course }]}>
                Langd
              </Text>
            ) : null}

            {sverigelistanVisible && (kind === 'starts' || kind === 'entries') ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.sverigelistanRankColumn, { textAlign: 'right' }]}>
                Sv.pl.
              </Text>
            ) : null}

            {!isEntries ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn, { width: columnWidths.time }]}>
                {kind === 'starts' ? 'Starttid' : 'Tid'}
              </Text>
            ) : null}

            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn, { width: columnWidths.diff }]}>
                Diff
              </Text>
            ) : null}

            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn, { width: columnWidths.pace }]}>
                Km-tid
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {section.rows.map((row, rowIndex) => {
        const classAnchorKey = row.classLabel ? `class:${row.classLabel}` : null;
        const shouldAttachClassAnchor = scope === 'organisation' && classAnchorKey && !seenClassAnchors.current.has(classAnchorKey);
        const resultStatus = kind === 'results' && row.status && row.status !== 'OK' ? formatResultStatus(row.status) : null;
        const resultMetricWidth = (columnWidths.time ?? 0) + (columnWidths.diff ?? 0) + (columnWidths.pace ?? 0);
        const relayResultSplitStatusWidth = relayResultWidths
          ? relayResultWidths.splitTime + relayResultWidths.splitPosition + relayResultWidths.splitDiff
          : null;
        const relayResultTotalStatusWidth = relayResultWidths
          ? relayResultWidths.totalTime + relayResultWidths.totalPosition + relayResultWidths.totalDiff
          : null;

        if (shouldAttachClassAnchor && classAnchorKey) {
          seenClassAnchors.current.add(classAnchorKey);
        }

        const isRelayClickable = isRelaySection && scope === 'public';
        const RowContainer = (scope === 'organisation' && isOrganisationResults) || isRelayClickable ? Pressable : View;
        const rowContainerProps =
          scope === 'organisation' && isOrganisationResults
            ? {
                disabled: !row.personId,
                onPress: () => {
                  console.log('[PublishedListModal] organisation row pressed', {
                    classLabel: row.classLabel ?? section.title,
                    courseLengthLabel: row.courseLengthLabel ?? null,
                    kind,
                    personId: row.personId ?? null,
                    primary: row.primary,
                  });
                  handleRowPress(row);
                },
              }
            : isRelayClickable
              ? {
                  disabled: !row.organisationId,
                  onPress: () => handleRowPress(row),
                }
            : {};

        if (isRelaySection) {
          return (
            <React.Fragment key={`${section.title}-${row.primary}-${rowIndex}`}>
              <RowContainer
                key={`${section.title}-${row.primary}-${rowIndex}`}
                onLayout={shouldAttachClassAnchor && classAnchorKey ? (event) => onAnchorLayout(classAnchorKey, event) : undefined}
                {...rowContainerProps}
                style={[
                  styles.tableRow,
                  rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                  styles.relayRow,
                  styles.relayRowSpacing,
                ]}
              >
                <View style={styles.relayGrid}>
                  <View style={styles.relayTeamRow}>
                    {kind === 'starts' ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.relayStartTopText,
                          styles.relayStartBibCell,
                          styles.relayStartFixedCell,
                          relayStartWidths ? { width: relayStartWidths.bib } : null,
                        ]}
                      >
                        {row.bibNumber ?? '-'}
                      </Text>
                    ) : (
                      <Text numberOfLines={1} style={[styles.relayTeamCellText, styles.relayResultPlacementCell]}>
                        {row.position ?? '-'}
                      </Text>
                    )}

                    {kind === 'starts' ? (
                      <View
                        style={[
                          styles.relayStartTeamCell,
                          styles.relayTeamNameCell,
                          styles.relayStartTeamSpanCell,
                          styles.relayStartFixedCell,
                          relayStartWidths ? { width: relayStartWidths.brick + relayStartWidths.name + 4 } : null,
                        ]}
                      >
                        <Text numberOfLines={1} style={styles.relayStartTeamNameText}>
                          {scope === 'organisation' ? row.classLabel ?? row.organisation ?? row.primary : row.organisation ?? row.classLabel ?? row.primary}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.relayResultSpanCell, styles.relayTeamNameCell]}>
                        <Text numberOfLines={1} style={styles.relayTeamNameText}>
                          {scope === 'organisation' ? row.classLabel ?? row.organisation ?? row.primary : row.organisation ?? row.classLabel ?? row.primary}
                        </Text>
                      </View>
                    )}

                    {kind === 'starts' ? (
                      <View
                        style={[
                          styles.relayStartTimeCell,
                          styles.relayStartFixedCell,
                          relayStartWidths ? { width: relayStartWidths.time } : null,
                        ]}
                      >
                        <Text numberOfLines={1} style={styles.relayStartTopText}>
                          {row.time ?? '-'}
                        </Text>
                      </View>
                    ) : (
                      (() => {
                        const relayStatusMember = row.relayMembers?.find((member) => {
                          const memberStatus = member.status ?? member.overallStatus ?? null;
                          return Boolean(memberStatus && memberStatus !== 'OK');
                        });
                        const relayTeamStatusSource = row.status ?? relayStatusMember?.status ?? relayStatusMember?.overallStatus ?? null;
                        const relayTeamStatusText = relayTeamStatusSource && relayTeamStatusSource !== 'OK'
                          ? formatResultStatus(relayTeamStatusSource)
                          : null;

                        return relayTeamStatusText ? (
                          <>
                            <Text numberOfLines={1} style={[styles.relayTeamCellText, styles.relayResultValueCell]}>
                              {' '}
                            </Text>
                            <View style={styles.relayResultBlankCell} />
                            <Text numberOfLines={1} style={[styles.relayTeamCellText, styles.relayResultStatusCell]}>
                              {relayTeamStatusText}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text numberOfLines={1} style={[styles.relayTeamCellText, styles.relayResultValueCell]}>
                              {row.time ?? '-'}
                            </Text>
                            <View style={styles.relayResultBlankCell} />
                            <Text numberOfLines={1} style={[styles.relayTeamCellText, styles.relayResultValueCell]}>
                              {row.diff ?? ''}
                            </Text>
                          </>
                        );
                      })()
                    )}
                </View>

                <View style={styles.relayMembersGrid}>
                  {(() => {
                    let carriedRelayStatusText: string | null = null;

                    return row.relayMembers?.map((member, memberIndex) => {
                      const memberStatusSource = member.status ?? member.overallStatus ?? null;
                      const splitStatusText = memberStatusSource && memberStatusSource !== 'OK'
                        ? formatRelayStatusLabel(memberStatusSource)
                        : null;
                      const totalStatusText = splitStatusText ?? carriedRelayStatusText;

                      if (splitStatusText) {
                        carriedRelayStatusText = splitStatusText;
                      }

                      return (
                        <View key={`${section.title}-${row.primary}-member-${memberIndex}`} style={styles.relayMemberRow}>
                          {kind === 'starts' ? (
                            <>
                              <View
                                style={[
                                  styles.relayStartBibCell,
                                  styles.relayStartFixedCell,
                                  relayStartWidths ? { width: relayStartWidths.bib } : null,
                                ]}
                              />
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.relayMemberCellText,
                                  styles.relayStartBrickCell,
                                  styles.relayStartFixedCell,
                                  relayStartWidths ? { width: relayStartWidths.brick } : null,
                                ]}
                              >
                                {member.controlCard ?? ''}
                              </Text>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.relayMemberCellText,
                                  styles.relayStartTeamCell,
                                  styles.relayStartFixedCell,
                                  relayStartWidths ? { width: relayStartWidths.name } : null,
                                ]}
                              >
                                {member.leg ? `${member.leg}. ` : ''}
                                {member.primary}
                              </Text>
                              <View
                                style={[
                                  styles.relayStartTimeCell,
                                  styles.relayStartFixedCell,
                                  relayStartWidths ? { width: relayStartWidths.time } : null,
                                ]}
                              />
                            </>
                          ) : (
                            <>
                              <View style={styles.relayResultPlacementCell} />
                              <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultNameCell]}>
                                {member.leg ? `${member.leg}. ` : ''}
                                {member.primary}
                              </Text>
                              {splitStatusText ? (
                                <>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultPositionCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultStatusCell]}>
                                    {splitStatusText}
                                  </Text>
                                </>
                              ) : (
                                <>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {member.time ?? '-'}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultPositionCell]}>
                                    {member.position ?? '-'}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {member.diff ?? ''}
                                  </Text>
                                </>
                              )}
                              {totalStatusText ? (
                                <>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultStatusCell]}>
                                    {totalStatusText}
                                  </Text>
                                </>
                              ) : (
                                <>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultValueCell]}>
                                    {' '}
                                  </Text>
                                  <Text numberOfLines={1} style={[styles.relayMemberCellText, styles.relayResultStatusCell]}>
                                    {' '}
                                  </Text>
                                </>
                              )}
                            </>
                          )}
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            </RowContainer>
            </React.Fragment>
          );
        }

        if (isRelaySection && kind === 'starts') {
          return (
            <RowContainer
              key={`${section.title}-${row.primary}-${rowIndex}`}
              onLayout={shouldAttachClassAnchor && classAnchorKey ? (event) => onAnchorLayout(classAnchorKey, event) : undefined}
              {...rowContainerProps}
              style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd, styles.relayRow]}
            >
              <View style={styles.relayCard}>
                <View style={styles.relayTopRow}>
                  {kind === 'starts' ? <Text style={[styles.relayTopMetric, styles.relayBib]}>{row.bibNumber ?? '-'}</Text> : null}

                  <View style={styles.relayMainColumn}>
                    <Text numberOfLines={1} style={styles.relayTeamName}>
                      {row.primary}
                    </Text>
                    <Text numberOfLines={1} style={styles.relayClubName}>
                      {row.organisation ?? '-'}
                    </Text>
                  </View>

                  <View style={styles.relayMetricColumn}>
                    {kind === 'starts' ? (
                      <Text numberOfLines={1} style={[styles.relayTopMetric, styles.relayTopMetricStrong]}>
                        {row.time ?? '-'}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.relayMembersList}>
                  {row.relayMembers?.map((member, memberIndex) => (
                    <View key={`${section.title}-${row.primary}-member-${memberIndex}`} style={styles.relayMemberRow}>
                      <View style={styles.relayMemberIdentity}>
                        <Text numberOfLines={1} style={styles.relayMemberName}>
                          {member.leg ? `${member.leg}. ` : ''}
                          {member.primary}
                        </Text>
                        {kind === 'starts' ? (
                          <Text numberOfLines={1} style={styles.relayMemberMeta}>
                            Start {member.startTime ?? member.time ?? '-'}
                          </Text>
                        ) : (
                          <Text numberOfLines={1} style={styles.relayMemberMeta}>
                            {[
                              formatRelayMetric('Str', member.time),
                              formatRelayMetric('Strpl', member.position),
                              formatRelayMetric('Diff', member.diff),
                              formatRelayMetric('Tid', member.overallTime),
                              formatRelayMetric('Vxlpl', member.overallPosition),
                              formatRelayMetric('Diff', member.overallDiff),
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </RowContainer>
          );
        }

        return (
          <RowContainer
            key={`${section.title}-${row.primary}-${rowIndex}`}
            onLayout={shouldAttachClassAnchor && classAnchorKey ? (event) => onAnchorLayout(classAnchorKey, event) : undefined}
            {...rowContainerProps}
            style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
          >
            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tablePlacementColumn, { width: columnWidths.placement }]}>
                {row.position ?? '-'}
              </Text>
            ) : null}

            {hasBibColumn ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableBibColumn, { width: columnWidths.bib }]}>
                {row.bibNumber ?? '-'}
              </Text>
            ) : null}

            {scope === 'public' && !isEntries ? (
              <Pressable disabled={!row.organisationId} onPress={() => handleRowPress(row)} style={styles.tableNameClubColumn}>
                <PersonNameText familyName={row.familyName} givenName={row.givenName} primary={row.primary} style={styles.tableMainText} />
                <OrganisationLabel
                  label={row.organisation}
                  logoSize={13}
                  organisationId={row.organisationId}
                  textStyle={[styles.tableClubTextSmall, row.organisationId ? styles.tableClubLinkText : null]}
                  viewStyle={styles.clubLabelRow}
                />
              </Pressable>
            ) : scope === 'public' && isEntries ? (
              <Pressable disabled={!row.organisationId} onPress={() => handleRowPress(row)} style={[styles.tableNameColumn, publicEntryNameColumnWidth ? { width: publicEntryNameColumnWidth } : null]}>
                <PersonNameText familyName={row.familyName} givenName={row.givenName} primary={row.primary} style={styles.tableMainText} />
              </Pressable>
            ) : (
              <Pressable disabled={!row.organisationId} onPress={() => handleRowPress(row)} style={styles.tableNameColumn}>
                <PersonNameText familyName={row.familyName} givenName={row.givenName} primary={row.primary} style={styles.tableMainText} />
                {isOrganisationResults ? (
                  <View pointerEvents="none" style={styles.nameMetaRow}>
                    <Text numberOfLines={1} style={[styles.nameMetaText, styles.nameMetaClass, { width: columnWidths.class }]}>
                      {row.classLabel ?? '-'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.nameMetaText, styles.nameMetaCourse, { width: columnWidths.course }]}>
                      {row.courseLengthLabel ?? '-'}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )}

            {scope === 'public' && isEntries ? (
              <Pressable disabled={!row.organisationId} onPress={() => handleRowPress(row)} style={styles.tableEntryClubColumn}>
                <OrganisationLabel
                  label={row.organisation}
                  logoSize={13}
                  organisationId={row.organisationId}
                  textStyle={[styles.tableCellText, row.organisationId ? styles.tableClubLinkText : null]}
                  viewStyle={styles.clubLabelRow}
                />
              </Pressable>
            ) : null}

            {scope === 'organisation' && !isOrganisationResults ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableClassColumn, { width: columnWidths.class }]}>
                {row.classLabel ?? '-'}
              </Text>
            ) : null}

            {scope === 'organisation' && !isEntries && !isOrganisationResults ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableCourseColumn, styles.tableCourseColumnData, { width: columnWidths.course }]}>
                {row.courseLengthLabel ?? '-'}
              </Text>
            ) : null}

            {sverigelistanVisible && sverigelistanRanks && (kind === 'starts' || kind === 'entries') ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.sverigelistanRankColumn, styles.sverigelistanRankCell]}>
                {row.personId && sverigelistanRanks[row.personId] != null ? String(sverigelistanRanks[row.personId]) : ''}
              </Text>
            ) : null}

            {!isEntries && !resultStatus ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn, styles.tableMetricStrong, { width: columnWidths.time }]}>
                {row.time ?? '-'}
              </Text>
            ) : null}

            {kind === 'results' && !resultStatus ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn, styles.tableMetricStrong, { width: columnWidths.diff }]}>
                {row.diff ?? '-'}
              </Text>
            ) : null}

            {kind === 'results' && resultStatus ? (
              <View
                style={[
                  styles.tableMetricMergedStatus,
                  {
                    width: resultMetricWidth,
                  },
                ]}
                    >
                        <Text numberOfLines={1} style={[styles.tableMetricMergedStatusText, styles.tableMetricStrong]}>
                  {resultStatus}
                </Text>
              </View>
            ) : null}

            {kind === 'results' && !resultStatus ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn, { width: columnWidths.pace }]}>
                {row.pace ?? '-'}
              </Text>
            ) : null}

            {classPointsVisible && classPoints && row.personId && classPoints[row.personId] != null ? (
              <Text numberOfLines={1} style={styles.pointsTextAbsolute}>Prel. Sv.poäng: {classPoints[row.personId].toFixed(2)}</Text>
            ) : null}
          </RowContainer>
        );
      })}
    </View>
  );
}

function PersonNameText({
  familyName,
  givenName,
  primary,
  style,
}: {
  familyName?: string;
  givenName?: string;
  primary: string;
  style?: object;
}) {
  if (!familyName && !givenName) {
    return (
      <Text numberOfLines={1} style={style}>
        {primary}
      </Text>
    );
  }

  return (
    <Text numberOfLines={1} style={style}>
      {[givenName, familyName].filter(Boolean).join(' ')}
    </Text>
  );
}

function formatRelayMetric(label: string, value?: string | null) {
  if (!value) {
    return null;
  }

  return `${label} ${value}`;
}

export async function openPublishedListModal(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId: string | null,
  organisationLabel: string | null,
  setState: React.Dispatch<React.SetStateAction<PublishedListModalState | null>>,
  initialAnchorLabel?: string | null,
  selectedEventRaceId?: string | null,
) {
  const initialAnchorKey = initialAnchorLabel ? `section:${initialAnchorLabel}` : null;

  setState({
    emptyMessage: getEmptyListMessage(kind),
    error: null,
    eventId,
    eventSubtitle: null,
    initialAnchorKey,
    isLoading: true,
    kind,
    selectedEventRaceId: selectedEventRaceId ?? null,
    scope,
    sections: [],
    title: getListTitle(kind, scope, organisationLabel),
  });

  try {
    const [rawXml, eventClassNameById, eventDetail] = await Promise.all([
      fetchEventPublishedListXml(kind, scope, eventId, organisationId ?? undefined),
      kind === 'entries' ? fetchEventClassNameMap(eventId).catch(() => ({})) : Promise.resolve<Record<string, string>>({}),
      fetchEventorEventById(eventId, selectedEventRaceId).catch(() => null),
    ]);

    const formatted = formatPublishedListXml(kind, rawXml, {
      eventClassNameById,
      organisationId,
      selectedEventRaceId,
      scope,
    });

    const sections =
      scope === 'organisation'
        ? formatted.sections.map((section) => ({
            ...section,
            title: organisationLabel ?? 'Min klubb',
          }))
        : formatted.sections;

    setState({
      emptyMessage: formatted.emptyMessage,
      error: null,
      eventId,
      initialAnchorKey,
      isLoading: false,
      kind,
      selectedEventRaceId: selectedEventRaceId ?? null,
      scope,
      sections,
      eventSubtitle: eventDetail ? `${eventDetail.name} • ${eventDetail.dateLabel}` : null,
      title: getListTitle(kind, scope, organisationLabel),
    });
  } catch (loadError) {
    setState({
      emptyMessage: getEmptyListMessage(kind),
      error: loadError instanceof Error ? loadError.message : 'Det gick inte att hamta listan.',
      eventId,
      eventSubtitle: null,
      initialAnchorKey,
      isLoading: false,
      kind,
      selectedEventRaceId: selectedEventRaceId ?? null,
      scope,
      sections: [],
      title: getListTitle(kind, scope, organisationLabel),
    });
  }
}

function buildPickerAnchors(sections: PublishedListSection[], scope: EventPublishedListScope, favoriteClasses: string[]): PickerAnchor[] {
  if (scope === 'public') {
    return sortPickerAnchors(
      sections.map((section) => ({
        key: `section:${section.title}`,
        label: section.title,
      })),
      favoriteClasses,
    );
  }

  const classLabels = new Set<string>();

  sections.forEach((section) => {
    section.rows.forEach((row) => {
      if (row.classLabel) {
        classLabels.add(row.classLabel);
      }
    });
  });

  return sortPickerAnchors(
    Array.from(classLabels).map((label) => ({
      key: `class:${label}`,
      label,
    })),
    favoriteClasses,
  );
}

function formatSectionMeta(meta: string) {
  return meta.replace(/\s*•\s*Bana:\s*[^•]+/i, '').replace(/^Bana:\s*[^•]+/i, '').trim();
}

function formatSectionTitle(section: PublishedListSection) {
  const courseLengthMatch = section.meta?.match(/Bana:\s*([^•]+)/i)?.[1]?.trim() ?? null;
  return courseLengthMatch ? `${section.title} - ${courseLengthMatch}` : section.title;
}

function getEmptyListMessage(kind: EventPublishedListKind) {
  if (kind === 'results') {
    return 'Ingen resultatlista hittades.';
  }

  if (kind === 'starts') {
    return 'Ingen startlista hittades.';
  }

  return 'Inga anmälningar hittades.';
}

function getListTitle(kind: EventPublishedListKind, scope: EventPublishedListScope, organisationLabel?: string | null) {
  const prefix = scope === 'organisation' ? ` ${organisationLabel ?? ''} ` : '';

  if (kind === 'results') {
      return `Resultatlista${prefix}`;
  }

  if (kind === 'starts') {
      return `Startlista${prefix}`;
  }

    return `Anmälningslista${prefix}`;
}

function sortPickerAnchors(anchors: PickerAnchor[], favoriteClasses: string[]) {
  if (favoriteClasses.length === 0) {
    return anchors;
  }

  const favoriteIndexByLabel = new Map(favoriteClasses.map((favoriteClass, index) => [normalizeClassLabel(favoriteClass), index]));

  return [...anchors].sort((left, right) => {
    const leftFavoriteIndex = favoriteIndexByLabel.get(normalizeClassLabel(left.label));
    const rightFavoriteIndex = favoriteIndexByLabel.get(normalizeClassLabel(right.label));

    if (leftFavoriteIndex !== undefined && rightFavoriteIndex !== undefined) {
      return leftFavoriteIndex - rightFavoriteIndex;
    }

    if (leftFavoriteIndex !== undefined) {
      return -1;
    }

    if (rightFavoriteIndex !== undefined) {
      return 1;
    }

    return 0;
  });
}

function normalizeClassLabel(label: string) {
  return label.replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv');
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '86%',
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalHeaderTopRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  modalSubtitle: {
    ...typography.buttonSmall,
    color: colors.primary,
    alignSelf: 'flex-start',
    fontSize: 13,
    lineHeight: 18,
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
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
  },
  classPickerContainer: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  classPickerRow: {
    gap: 0,
    paddingBottom: 0,
  },
  classChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  classChipActive: {
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
  },
  classChipText: {
    color: colors.textPrimary,
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 14,
    lineHeight: 17,
  },
  classChipTextActive: {
    color: colors.heroText,
  },
  listModalContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  documentsErrorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  choiceBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  choiceButtons: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  choiceButton: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  choiceButtonPrimary: {
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
  },
  choiceButtonAnalysis: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#0F1E30') : '#E7F1FF',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2E4A6E') : '#90B5E8',
    borderWidth: 1,
  },
  choiceButtonLabel: {
    ...typography.buttonSmall,
    color: colors.heroText,
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'center',
  },
  choiceButtonLabelAnalysis: {
    ...typography.buttonSmall,
    color: isDark ? '#90B5E8' : '#2F66A8',
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'center',
  },
  choiceButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  choiceButtonSecondaryLabel: {
    color: colors.primaryDeep,
  },
  choiceButtonAnalysisTitleRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  choiceButtonClubRow: {
    alignSelf: 'center',
    justifyContent: 'center',
  },
  choiceButtonClubText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
  },
  choiceButtonPersonText: {
    ...typography.captionStrong,
    color: isDark ? '#90B5E8' : '#2F66A8',
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
  },
  choiceButtonStack: {
    alignItems: 'center',
    gap: 6,
  },
  choiceCancel: {
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  choiceCancelText: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
  choiceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
  },
  choiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    justifyContent: 'center',
  },
  choiceTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  tableSection: {
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: -spacing.lg,
    overflow: 'hidden',
  },
  tableClassHeader: {
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  tableClassHeaderTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tableClassHeaderText: {
    ...typography.bodyStrong,
    color: colors.heroText,
    flex: 1,
  },
  tableClassHeaderMeta: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 11,
  },
  tableColumnHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  tableColumnHeaderText: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'left',
  },
  tableRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  tableRowEven: {
    backgroundColor: colors.surface,
  },
  tableRowOdd: {
    backgroundColor: isDark ? (isSoft ? '#152240' : colors.surfaceMuted) : isSoft ? '#EDF2FA' : '#F1F8EA',
  },
  relayRow: {
    paddingBottom: 5,
    paddingHorizontal: spacing.sm,
    paddingTop: 5,
  },
  relayRowSpacing: {
    marginBottom: 3,
    marginTop: 3,
  },
  relayGrid: {
    width: '100%',
    flex: 1,
    gap: 4,
  },
  relaySectionHeaderWrap: {
    marginHorizontal: -(spacing.md - spacing.sm),
  },
  relayHeaderRow: {
    flexDirection: 'row',
    gap: 4,
  },
  relayHeaderCell: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 11,
    lineHeight: 13,
    minWidth: 0,
  },
  relayTeamRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  relayMembersGrid: {
    gap: 3,
  },
  relayTeamCellText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 14,
    minWidth: 0,
  },
  relayMemberCellText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 13,
    minWidth: 0,
  },
  relayTeamNameCell: {
    minWidth: 0,
  },
  relayTeamNameText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 15,
  },
  relayStartTopText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'right',
  },
  relayStartFixedCell: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  relayStartTeamNameText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'left',
  },
  relayStartBibCell: {
    flex: 0.8,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayStartBlankCell: {
    flex: 0.7,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayStartBrickCell: {
    flex: 0.95,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayStartTeamCell: {
    flex: 2.8,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayStartTeamSpanCell: {
    flex: 3.5,
  },
  relayStartTimeCell: {
    flex: 1.15,
    alignItems: 'flex-end',
    minWidth: 0,
    paddingRight: 0,
    textAlign: 'right',
  },
  relayStartTimeHeaderText: {
    textAlign: 'right',
  },
  relayHeaderStartBibCell: {
    marginRight: 4,
  },
  relayHeaderStartTeamCell: {
    marginRight: 4,
  },
  relayHeaderStartTimeCell: {
    marginLeft: 0,
  },
  relayResultPlacementCell: {
    flex: 0,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayResultHeaderCell: {
    flex: 3,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'left',
  },
  relayResultSpanCell: {
    flex: 5.85,
    minWidth: 0,
    paddingRight: 4,
  },
  relayResultNameCell: {
    flex: 2.85,
    minWidth: 0,
    paddingRight: 4,
  },
  relayResultValueCell: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'right',
  },
  relayResultStatusCell: {
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'right',
  },
  relayResultPositionCell: {
    flex: 0,
    minWidth: 0,
    paddingRight: 4,
    textAlign: 'right',
  },
  relayResultBlankCell: {
    flex: 0.85,
    minWidth: 0,
  },
  relayCard: {
    flex: 1,
    gap: 6,
  },
  relayTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  relayPlacement: {
    width: 28,
  },
  relayBib: {
    width: 42,
  },
  relayMainColumn: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  relayTeamName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
  },
  relayClubName: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 14,
  },
  relayMetricColumn: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 2,
  },
  relayTopMetric: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 15,
    textAlign: 'right',
  },
  relayTopMetricStrong: {
    fontFamily: typography.bodyStrong.fontFamily,
  },
  relayTopDiff: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'right',
  },
  relayMembersList: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    gap: 4,
    marginLeft: 14,
    paddingLeft: 10,
  },
  relayMemberRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  relayMemberIdentity: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  relayMemberName: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 15,
  },
  relayMemberMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  tableCellText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'left',
  },
  tablePlacementColumn: {
    flexShrink: 0,
    paddingRight: 4,
    width: 28,
  },
  tableBibColumn: {
    flexShrink: 0,
    paddingRight: 4,
    width: 42,
  },
  tableNameColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  tableNameClubColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  tableEntryClubColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  tableMainText: {
    color: colors.textPrimary,
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 16,
    lineHeight: 19,
  },
  tableClubTextSmall: {
    color: colors.textSecondary,
    fontFamily: typography.body.fontFamily,
    fontSize: 13,
    lineHeight: 15,
    flexShrink: 1,
    minWidth: 0,
  },
  tableClubLinkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  clubLabelRow: {
    marginTop: 1,
  },
  nameMetaRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
  },
  nameMetaText: {
    color: colors.textSecondary,
    fontFamily: typography.body.fontFamily,
    fontSize: 13,
    lineHeight: 15,
  },
  nameMetaClass: {
    flexShrink: 0,
  },
  nameMetaCourse: {
    color: isDark ? (isSoft ? '#7AB8E0' : '#8CC490') : undefined,
    flexShrink: 0,
  },
  tableClassColumn: {
    flexShrink: 0,
    paddingRight: 4,
    width: 86,
  },
  tableCourseColumn: {
    flexShrink: 0,
    paddingRight: 4,
    width: 78,
  },
  tableCourseColumnData: {
    color: isDark ? (isSoft ? '#7AB8E0' : '#8CC490') : undefined,
  },
  tableMetricColumn: {
    flexShrink: 0,
    textAlign: 'right',
    width: 74,
  },
  tableMetricMergedStatus: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  tableMetricMergedStatusText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'right',
  },
  tableMetricStrong: {
    fontFamily: typography.bodyStrong.fontFamily,
  },
  modalHeaderChips: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sverigelistanChip: {
    alignItems: 'center',
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#1C2A1F') : '#E7F1FF',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2A3A2C') : '#90B5E8',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sverigelistanChipText: {
    ...typography.buttonSmall,
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 16,
  },
  sverigelistanRankColumn: {
    flexShrink: 0,
    marginRight: 8,
    paddingRight: 4,
    textAlign: 'right',
    width: 44,
  },
  sverigelistanRankCell: {
    color: isDark ? '#90B5E8' : '#2F66A8',
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 14,
  },
  tableClassHeaderRightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pointsBadgeText: {
    color: colors.heroText,
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 11,
    lineHeight: 14,
  },
  pointsText: {
    color: isDark ? '#90B5E8' : '#2F66A8',
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'right',
  },
  pointsTextAbsolute: {
    bottom: 7,
    color: isDark ? '#90B5E8' : '#2F66A8',
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 12,
    lineHeight: 15,
    position: 'absolute',
    right: spacing.sm,
    textAlign: 'right',
  },
  clubPointsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 1,
  },
});
}

function estimateNameWidth(value: string) {
  return Math.max(110, Math.round(value.length * 9.2));
}

function estimateColumnWidth(values: string[], minWidth: number, maxWidth: number) {
  const estimated = Math.max(...values.map((value) => Math.round(value.length * 8.4 + 8)), minWidth);
  return Math.min(estimated, maxWidth);
}
