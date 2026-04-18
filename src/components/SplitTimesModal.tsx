import * as React from 'react';

import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';

import { fetchEventSplitTimesXml, fetchEventorEventById } from '@/src/api/eventorApi';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { LoadingState } from '@/src/components/LoadingState';
import { OrganisationLabel } from '@/src/components/OrganisationLabel';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { parseEventSplitTimesXml } from '@/src/services/eventSplitTimesParser';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventSplitTimesRow, EventSplitTimesSection } from '@/src/types/eventSplitTimes';

export type SplitTimesModalState = {
  emptyMessage: string;
  error: string | null;
  eventId: string;
  eventSubtitle?: string | null;
  initialClassLabel?: string | null;
  isLoading: boolean;
  sections: EventSplitTimesSection[];
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

type SplitPage = {
  key: string;
  label: string;
  splitIndex: number | null;
};

type RowMetrics = {
  leftPlacement: string;
  splitPrimary: string;
  splitSecondary: string;
  splitTone: MetricTone;
  totalPrimary: string;
  totalSecondary: string;
  totalTone: MetricTone;
  loss: string;
  totalStatusLabel?: string;
};

type MetricTone = 'default' | 'leader' | 'podium';

type MetricsLayout = {
  pageWidth: number;
  split: number;
  total: number;
};

export function SplitTimesModal({
  onClose,
  onOpenAnalysis,
  state,
}: {
  onClose: () => void;
  onOpenAnalysis?: OpenAnalysisHandler;
  state: SplitTimesModalState | null;
}) {
  const metricsScrollRef = React.useRef<ScrollView>(null);
  const scrollRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nestedAnalysisState, setNestedAnalysisState] = React.useState<AnalysisModalState | null>(null);
  const [nestedState, setNestedState] = React.useState<PublishedListModalState | null>(null);
  const [selectedClassLabel, setSelectedClassLabel] = React.useState<string | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = React.useState(0);
  const [expandedLossRows, setExpandedLossRows] = React.useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = React.useState<PendingChoice | null>(null);
  const currentState = state;
  const favoriteClasses = usePreferencesStore((store) => store.favoriteClasses);
  const { width: windowWidth } = useWindowDimensions();
  const selectedEventRaceId = React.useMemo(() => extractSelectedEventRaceId(currentState?.eventId ?? ''), [currentState?.eventId]);

  const pickerAnchors = React.useMemo(
    () => buildPickerAnchors(currentState?.sections ?? [], favoriteClasses),
    [currentState?.sections, favoriteClasses],
  );
  const currentEventId = currentState?.eventId ?? '';

  const selectedSection = React.useMemo(
    () => currentState?.sections.find((section) => section.classLabel === selectedClassLabel) ?? currentState?.sections[0] ?? null,
    [currentState?.sections, selectedClassLabel],
  );
  const splitPages = React.useMemo(() => buildSplitPages(selectedSection), [selectedSection]);
  const pagerPages = React.useMemo(() => buildPagerPages(splitPages), [splitPages]);
  const selectedPage = splitPages[selectedPageIndex] ?? splitPages[0] ?? null;

  const tableWidth = Math.max(windowWidth, 280);
  const metricsLayout = React.useMemo(() => buildMetricsLayout(selectedSection, splitPages, tableWidth), [selectedSection, splitPages, tableWidth]);
  const leftPaneWidth = Math.max(126, tableWidth - metricsLayout.pageWidth);
  const rightPaneWidth = metricsLayout.pageWidth;
  const leftRowMetrics = React.useMemo(
    () => (selectedSection && selectedPage ? selectedSection.rows.map((row) => buildRowMetrics(selectedPage, row, selectedSection.rows)) : []),
    [selectedPage, selectedSection],
  );
  const pagerRowMetrics = React.useMemo(
    () =>
      pagerPages.map((page, pageIndex) => {
        const pageData = splitPages.length > 1 ? (pageIndex === 0 ? splitPages[splitPages.length - 1] : pageIndex === pagerPages.length - 1 ? splitPages[0] : page) : page;
        return selectedSection?.rows.map((row) => buildRowMetrics(pageData, row, selectedSection.rows)) ?? [];
      }),
    [pagerPages, selectedSection, splitPages],
  );

  React.useEffect(() => {
    setSelectedClassLabel(currentState?.initialClassLabel ?? pickerAnchors[0]?.label ?? null);
    setSelectedPageIndex(0);
    setExpandedLossRows({});
    setPendingChoice(null);
  }, [currentState?.initialClassLabel, currentState?.title, pickerAnchors]);

  React.useEffect(() => {
    if (!selectedClassLabel && pickerAnchors[0]?.label) {
      setSelectedClassLabel(pickerAnchors[0].label);
    }
  }, [pickerAnchors, selectedClassLabel]);

  React.useEffect(() => {
    return () => {
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const scrollToPagerIndex = React.useCallback(
    (pageIndex: number) => {
      const pagerIndex = splitPages.length > 1 ? pageIndex + 1 : pageIndex;
      metricsScrollRef.current?.scrollTo({ animated: false, x: pagerIndex * rightPaneWidth, y: 0 });
    },
    [rightPaneWidth, splitPages.length],
  );

  React.useEffect(() => {
    scrollToPagerIndex(0);
  }, [scrollToPagerIndex, selectedSection]);

  const handleClassPress = React.useCallback((classLabel: string) => {
    setSelectedClassLabel(classLabel);
    setSelectedPageIndex(0);
    setExpandedLossRows({});
    setToastMessage(null);
    scrollToPagerIndex(0);
  }, [scrollToPagerIndex]);

  const handlePreviousPage = React.useCallback(() => {
    if (splitPages.length === 0) {
      return;
    }

    const nextIndex = selectedPageIndex <= 0 ? splitPages.length - 1 : selectedPageIndex - 1;
    setSelectedPageIndex(nextIndex);
    scrollToPagerIndex(nextIndex);
  }, [scrollToPagerIndex, selectedPageIndex, splitPages.length]);

  const handleNextPage = React.useCallback(() => {
    if (splitPages.length === 0) {
      return;
    }

    const nextIndex = selectedPageIndex >= splitPages.length - 1 ? 0 : selectedPageIndex + 1;
    setSelectedPageIndex(nextIndex);
    scrollToPagerIndex(nextIndex);
  }, [scrollToPagerIndex, selectedPageIndex, splitPages.length]);

  const handlePageScrollEnd = React.useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (splitPages.length <= 1) {
        return;
      }

      const displayIndex = Math.max(0, Math.min(pagerPages.length - 1, Math.round(event.nativeEvent.contentOffset.x / rightPaneWidth)));

      if (displayIndex === 0) {
        const nextIndex = splitPages.length - 1;
        setSelectedPageIndex(nextIndex);
        scrollToPagerIndex(nextIndex);
        return;
      }

      if (displayIndex === pagerPages.length - 1) {
        setSelectedPageIndex(0);
        scrollToPagerIndex(0);
        return;
      }

      setSelectedPageIndex(displayIndex - 1);
    },
    [pagerPages.length, scrollToPagerIndex, splitPages.length],
  );

  const handlePagerDragEnd = React.useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (splitPages.length <= 1) {
        return;
      }

      const displayIndex = Math.max(0, Math.min(pagerPages.length - 1, Math.round(event.nativeEvent.contentOffset.x / rightPaneWidth)));

      if (displayIndex === 0) {
        const nextIndex = splitPages.length - 1;
        setSelectedPageIndex(nextIndex);
        scrollToPagerIndex(nextIndex);
        return;
      }

      if (displayIndex === pagerPages.length - 1) {
        setSelectedPageIndex(0);
        scrollToPagerIndex(0);
        return;
      }

      setSelectedPageIndex(displayIndex - 1);
    },
    [pagerPages.length, rightPaneWidth, scrollToPagerIndex, splitPages.length],
  );

  const toggleLossRow = React.useCallback((rowKey: string) => {
    setExpandedLossRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }));
  }, []);

  const showNoLossToast = React.useCallback(() => {
    setToastMessage('Ingen tidsförlust på denna sträcka.');

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const handleTimePress = React.useCallback(
    (hasLoss: boolean, rowKey: string) => {
      if (hasLoss) {
        toggleLossRow(rowKey);
        return;
      }

      showNoLossToast();
    },
    [showNoLossToast, toggleLossRow],
  );

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
                <Text style={styles.modalCloseIcon}>×</Text>
                <Text style={styles.modalCloseText}>Stäng</Text>
              </Pressable>
            </View>
            {currentState?.eventSubtitle ? (
              <Text numberOfLines={2} style={styles.modalSubtitle}>
                {currentState.eventSubtitle}
              </Text>
            ) : null}
          </View>

          {pickerAnchors.length > 1 ? (
            <View style={styles.classPickerContainer}>
              <ScrollView horizontal contentContainerStyle={styles.classPickerRow} showsHorizontalScrollIndicator={false}>
                {pickerAnchors.map((anchor) => (
                  <Pressable
                    key={anchor.key}
                    onPress={() => handleClassPress(anchor.label)}
                    style={[styles.classChip, selectedClassLabel === anchor.label ? styles.classChipActive : null]}
                  >
                    <Text style={[styles.classChipText, selectedClassLabel === anchor.label ? styles.classChipTextActive : null]}>{anchor.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.listModalContent}>
            {currentState?.isLoading ? <LoadingState label="Hämtar sträcktider..." /> : null}
            {currentState?.error ? <Text style={styles.documentsErrorText}>{currentState.error}</Text> : null}
            {!currentState?.isLoading && !currentState?.error && currentState?.sections.length === 0 ? (
              <Text style={styles.sectionText}>{currentState.emptyMessage}</Text>
            ) : null}

            {!currentState?.isLoading && !currentState?.error && selectedSection && selectedPage ? (
              <>
                <View style={[styles.tableSection, { width: tableWidth }]}>
                  <View style={styles.tableClassHeader}>
                    <View style={[styles.tableClassHeaderTopRow, { width: tableWidth }]}>
                      <Text numberOfLines={1} style={[styles.tableClassHeaderText, { width: leftPaneWidth }]}>
                        {selectedSection.classLabel}
                        {selectedSection.classLengthLabel ? ` - ${selectedSection.classLengthLabel}` : ''}
                      </Text>
                      <View style={[styles.tableClassHeaderPageNav, { width: rightPaneWidth }]}>
                        <Pressable onPress={handlePreviousPage} hitSlop={10} style={[styles.metricHeaderArrowButton, styles.metricHeaderArrowLeft]}>
                          <Text style={styles.metricHeaderArrow}>{'<'}</Text>
                        </Pressable>
                        <Text numberOfLines={1} style={styles.tableClassHeaderPage}>
                          {selectedPage.label}
                        </Text>
                        <Pressable onPress={handleNextPage} hitSlop={10} style={[styles.metricHeaderArrowButton, styles.metricHeaderArrowRight]}>
                          <Text style={styles.metricHeaderArrow}>{'>'}</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={[styles.tableColumnHeaderRow, { width: tableWidth }]}>
                      <View style={[styles.leftHeaderBlock, { width: leftPaneWidth }]}>
                        <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.rankColumn]}>
                          #
                        </Text>
                        <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.nameColumn]}>
                          Namn/klubb
                        </Text>
                      </View>

                      <View style={[styles.metricHeaderBlock, { width: rightPaneWidth }]}>
                        <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.metricHeader, { width: metricsLayout.split }]}>
                          Sträcka
                        </Text>
                        <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.metricHeader, { width: metricsLayout.total }]}>
                          Totalt
                        </Text>
                      </View>
                    </View>
                  </View>

                  <ScrollView
                    nestedScrollEnabled
                    style={styles.tableBodyScroll}
                    contentContainerStyle={{ width: tableWidth, flexGrow: 1 }}
                    showsVerticalScrollIndicator
                  >
                    <View style={[styles.bodyTable, { width: tableWidth, flexGrow: 1 }]}>
                      <View style={[styles.leftPane, { width: leftPaneWidth }]}>
                      {selectedSection.rows.map((row, rowIndex) => (
                        <SplitTimesClassRow
                          key={`left-${selectedPage.key}-${rowIndex}-${row.primary}`}
                          computed={leftRowMetrics[rowIndex]}
                          eventId={currentEventId}
                          onOpenAnalysis={onOpenAnalysis}
                          onOpenAnalysisChoice={setPendingChoice}
                          onOpenOrganisation={setNestedState}
                          selectedEventRaceId={selectedEventRaceId}
                          row={row}
                          rowIndex={rowIndex}
                        />
                      ))}
                    </View>

                      <ScrollView
                        horizontal
                        pagingEnabled
                        ref={metricsScrollRef}
                        onScrollEndDrag={handlePagerDragEnd}
                        onMomentumScrollEnd={handlePageScrollEnd}
                        showsHorizontalScrollIndicator={false}
                        style={[styles.metricsPager, { width: rightPaneWidth }]}
                        contentContainerStyle={{ width: rightPaneWidth * pagerPages.length }}
                        decelerationRate="fast"
                      >
        {pagerPages.map((page, pageIndex) => (
                          <View key={`${page.key}-${pageIndex}`} style={[styles.metricsPage, { width: rightPaneWidth }]}>
                            {selectedSection.rows.map((row, rowIndex) => {
                              const computed = pagerRowMetrics[pageIndex]?.[rowIndex];
                              const rowKey = getSplitRowKey(page.key, row);
                              const showLoss = Boolean(computed.loss && computed.loss !== '-');
                              const isExpanded = expandedLossRows[rowKey] ?? false;

                              return (
                                <SplitTimesMetricRow
                                  key={`right-${page.key}-${rowIndex}-${row.primary}`}
                                  computed={computed}
                                  isExpanded={isExpanded}
                                  lossHighlight={showLoss}
                                  onToggleLoss={() => handleTimePress(showLoss, rowKey)}
                                  pageKey={page.key}
                                  pageMetricsLayout={metricsLayout}
                                  row={row}
                                  rowIndex={rowIndex}
                                />
                              );
                            })}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </ScrollView>
                </View>
              </>
            ) : null}
          </View>
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
                        selectedEventRaceId,
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
        {toastMessage ? (
          <View pointerEvents="none" style={styles.metricToastContainer}>
            <View style={styles.metricToast}>
              <Text style={styles.metricToastText}>{toastMessage}</Text>
            </View>
          </View>
        ) : null}
    </Modal>
  );
}

