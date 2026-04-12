import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { fetchEventClassNameMap, fetchEventPublishedListXml, fetchEventorEventById } from '@/src/api/eventorApi';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { LoadingState } from '@/src/components/LoadingState';
import { OrganisationLabel } from '@/src/components/OrganisationLabel';
import { PublishedListRow, PublishedListSection, formatPublishedListXml, formatResultStatus } from '@/src/services/publishedListFormatter';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';

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
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorOffsets, setAnchorOffsets] = React.useState<Record<string, number>>({});
  const [nestedAnalysisState, setNestedAnalysisState] = React.useState<AnalysisModalState | null>(null);
  const [nestedState, setNestedState] = React.useState<PublishedListModalState | null>(null);
  const [selectedAnchorKey, setSelectedAnchorKey] = React.useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = React.useState<PendingChoice | null>(null);
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
    setSelectedAnchorKey(currentState?.initialAnchorKey ?? pickerAnchors[0]?.key ?? null);
    setPendingChoice(null);
  }, [currentState?.initialAnchorKey, currentState?.title, pickerAnchors]);

  React.useEffect(() => {
    return () => {
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    };
  }, []);

  const scrollToAnchorKey = React.useCallback(
    (anchorKey: string, retries = 6) => {
      const offset = anchorOffsets[anchorKey];

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
      }, 50);
    },
    [anchorOffsets],
  );

  React.useEffect(() => {
    if (!selectedAnchorKey) {
      return;
    }

    scrollToAnchorKey(selectedAnchorKey);
  }, [scrollToAnchorKey, selectedAnchorKey]);

  const handleAnchorPress = React.useCallback(
    (anchorKey: string) => {
      setSelectedAnchorKey(anchorKey);
      scrollToAnchorKey(anchorKey);
    },
    [scrollToAnchorKey],
  );

  const handleAnchorLayout = React.useCallback((anchorKey: string, event: LayoutChangeEvent) => {
    const nextOffset = event.nativeEvent.layout.y;
    setAnchorOffsets((current) => (current[anchorKey] === nextOffset ? current : { ...current, [anchorKey]: nextOffset }));
  }, []);

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
              <Pressable onPress={onClose} style={styles.modalCloseChip}>
                <Ionicons color={colors.primaryDeep} name="close" size={14} />
                <Text style={styles.modalCloseText}>Stäng</Text>
              </Pressable>
            </View>
            {currentState?.eventSubtitle ? (
              <Text numberOfLines={2} style={styles.modalSubtitle}>
                {currentState.eventSubtitle}
              </Text>
            ) : null}
          </View>

          {shouldShowPicker ? (
            <View style={styles.classPickerContainer}>
              <ScrollView horizontal contentContainerStyle={styles.classPickerRow} showsHorizontalScrollIndicator={false}>
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
              ? currentState.sections.map((section) => (
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
}) {
  const seenClassAnchors = React.useRef<Set<string>>(new Set());
  seenClassAnchors.current.clear();
  const { width: windowWidth } = useWindowDimensions();

  const isEntries = kind === 'entries';
  const isOrganisationResults = scope === 'organisation' && kind === 'results';
  const hasBibColumn = kind === 'starts' && section.rows.some((row) => Boolean(row.bibNumber));

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
    <View onLayout={scope === 'public' ? (event) => onAnchorLayout(`section:${section.title}`, event) : undefined} style={styles.tableSection}>
      <View style={styles.tableClassHeader}>
        <View style={styles.tableClassHeaderTopRow}>
          <Text numberOfLines={1} style={styles.tableClassHeaderText}>
            {formatSectionTitle(section)}
          </Text>
          {section.meta ? <Text style={styles.tableClassHeaderMeta}>{formatSectionMeta(section.meta)}</Text> : null}
        </View>

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
      </View>

      {section.rows.map((row, rowIndex) => {
        const classAnchorKey = row.classLabel ? `class:${row.classLabel}` : null;
        const shouldAttachClassAnchor = scope === 'organisation' && classAnchorKey && !seenClassAnchors.current.has(classAnchorKey);
        const resultStatus = kind === 'results' && row.status && row.status !== 'OK' ? formatResultStatus(row.status) : null;
        const resultMetricWidth = (columnWidths.time ?? 0) + (columnWidths.diff ?? 0) + (columnWidths.pace ?? 0);

        if (shouldAttachClassAnchor && classAnchorKey) {
          seenClassAnchors.current.add(classAnchorKey);
        }

        const RowContainer = scope === 'organisation' && isOrganisationResults ? Pressable : View;
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
            : {};

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
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableCourseColumn, { width: columnWidths.course }]}>
                {row.courseLengthLabel ?? '-'}
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
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
    backgroundColor: colors.primaryDeep,
  },
  choiceButtonAnalysis: {
    backgroundColor: '#E7F1FF',
    borderColor: '#90B5E8',
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
    color: '#2F66A8',
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
    color: '#2F66A8',
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
    backgroundColor: colors.primaryDeep,
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
    backgroundColor: '#F1F8EA',
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
  tableMetricColumn: {
    flexShrink: 0,
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
});

function estimateNameWidth(value: string) {
  return Math.max(110, Math.round(value.length * 9.2));
}

function estimateColumnWidth(values: string[], minWidth: number, maxWidth: number) {
  const estimated = Math.max(...values.map((value) => Math.round(value.length * 8.4 + 8)), minWidth);
  return Math.min(estimated, maxWidth);
}
