import * as React from 'react';

import { router } from 'expo-router';
import { FlatList, ListRenderItemInfo, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { colors, getClassificationTone } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

type EventListProps = {
  error: string | null;
  events: EventItem[];
  onRefresh: () => void;
  refreshing: boolean;
};

const CARD_HEIGHT = 60;
const CARD_GAP = 7;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;

export function EventList({ error, events, onRefresh, refreshing }: EventListProps) {
  const listRef = React.useRef<FlatList<EventItem>>(null);
  const targetIndex = React.useMemo(() => findFirstCurrentOrUpcomingIndex(events), [events]);

  React.useEffect(() => {
    if (targetIndex <= 0 || !listRef.current) {
      return;
    }

    console.log('[Calendar] Auto-scroll to first current/upcoming event', {
      eventId: events[targetIndex]?.id,
      index: targetIndex,
      startDate: events[targetIndex]?.startDate,
    });

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
      renderItem={({ item }: ListRenderItemInfo<EventItem>) => <EventCard item={item} />}
      ListFooterComponent={error ? <Text style={styles.footerError}>{error}</Text> : null}
      showsVerticalScrollIndicator={false}
    />
  );
}

function EventCard({ item }: { item: EventItem }) {
  const tone = getClassificationTone(item.classificationId);
  const accentStyle = getAccentStyle(item.startDate);
  const hasIndicators = item.hasPublishedResults || item.hasPublishedStarts;

  return (
    <Pressable
      onPress={() => router.push({ params: { id: item.id }, pathname: '/event/[id]' })}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View
        style={[
          styles.cardAccent,
          {
            backgroundColor: accentStyle.backgroundColor,
            borderColor: accentStyle.borderColor,
            borderWidth: accentStyle.borderWidth,
          },
        ]}
      />

      <View style={styles.cardMain}>
        <Text numberOfLines={2} style={styles.eventName}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.eventMeta}>{item.dateLabel}</Text>
          <View
            style={[
              styles.classificationBadge,
              {
                backgroundColor: tone.badgeBackground,
                borderColor: tone.accent,
              },
            ]}
          >
            <Text numberOfLines={1} style={[styles.classificationText, { color: tone.badgeText }]}>
              {getShortClassificationLabel(item.classificationId)}
            </Text>
          </View>
        </View>
      </View>

      {hasIndicators ? (
        <View style={styles.publicationIndicators}>
          {item.hasPublishedStarts ? (
            <View style={[styles.publicationBadge, styles.publicationBadgeStart]}>
              <Text style={styles.publicationBadgeText}>S</Text>
            </View>
          ) : null}
          {item.hasPublishedResults ? (
            <View style={[styles.publicationBadge, styles.publicationBadgeResult]}>
              <Text style={styles.publicationBadgeText}>R</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function findFirstCurrentOrUpcomingIndex(events: EventItem[]) {
  const today = getLocalIsoDate();

  return events.findIndex((event) => {
    return event.startDate >= today;
  });
}

function getAccentStyle(startDate: string) {
  const today = getLocalIsoDate();
  const isPast = startDate < today;
  const isToday = startDate === today;
  const eventDate = new Date(`${startDate}T12:00:00`);
  const dayOfWeek = eventDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isPast) {
    return {
      backgroundColor: colors.surface,
      borderColor: colors.accentLinePastBorder,
      borderWidth: 1,
    };
  }

  if (isToday) {
    return {
      backgroundColor: colors.accentLineToday,
      borderColor: colors.accentLineToday,
      borderWidth: 0,
    };
  }

  if (isWeekend) {
    return {
      backgroundColor: colors.accentLineWeekend,
      borderColor: colors.accentLineWeekend,
      borderWidth: 0,
    };
  }

  return {
    backgroundColor: colors.accentLineWeekday,
    borderColor: colors.accentLineWeekday,
    borderWidth: 0,
  };
}

function getLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getShortClassificationLabel(classificationId: number) {
  if (classificationId === 1) {
    return 'Mäst.';
  }

  if (classificationId === 2) {
    return 'Nat.';
  }

  if (classificationId === 3) {
    return 'Dist.';
  }

  if (classificationId === 4) {
    return 'När.';
  }

  if (classificationId === 5) {
    return 'Klubb';
  }

  if (classificationId === 6) {
    return 'Int.';
  }

  return `Typ ${classificationId}`;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: CARD_HEIGHT,
    justifyContent: 'center',
    marginBottom: CARD_GAP,
    overflow: 'hidden',
    paddingLeft: 12,
    paddingRight: 12,
    position: 'relative',
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardAccent: {
    borderRadius: 999,
    bottom: 8,
    left: 12,
    position: 'absolute',
    top: 8,
    width: 6,
  },
  cardMain: {
    gap: 2,
    paddingLeft: 16,
    paddingRight: 44,
  },
  eventName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 16,
  },
  eventMeta: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 14,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  classificationBadge: {
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 52,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  publicationIndicators: {
    alignItems: 'flex-end',
    gap: 4,
    position: 'absolute',
    right: 12,
    top: 8,
  },
  publicationBadge: {
    borderRadius: 999,
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  publicationBadgeStart: {
    backgroundColor: '#E4F4D5',
    borderColor: colors.primary,
    borderWidth: 1,
  },
  publicationBadgeResult: {
    backgroundColor: '#F6D94B',
    borderColor: colors.primary,
    borderWidth: 1,
  },
  publicationBadgeText: {
    color: colors.textPrimary,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },
  classificationText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },
  footerError: {
    ...typography.caption,
    color: colors.error,
    paddingTop: spacing.sm,
    textAlign: 'center',
  },
});