function MetricCell({
  title,
  subtitle,
  style,
  tone = 'default',
  lossHighlight = false,
  showLossDot = false,
  onPress,
}: {
  title: string;
  subtitle: string;
  style: StyleProp<ViewStyle>;
  tone?: MetricTone;
  lossHighlight?: boolean;
  showLossDot?: boolean;
  onPress?: () => void;
}) {
  const toneStyle = tone === 'leader' ? styles.metricTextLeader : tone === 'podium' ? styles.metricTextPodium : null;
  const headlineStyle = lossHighlight ? styles.metricSplitLossHeadline : styles.metricHeadline;
  const valueStyle = lossHighlight ? styles.metricSplitLossValue : styles.metricValue;
  const content = (
    <>
      <Text numberOfLines={1} style={[headlineStyle, toneStyle]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[valueStyle, toneStyle]}>
        {subtitle}
        {showLossDot ? <Text style={styles.metricLossDot}> •</Text> : null}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.metricCell, style, styles.metricCellPressable]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.metricCell, style]}>{content}</View>;
}

const SplitTimesClassRow = React.memo(function SplitTimesClassRow({
  computed,
  eventId,
  onOpenAnalysis,
  onOpenAnalysisChoice,
  onOpenOrganisation,
  selectedEventRaceId,
  row,
  rowIndex,
}: {
  computed: RowMetrics;
  eventId: string;
  onOpenAnalysis?: OpenAnalysisHandler;
  onOpenAnalysisChoice: (choice: PendingChoice) => void;
  onOpenOrganisation: React.Dispatch<React.SetStateAction<PublishedListModalState | null>>;
  selectedEventRaceId: string | null;
  row: EventSplitTimesRow;
  rowIndex: number;
}) {
  const handleNamePress = React.useCallback(() => {
    if (row.organisationId && row.personId && onOpenAnalysis) {
      onOpenAnalysisChoice({
        classLabel: row.classLabel,
        eventId,
        organisationId: row.organisationId,
        organisationLabel: row.organisation ?? null,
        personId: row.personId,
        personLabel: row.primary,
      });
      return;
    }

    if (row.organisationId) {
      void openPublishedListModal('results', 'organisation', eventId, row.organisationId, row.organisation ?? null, onOpenOrganisation, null, selectedEventRaceId);
    }
  }, [eventId, onOpenAnalysis, onOpenAnalysisChoice, onOpenOrganisation, row.classLabel, row.organisation, row.organisationId, row.personId, row.primary, selectedEventRaceId]);

  return (
    <View style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}>
      <Text numberOfLines={1} style={[styles.cell, styles.rankColumn, styles.rankText]}>
        {computed.leftPlacement}
      </Text>
      <Pressable disabled={!row.organisationId} onPress={handleNamePress} style={styles.nameCell}>
        <Text numberOfLines={1} style={[styles.cell, styles.primaryName]}>
          {row.primary}
        </Text>
        <OrganisationLabel label={row.organisation} organisationId={row.organisationId} logoSize={13} textStyle={[styles.cell, styles.clubName]} />
      </Pressable>
    </View>
  );
});

