import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { getClassificationTone } from '@/src/theme/colors';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';
import { CompetitorCountEntry } from '@/src/api/eventorApi';
import { normalizeEventId } from '@/src/utils/eventId';

type EventSummaryCardProps = {
  entryCount?: CompetitorCountEntry;
  item: EventItem;
  mode?: 'list' | 'overlay';
  onOpenList: React.Dispatch<React.SetStateAction<PublishedListModalState | null>>;
};

export function EventSummaryCard({ entryCount, item, mode = 'list', onOpenList }: EventSummaryCardProps) {
  const pathname = usePathname();
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const tone = getClassificationTone(item.classificationId, themeName);
  const accentStyle = getAccentStyle(item.startDate, colors);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);
  const normalizedItemId = React.useMemo(() => normalizeEventId(item.id), [item.id]);
  const isFavorite = React.useMemo(
    () => favoriteEvents.some((favoriteEvent) => favoriteEvent.id === normalizedItemId),
    [favoriteEvents, normalizedItemId],
  );
  const publicationIndicator = item.hasPublishedResults ? 'Resultatlista' : item.hasPublishedStarts ? 'Startlista' : null;
  const organiserLabel = item.organiserNames.join(', ');

  const handleToggleFavorite = async () => {
      await toggleFavorite({
      classificationId: item.classificationId,
      classificationLabel: item.classificationLabel,
      dateLabel: item.dateLabel,
      hasPublishedResults: item.hasPublishedResults,
      hasPublishedStarts: item.hasPublishedStarts,
        id: normalizedItemId,
      name: item.name,
      organiserLabel,
      startDate: item.startDate,
    });
  };

  return (
    <View style={[styles.card, mode === 'list' ? styles.cardList : styles.cardOverlay, isFavorite ? styles.cardFavorite : null]}>
      {accentStyle.visible ? <View style={[styles.cardAccent, { backgroundColor: accentStyle.backgroundColor }]} /> : null}

      <Pressable
        onPress={() => router.push({ params: { id: item.id, returnTo: pathname }, pathname: '/event/[id]' })}
        style={({ pressed }) => [styles.cardPressable, pressed ? styles.cardPressed : null]}
      >
        <View style={[styles.cardMain, mode === 'overlay' ? styles.cardMainOverlay : null]}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={mode === 'list' ? 1 : 3}
            style={[styles.eventName, mode === 'overlay' ? styles.eventNameOverlay : null]}
          >
            {item.name}
          </Text>
          {organiserLabel ? (
            <Text numberOfLines={1} style={[styles.organiserName, mode === 'overlay' ? styles.organiserNameOverlay : null]}>
              {organiserLabel}
            </Text>
          ) : null}
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
          onPress={() =>
            void openPublishedListModal(
              publicationIndicator === 'Resultatlista' ? 'results' : 'starts',
              'public',
              item.id,
              null,
              null,
              onOpenList,
              null,
              item.eventRaceId,
            )
          }
          style={[
            styles.publicationBadge,
            mode === 'list' ? styles.publicationIndicatorList : styles.publicationIndicatorOverlay,
            publicationIndicator === 'Resultatlista' ? styles.publicationBadgeResult : styles.publicationBadgeStart,
          ]}
        >
          <Ionicons
            color={publicationIndicator === 'Resultatlista' && isDark ? '#FFFFFF' : colors.textPrimary}
            name={publicationIndicator === 'Resultatlista' ? 'trophy-outline' : 'list-outline'}
            size={mode === 'overlay' ? 13 : 12}
          />
          <Text style={[styles.publicationBadgeText, mode === 'overlay' ? styles.publicationBadgeTextOverlay : null, publicationIndicator === 'Resultatlista' ? styles.publicationBadgeResultText : null]}>{publicationIndicator}</Text>
        </Pressable>
      ) : null}

      {entryCount && entryCount.totalEntries > 0 ? (
        <View style={[styles.entryCountBadge, mode === 'overlay' ? styles.entryCountBadgeOverlay : null]}>
          <Ionicons color={colors.textSecondary} name="people-outline" size={11} />
          <Text style={styles.entryCountText}>
            {entryCount.totalEntries}{entryCount.organisationEntries != null ? ` (${entryCount.organisationEntries})` : ''}
          </Text>
        </View>
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

function getAccentStyle(startDate: string, colors: ColorPalette) {
  const today = getLocalIsoDate();
  const isPast = startDate < today;
  const isToday = startDate === today;
  const eventDate = new Date(`${startDate}T12:00:00`);
  const dayOfWeek = eventDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isPast) {
    return {
      backgroundColor: 'transparent',
      visible: false,
    };
  }

  if (isToday) {
    return {
      backgroundColor: colors.accent,
      visible: true,
    };
  }

  if (isWeekend) {
    return {
      backgroundColor: colors.accentLineToday,
      visible: true,
    };
  }

  return {
    backgroundColor: colors.accentLineWeekday,
    visible: true,
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

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
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
    minHeight: 68,
    marginBottom: 0,
    paddingLeft: 5,
    paddingRight: 5,
  },
  cardOverlay: {
    minHeight: 78,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 10,
  },
  cardFavorite: {
    backgroundColor: isDark ? (isSoft ? '#2A2500' : '#2E2A0A') : isSoft ? '#FFF8DC' : '#FFF6CF',
    borderColor: isDark ? (isSoft ? '#5A5020' : '#5C5420') : isSoft ? '#E0C850' : '#E7D98B',
  },
  cardPressable: {
    flex: 1,
    justifyContent: 'center',
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardAccent: {
    borderBottomLeftRadius: 18,
    borderTopLeftRadius: 18,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 9,
  },
  cardMain: {
    gap: 2,
    paddingLeft: 13,
    paddingRight: 96,
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
  organiserName: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 13,
  },
  organiserNameOverlay: {
    fontSize: 12,
    lineHeight: 14,
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
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minWidth: 86,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 10,
  },
  publicationIndicatorList: {
    top: 38,
  },
  publicationIndicatorOverlay: {
    bottom: 10,
  },
  publicationBadgeStart: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#1A3520') : isSoft ? '#E0ECF8' : '#E4F4D5',
    borderColor: isDark ? (isSoft ? '#2A4878' : '#2E5A32') : isSoft ? '#6A9FD8' : '#86AD73',
    borderWidth: 1,
  },
  publicationBadgeResult: {
    backgroundColor: isDark ? (isSoft ? '#3A3000' : '#332D0A') : isSoft ? '#FFDD00' : '#F6D94B',
    borderColor: isDark ? (isSoft ? '#665A15' : '#665A15') : isSoft ? '#CCB200' : '#C9A700',
    borderWidth: 1,
  },
  publicationBadgeText: {
    color: colors.textPrimary,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  publicationBadgeResultText: {
    color: isDark ? '#FFFFFF' : undefined,
  },
  publicationBadgeTextOverlay: {
    fontSize: 11,
    lineHeight: 13,
  },
  entryCountBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    position: 'absolute',
    right: 38,
    top: 10,
  },
  entryCountBadgeOverlay: {
    right: 42,
  },
  entryCountText: {
    color: colors.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 13,
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
    right: 10,
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
}
