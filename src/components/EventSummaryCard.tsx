import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors, getClassificationTone } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

type EventSummaryCardProps = {
  item: EventItem;
  mode?: 'list' | 'overlay';
  onOpenList: React.Dispatch<React.SetStateAction<PublishedListModalState | null>>;
};

export function EventSummaryCard({ item, mode = 'list', onOpenList }: EventSummaryCardProps) {
  const tone = getClassificationTone(item.classificationId);
  const accentStyle = getAccentStyle(item.startDate);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);
  const isFavorite = React.useMemo(() => favoriteEvents.some((favoriteEvent) => favoriteEvent.id === item.id), [favoriteEvents, item.id]);
  const publicationIndicator = item.hasPublishedResults ? 'Resultatlista' : item.hasPublishedStarts ? 'Startlista' : null;

  const handleToggleFavorite = async () => {
    await toggleFavorite({
      classificationId: item.classificationId,
      classificationLabel: item.classificationLabel,
      dateLabel: item.dateLabel,
      hasPublishedResults: item.hasPublishedResults,
      hasPublishedStarts: item.hasPublishedStarts,
      id: item.id,
      name: item.name,
      startDate: item.startDate,
    });
  };

  return (
    <View style={[styles.card, mode === 'list' ? styles.cardList : styles.cardOverlay, isFavorite ? styles.cardFavorite : null]}>
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

      <Pressable
        onPress={() => router.push({ params: { id: item.id }, pathname: '/event/[id]' })}
        style={({ pressed }) => [styles.cardPressable, pressed ? styles.cardPressed : null]}
      >
        <View style={[styles.cardMain, mode === 'overlay' ? styles.cardMainOverlay : null]}>
          <Text numberOfLines={mode === 'list' ? 2 : 3} style={[styles.eventName, mode === 'overlay' ? styles.eventNameOverlay : null]}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.eventMeta}>{item.dateLabel}</Text>
            <View
              style={[
                styles.classificationBadge,
                mode === 'overlay' ? styles.classificationBadgeOverlay : null,
                {
                  backgroundColor: tone.badgeBackground,
                  borderColor: tone.accent,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.classificationText, mode === 'overlay' ? styles.classificationTextOverlay : null, { color: tone.badgeText }]}>
                {getShortClassificationLabel(item.classificationId)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {publicationIndicator ? (
        <Pressable
          hitSlop={6}
          onPress={() => void openPublishedListModal(publicationIndicator === 'Resultatlista' ? 'results' : 'starts', 'public', item.id, null, null, onOpenList)}
          style={[
            styles.publicationBadge,
            mode === 'list' ? styles.publicationIndicatorList : styles.publicationIndicatorOverlay,
            publicationIndicator === 'Resultatlista' ? styles.publicationBadgeResult : styles.publicationBadgeStart,
          ]}
        >
          <Text style={[styles.publicationBadgeText, mode === 'overlay' ? styles.publicationBadgeTextOverlay : null]}>{publicationIndicator}</Text>
        </Pressable>
      ) : null}

      <Pressable
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          void handleToggleFavorite();
        }}
        style={[styles.favoriteBadge, mode === 'overlay' ? styles.favoriteBadgeOverlay : null, isFavorite ? styles.favoriteBadgeActive : null]}
      >
        <Ionicons color={isFavorite ? colors.primaryDeep : colors.textSecondary} name={isFavorite ? 'star' : 'star-outline'} size={mode === 'overlay' ? 15 : 13} />
      </Pressable>
    </View>
  );
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cardList: {
    height: 60,
    marginBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
  },
  cardOverlay: {
    minHeight: 78,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 10,
  },
  cardFavorite: {
    backgroundColor: '#FFF6CF',
    borderColor: '#E7D98B',
  },
  cardPressable: {
    flex: 1,
    justifyContent: 'center',
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
    paddingRight: 54,
  },
  cardMainOverlay: {
    gap: 4,
    paddingRight: 88,
  },
  eventName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 16,
  },
  eventNameOverlay: {
    fontSize: 14,
    lineHeight: 18,
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
  classificationBadgeOverlay: {
    maxWidth: 58,
  },
  publicationBadge: {
    borderRadius: 999,
    minWidth: 74,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    right: 10,
  },
  publicationIndicatorList: {
    top: 35,
  },
  publicationIndicatorOverlay: {
    bottom: 10,
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
  publicationBadgeTextOverlay: {
    fontSize: 10,
    lineHeight: 12,
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 8,
    width: 24,
  },
  favoriteBadgeOverlay: {
    height: 28,
    width: 28,
  },
  favoriteBadgeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  classificationText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },
  classificationTextOverlay: {
    fontSize: 10,
    lineHeight: 12,
  },
});