const SplitTimesMetricRow = React.memo(function SplitTimesMetricRow({
  computed,
  isExpanded,
  lossHighlight,
  onToggleLoss,
  pageKey,
  pageMetricsLayout,
  row,
  rowIndex,
}: {
  computed: RowMetrics;
  isExpanded: boolean;
  lossHighlight: boolean;
  onToggleLoss?: () => void;
  pageKey: string;
  pageMetricsLayout: MetricsLayout;
  row: EventSplitTimesRow;
  rowIndex: number;
}) {
  const splitTitle = pageKey === 'total' ? '' : computed.splitPrimary;
  const splitSubtitle = pageKey === 'total' ? '' : computed.splitSecondary;

  return (
    <View style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}>
      {isExpanded ? (
        <Pressable
          onPress={onToggleLoss}
          style={[
            styles.metricMergedCell,
            styles.metricMergedCellLoss,
            { width: pageMetricsLayout.split + pageMetricsLayout.total },
          ]}
        >
          <Text numberOfLines={1} style={[styles.metricLossHeadline, styles.metricHeadlineCenter]}>
            {lossHighlight ? computed.loss : ''}
          </Text>
        </Pressable>
      ) : (
        <>
          <MetricCell
            title={splitTitle}
            subtitle={splitSubtitle}
            style={[styles.metricColumn, { width: pageMetricsLayout.split }]}
            tone={computed.splitTone}
            lossHighlight={lossHighlight}
            showLossDot={lossHighlight && Boolean(splitSubtitle)}
            onPress={onToggleLoss}
          />
          {pageKey === 'total' && computed.totalStatusLabel ? (
            <View style={[styles.metricColumn, styles.metricColumnStatus, { width: pageMetricsLayout.total }]}>
              <Text numberOfLines={1} style={styles.metricStatusText}>
                {computed.totalStatusLabel}
              </Text>
            </View>
          ) : (
            <MetricCell
              title={computed.totalPrimary}
              subtitle={computed.totalSecondary}
              style={[styles.metricColumn, { width: pageMetricsLayout.total }]}
              tone={computed.totalTone}
              lossHighlight={false}
              onPress={onToggleLoss}
            />
          )}
        </>
      )}
    </View>
  );
});

