import * as React from 'react';

import { FlatList, ListRenderItemInfo, RefreshControl, StyleSheet, Text } from 'react-native';

import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { PublishedListModal, PublishedListModalState } from '@/src/components/PublishedListModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { CompetitorCountEntry } from '@/src/api/eventorApi';
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

const CARD_HEIGHT = 78;
const CARD_GAP = 7;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;

export function EventList({ entryCounts, error, events, onRefresh, refreshing }: EventListProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const listRef = React.useRef<FlatList<EventItem>>(null);
  const targetIndex = React.useMemo(() => findFirstCurrentOrUpcomingIndex(events), [events]);
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
        data={events}
        getItemLayout={(_, index) => ({
          index,
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
        })}
        keyExtractor={(item) => item.id}
        onScrollToIndexFailed={({ index }) => {
          const fallbackOffset = Math.max(index - 1, 0) * ITEM_HEIGHT;
          listRef.current?.scrollToOffset({
            animated: false,
            offset: fallbackOffset,
          });
        }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={onRefresh} />}
        renderItem={({ item }: ListRenderItemInfo<EventItem>) => {
          const entryCount = entryCounts?.[item.id.split('::')[0]] ?? undefined;
          return <EventSummaryCard entryCount={entryCount} item={item} onOpenList={setActiveListModal} />;
        }}
        ListFooterComponent={error ? <Text style={styles.footerError}>{error}</Text> : null}
        showsVerticalScrollIndicator={false}
      />

      <PublishedListModal onClose={() => setActiveListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeListModal} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
    </>
  );
}

function findFirstCurrentOrUpcomingIndex(events: EventItem[]) {
  const today = getLocalIsoDate();

  return events.findIndex((event) => {
    return event.startDate >= today;
  });
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
    footerError: {
      ...typography.caption,
      color: colors.error,
      paddingTop: spacing.sm,
      textAlign: 'center',
    },
  });
}
