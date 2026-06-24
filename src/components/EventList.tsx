import * as React from 'react';

import { FlatList, ListRenderItemInfo, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { PublishedListModal, PublishedListModalState } from '@/src/components/PublishedListModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { CompetitorCountEntry } from '@/src/api/eventorApi';
import { formatDisplayDate } from '@/src/services/dateService';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

type EventListProps = {
  entryCounts?: Record<string, CompetitorCountEntry>;
  error: string | null;
  events: EventItem[];
  onRefresh: () => void;
  refreshing: boolean;
};

type EventRow =
  | { type: 'header'; key: string; date: string }
  | { type: 'event'; key: string; event: EventItem };

const CARD_HEIGHT = 78;
const CARD_GAP = 7;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;
const HEADER_HEIGHT = 34;

export function EventList({ entryCounts, error, events, onRefresh, refreshing }: EventListProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const listRef = React.useRef<FlatList<EventRow>>(null);
  const rows = React.useMemo(() => buildRows(events), [events]);
  const offsets = React.useMemo(() => buildOffsets(rows), [rows]);
  const targetIndex = React.useMemo(() => findFirstCurrentOrUpcomingIndex(rows), [rows]);
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);

  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  React.useEffect(() => {
    if (targetIndex <= 0 || !listRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: targetIndex,
        viewPosition: 0,
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [events, targetIndex]);

  return (
    <>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.content}
        data={rows}
        getItemLayout={(_, index) => ({
          index,
          length: rows[index]?.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT,
          offset: offsets[index] ?? 0,
        })}
        keyExtractor={(item) => item.key}
        onScrollToIndexFailed={({ index }) => {
          const fallbackOffset = offsets[Math.max(index - 1, 0)] ?? 0;
          listRef.current?.scrollToOffset({
            animated: false,
            offset: fallbackOffset,
          });
        }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={onRefresh} />}
        renderItem={({ item }: ListRenderItemInfo<EventRow>) => {
          if (item.type === 'header') {
            return <Text style={styles.dateHeader}>{formatDisplayDate(item.date)}</Text>;
          }
          const entryCount = entryCounts?.[item.event.id.split('::')[0]] ?? undefined;
          return (
            <View style={styles.eventRow}>
              <EventSummaryCard entryCount={entryCount} item={item.event} onOpenList={setActiveListModal} />
            </View>
          );
        }}
        ListFooterComponent={error ? <Text style={styles.footerError}>{error}</Text> : null}
        showsVerticalScrollIndicator={false}
      />

      <PublishedListModal onClose={() => setActiveListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeListModal} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
    </>
  );
}

function findFirstCurrentOrUpcomingIndex(rows: EventRow[]) {
  const today = getLocalIsoDate();

  return rows.findIndex((row) => {
    return row.type === 'header' && row.date >= today;
  });
}

function buildRows(events: EventItem[]): EventRow[] {
  const rows: EventRow[] = [];
  let lastDate: string | null = null;

  for (const event of events) {
    if (event.startDate !== lastDate) {
      lastDate = event.startDate;
      rows.push({ type: 'header', key: `header:${event.startDate}`, date: event.startDate });
    }
    rows.push({ type: 'event', key: event.id, event });
  }

  return rows;
}

function buildOffsets(rows: EventRow[]): number[] {
  const offsets: number[] = [];
  let offset = 0;

  for (const row of rows) {
    offsets.push(offset);
    offset += row.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT;
  }

  return offsets;
}

function getLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    content: {
      paddingBottom: spacing.xxl,
    },
    dateHeader: {
      ...typography.captionStrong,
      color: colors.primaryDeep,
      height: HEADER_HEIGHT,
      lineHeight: 20,
      paddingBottom: 4,
      paddingTop: 10,
      textTransform: 'capitalize',
    },
    eventRow: {
      marginBottom: CARD_GAP,
    },
    footerError: {
      ...typography.caption,
      color: colors.error,
      paddingTop: spacing.sm,
      textAlign: 'center',
    },
  });
}