function buildSplitPages(section: EventSplitTimesSection | null): SplitPage[] {
  if (!section) {
    return [];
  }

  const splitCount = section.rows.reduce((max, row) => Math.max(max, row.splitCount), 0);
  const pages: SplitPage[] = [{ key: 'total', label: 'Totalt', splitIndex: null }];

  for (let index = 1; index <= splitCount; index += 1) {
    pages.push({
      key: `split-${index}`,
      label: index === splitCount ? 'Mål' : `Sträcka ${index}`,
      splitIndex: index,
    });
  }

  return pages;
}

function buildPagerPages(pages: SplitPage[]): SplitPage[] {
  if (pages.length <= 1) {
    return pages;
  }

  return [pages[pages.length - 1], ...pages, pages[0]];
}

function buildMetricsLayout(section: EventSplitTimesSection | null, pages: SplitPage[], tableWidth: number): MetricsLayout {
  if (!section || pages.length === 0) {
    return {
      pageWidth: 186,
      split: 93,
      total: 93,
    };
  }

  const computedRows = pages.flatMap((page) => section.rows.map((row) => buildRowMetrics(page, row, section.rows)));

  const split = estimateMetricColumnWidth(['Sträcka', ...computedRows.flatMap((row) => [row.splitPrimary, row.splitSecondary])], 68, 108);
  const total = estimateMetricColumnWidth(['Totalt', ...computedRows.flatMap((row) => [row.totalPrimary, row.totalSecondary])], 68, 108);
  const maxPageWidth = Math.max(150, tableWidth - 126);
  const rawPageWidth = split + total;

  if (rawPageWidth <= maxPageWidth) {
    return {
      pageWidth: rawPageWidth,
      split,
      total,
    };
  }

  const scale = maxPageWidth / rawPageWidth;
  const scaledSplit = Math.max(60, Math.floor(split * scale));
  const scaledTotal = Math.max(60, Math.floor(total * scale));

  return {
    pageWidth: scaledSplit + scaledTotal,
    split: scaledSplit,
    total: scaledTotal,
  };
}

function buildRowMetrics(page: SplitPage, row: EventSplitTimesRow, allRows: EventSplitTimesRow[]): RowMetrics {
  if (page.key === 'total' || page.splitIndex === null) {
    return buildTotalMetrics(row, allRows);
  }

  return buildSplitMetrics(page.splitIndex, row, allRows);
}

function buildTotalMetrics(row: EventSplitTimesRow, allRows: EventSplitTimesRow[]): RowMetrics {
  const totalTime = row.totalTimeSeconds;
  const statusLabel = formatStatus(row.status);

  if (row.status && row.status !== 'OK') {
    return {
      leftPlacement: row.totalPosition ?? row.position ?? '-',
      loss: '',
      splitPrimary: '',
      splitSecondary: '',
      splitTone: 'default',
      totalPrimary: '',
      totalSecondary: '',
      totalTone: 'default',
      totalStatusLabel: statusLabel,
    };
  }

  if (totalTime === null || totalTime <= 0) {
    return {
      leftPlacement: row.totalPosition ?? row.position ?? '-',
      loss: '-',
      splitPrimary: '',
      splitSecondary: '',
      splitTone: 'default',
      totalPrimary: '-',
      totalSecondary: '',
      totalTone: 'default',
    };
  }

  const totalLoss = row.totalLossSeconds;
  const totalRank = getRankForValue(allRows, (candidate) => candidate.totalTimeSeconds, totalTime);
  const leaderTime = getLeaderValue(allRows, (candidate) => candidate.totalTimeSeconds);
  const secondBestTime = getNthValue(allRows, (candidate) => candidate.totalTimeSeconds, 2);
  const behind = leaderTime !== null ? Math.max(0, totalTime - leaderTime) : null;
  const timeLabel = formatDuration(totalTime);
  const totalRankNumber = Number(totalRank);
  const totalTone = totalRankNumber === 1 ? 'leader' : totalRankNumber === 2 || totalRankNumber === 3 ? 'podium' : 'default';
  const behindLabel = totalRankNumber === 1 && secondBestTime !== null ? formatTimeDelta(secondBestTime - totalTime) : behind !== null ? `+${formatDuration(behind)}` : '';

  return {
    leftPlacement: row.totalPosition ?? row.position ?? '-',
    loss: formatLossSeconds(totalLoss),
    splitPrimary: `${timeLabel} (${totalRank})`,
    splitSecondary: behindLabel,
    splitTone: totalTone,
    totalPrimary: `${timeLabel} (${totalRank})`,
    totalSecondary: behindLabel,
    totalTone,
  };
}

function buildSplitMetrics(splitIndex: number, row: EventSplitTimesRow, allRows: EventSplitTimesRow[]): RowMetrics {
  const currentSplit = getSplitTime(row, splitIndex);
  const currentTotal = getSplitCumulative(row, splitIndex);
  const valid = currentSplit !== null && currentTotal !== null;
  const firstInvalidSplitIndex = getFirstInvalidSplitIndex(row);
  const totalsInvalidFromHere = firstInvalidSplitIndex !== null && splitIndex >= firstInvalidSplitIndex;

  if (!valid) {
    return {
      leftPlacement: row.totalPosition ?? row.position ?? '-',
      loss: '-',
      splitPrimary: '-',
      splitSecondary: '',
      splitTone: 'default',
      totalPrimary: '-',
      totalSecondary: '',
      totalTone: 'default',
    };
  }

  const splitRank = getRankForValue(allRows, (candidate) => getSplitTime(candidate, splitIndex), currentSplit);
  const totalRank = getRankForValue(allRows, (candidate) => getSplitCumulative(candidate, splitIndex), currentTotal);
  const splitRankNumber = Number(splitRank);
  const totalRankNumber = Number(totalRank);

  const splitLeader = getLeaderValue(allRows, (candidate) => getSplitTime(candidate, splitIndex));
  const totalLeader = getLeaderValue(allRows, (candidate) => getSplitCumulative(candidate, splitIndex));
  const splitSecondBest = getNthValue(allRows, (candidate) => getSplitTime(candidate, splitIndex), 2);
  const totalSecondBest = getNthValue(allRows, (candidate) => getSplitCumulative(candidate, splitIndex), 2);

  const splitBehind = splitLeader !== null ? Math.max(0, currentSplit - splitLeader) : null;
  const totalBehind = totalLeader !== null ? Math.max(0, currentTotal - totalLeader) : null;
  const splitTone = splitRankNumber === 1 ? 'leader' : splitRankNumber === 2 || splitRankNumber === 3 ? 'podium' : 'default';
  const totalTone = totalRankNumber === 1 ? 'leader' : totalRankNumber === 2 || totalRankNumber === 3 ? 'podium' : 'default';
  const splitLoss = row.splitLossSeconds[splitIndex - 1] ?? null;

  return {
    leftPlacement: row.totalPosition ?? row.position ?? '-',
    loss: formatLossSeconds(splitLoss),
    splitPrimary: `${formatDuration(currentSplit)} (${splitRank})`,
    splitSecondary: splitRankNumber === 1 && splitSecondBest !== null ? formatTimeDelta(splitSecondBest - currentSplit) : splitBehind !== null ? `+${formatDuration(splitBehind)}` : '',
    splitTone,
    totalPrimary: totalsInvalidFromHere ? '-' : `${formatDuration(currentTotal)} (${totalRank})`,
    totalSecondary: totalsInvalidFromHere ? '' : totalRankNumber === 1 && totalSecondBest !== null ? formatTimeDelta(totalSecondBest - currentTotal) : totalBehind !== null ? `+${formatDuration(totalBehind)}` : '',
    totalTone,
  };
}

function getFirstInvalidSplitIndex(row: EventSplitTimesRow) {
  let previous = 0;

  for (let index = 0; index < row.splitCumulativeSeconds.length; index += 1) {
    const current = row.splitCumulativeSeconds[index];
    if (!Number.isFinite(current) || current <= previous) {
      return index + 1;
    }
    previous = current;
  }

  return null;
}

function getRankForValue(
  allRows: EventSplitTimesRow[],
  selector: (row: EventSplitTimesRow) => number | null,
  current: number,
) {
  const values = allRows
    .map(selector)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  const rank = values.findIndex((value) => value === current);
  return rank >= 0 ? `${rank + 1}` : '-';
}

function getLeaderValue(allRows: EventSplitTimesRow[], selector: (row: EventSplitTimesRow) => number | null) {
  const values = allRows
    .map(selector)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  return values[0] ?? null;
}

function getNthValue(allRows: EventSplitTimesRow[], selector: (row: EventSplitTimesRow) => number | null, nth: number) {
  const values = allRows
    .map(selector)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  return values[nth - 1] ?? null;
}

function getSplitCumulative(row: EventSplitTimesRow, splitIndex: number) {
  const value = row.splitCumulativeSeconds[splitIndex - 1];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getSplitTime(row: EventSplitTimesRow, splitIndex: number) {
  const current = getSplitCumulative(row, splitIndex);
  const previous = splitIndex === 1 ? 0 : getSplitCumulative(row, splitIndex - 1) ?? 0;

  if (current === null || current <= previous) {
    return null;
  }

  return current - previous;
}

function formatLossSeconds(lossSeconds: number | null) {
  if (lossSeconds === null) {
    return '-';
  }

  if (lossSeconds <= 0) {
    return '';
  }

  return `+${formatDuration(lossSeconds)}`;
}

function getSplitRowKey(pageKey: string, row: EventSplitTimesRow) {
  return [
    pageKey,
    row.totalPosition ?? row.position ?? '',
    row.primary,
    row.organisationId ?? row.organisation,
    row.bibNumber ?? '',
  ].join('|');
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeDelta(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '-';
  }

  if (totalSeconds === 0) {
    return '0.00';
  }

  return `-${formatDuration(totalSeconds)}`;
}

function formatStatus(status?: string) {
  if (!status) {
    return '-';
  }

  const normalized = status.trim();
  const statusMap: Record<string, string> = {
    Cancelled: 'Återb.',
    Disqualified: 'Disk.',
    DidNotFinish: 'Utgått',
    DidNotStart: 'Ej start',
    MissingPunch: 'Felst.',
  };

  return statusMap[normalized] ?? normalized;
}

function buildPickerAnchors(sections: EventSplitTimesSection[], favoriteClasses: string[]): PickerAnchor[] {
  return sortPickerAnchors(
    sections.map((section) => ({
      key: `class:${section.classLabel}`,
      label: section.classLabel,
    })),
    favoriteClasses,
  );
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

    return left.label.localeCompare(right.label, 'sv');
  });
}

function normalizeClassLabel(label: string) {
  return label.replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv');
}

function estimateNameWidth(value: string) {
  return Math.max(110, Math.round(value.length * 9.2));
}

function estimateMetricColumnWidth(values: string[], minWidth: number, maxWidth: number) {
  const estimated = Math.max(...values.map((value) => Math.round(value.length * 8 + 10)), minWidth);
  return Math.min(estimated, maxWidth);
}

function estimateColumnWidth(values: string[], minWidth: number, maxWidth: number) {
  const estimated = Math.max(...values.map((value) => Math.round(value.length * 8.4 + 8)), minWidth);
  return Math.min(estimated, maxWidth);
}

export async function openEventSplitTimesModal(
  eventId: string,
  setState: React.Dispatch<React.SetStateAction<SplitTimesModalState | null>>,
  initialClassLabel?: string | null,
  title = 'Sträcktider',
) {
  const selectedEventRaceId = extractSelectedEventRaceId(eventId);
  setState({
    emptyMessage: 'Inga sträcktider hittades.',
    error: null,
    eventId,
    eventSubtitle: null,
    initialClassLabel: initialClassLabel ?? null,
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
      emptyMessage: 'Inga sträcktider hittades.',
      error: null,
      eventId,
      eventSubtitle: eventDetail ? `${eventDetail.name} • ${eventDetail.dateLabel}` : null,
      initialClassLabel: initialClassLabel ?? null,
      isLoading: false,
      sections,
      title,
    });
  } catch (loadError) {
    setState({
      emptyMessage: 'Inga sträcktider hittades.',
      error: loadError instanceof Error ? loadError.message : 'Det gick inte att hämta sträcktiderna.',
      eventId,
      eventSubtitle: null,
      initialClassLabel: initialClassLabel ?? null,
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

const styles = StyleSheet.create({
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
  classChipText: {
    color: colors.textPrimary,
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 14,
    lineHeight: 17,
  },
  classChipTextActive: {
    color: colors.heroText,
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
  clubName: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 15,
  },
  cell: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
  },
  documentsErrorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  headerCell: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 12,
    lineHeight: 14,
  },
  leftHeaderBlock: {
    flexDirection: 'row',
    paddingRight: 8,
  },
  leftPane: {
    flexShrink: 0,
  },
  listModalContent: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  lossColumn: {
    flexShrink: 0,
    minWidth: 0,
  },
  lossHeader: {
    flexShrink: 0,
    minWidth: 0,
  },
  metricCell: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 1,
  },
  metricCellPressable: {
    borderRadius: 8,
  },
  metricCellLoss: {
    backgroundColor: 'rgba(196, 54, 54, 0.10)',
    borderRadius: 8,
  },
  metricColumn: {
    flexShrink: 0,
    minWidth: 0,
  },
  metricHeadline: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'left',
  },
  metricTextLeader: {
    color: colors.error,
  },
  metricTextPodium: {
    color: '#2F6FB8',
  },
  metricToast: {
    backgroundColor: '#F8E8E8',
    borderColor: 'rgba(196, 54, 54, 0.45)',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  metricToastContainer: {
    bottom: spacing.lg,
    elevation: 20,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 20,
  },
  metricToastText: {
    ...typography.caption,
    color: colors.error,
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  metricHeadlineCenter: {
    textAlign: 'center',
  },
  metricSplitLossHeadline: {
    ...typography.captionStrong,
    fontFamily: 'Manrope_700Bold',
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'left',
  },
  metricLossHeadline: {
    ...typography.captionStrong,
    fontFamily: 'Manrope_700Bold',
    color: colors.error,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'left',
  },
  metricHeader: {
    flexShrink: 0,
    minWidth: 0,
    textAlign: 'left',
  },
  metricHeaderArrow: {
    ...typography.bodyStrong,
    color: colors.heroText,
    fontSize: 15,
    lineHeight: 17,
  },
  metricHeaderArrowButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    width: 24,
    top: 0,
    bottom: 0,
  },
  metricHeaderArrowLeft: {
    left: 40,
  },
  metricHeaderArrowRight: {
    right: 40,
  },
  metricHeaderBlock: {
    flexDirection: 'row',
  },
  metricValue: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 15,
    textAlign: 'left',
  },
  metricColumnStatus: {
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  metricStatusText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 16,
    textAlign: 'right',
  },
  metricValueCenter: {
    textAlign: 'center',
  },
  metricSplitLossValue: {
    ...typography.captionStrong,
    fontFamily: 'Manrope_700Bold',
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 15,
    textAlign: 'left',
  },
  metricLossValue: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 15,
    textAlign: 'left',
  },
  metricLossDot: {
    color: colors.error,
  },
  metricMergedCell: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
  },
  metricMergedCellLoss: {
    backgroundColor: 'rgba(196, 54, 54, 0.10)',
    borderRadius: 8,
  },
  metricsPager: {
    flexShrink: 0,
  },
  metricsPage: {
    flexDirection: 'column',
  },
  modalBackdrop: {
    flex: 1,
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
  modalCloseIcon: {
    color: colors.primaryDeep,
    fontSize: 15,
    lineHeight: 15,
  },
  modalCloseText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
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
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '86%',
    position: 'relative',
    overflow: 'hidden',
  },
  modalTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  modalSubtitle: {
    ...typography.buttonSmall,
    alignSelf: 'flex-start',
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
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
  choiceButtonAnalysis: {
    backgroundColor: '#E7F1FF',
    borderColor: '#90B5E8',
    borderWidth: 1,
  },
  choiceButtonLabel: {
    ...typography.buttonSmall,
    color: colors.heroText,
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
  },
  choiceButtonLabelAnalysis: {
    ...typography.buttonSmall,
    color: '#2F66A8',
    fontSize: 16,
    lineHeight: 19,
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
    alignSelf: 'stretch',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  choiceButtonClubRow: {
    alignSelf: 'center',
    justifyContent: 'center',
  },
  choiceButtonClubText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'center',
  },
  choiceButtonPersonText: {
    ...typography.captionStrong,
    color: '#2F66A8',
    fontSize: 14,
    lineHeight: 17,
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
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    justifyContent: 'center',
  },
  choiceTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  nameCell: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
  },
  primaryName: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
  },
  rankColumn: {
    flexShrink: 0,
    width: 30,
  },
  rankText: {
    textAlignVertical: 'top',
  },
  sectionText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  tableClassHeaderPage: {
    ...typography.bodyStrong,
    color: colors.heroText,
    fontSize: 15,
    lineHeight: 18,
    flex: 1,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  tableClassHeaderPageNav: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 0,
    position: 'relative',
  },
  tableClassHeaderText: {
    ...typography.bodyStrong,
    color: colors.heroText,
    flex: 1,
    fontSize: 15,
    lineHeight: 18,
    paddingRight: spacing.sm,
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
  tableHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  tableSection: {
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    alignSelf: 'stretch',
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
  tableRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tableRowEven: {
    backgroundColor: colors.surface,
  },
  tableRowOdd: {
    backgroundColor: '#F1F8EA',
  },
  bodyTable: {
    flex: 1,
    flexDirection: 'row',
  },
  tableBodyScroll: {
    flex: 1,
  },
});
