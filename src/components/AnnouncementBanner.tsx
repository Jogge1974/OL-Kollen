import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { Announcement, AnnouncementSeverity } from '@/src/types/announcements';

const ICONS: Record<AnnouncementSeverity, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  warning: 'warning',
  update: 'rocket',
};

function formatAnnouncementDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A subtle, non-blocking banner used to show a single in-app announcement.
 * It animates in/out and can be dismissed with the close button, which marks
 * the announcement id as dismissed on the device.
 */
export function AnnouncementBanner({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss?: (announcementId: string) => void;
}) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isWarning = announcement.severity === 'warning';
  const tone = isWarning ? colors.accent : colors.primary;
  const onTone = isWarning ? '#20301A' : '#FFFFFF';
  const onToneMuted = isWarning ? 'rgba(32,48,26,0.78)' : 'rgba(255,255,255,0.88)';

  const formattedDate = formatAnnouncementDate(announcement.createdAt);

  const handleAction = () => {
    if (announcement.actionUrl) {
      void Linking.openURL(announcement.actionUrl);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.card, { backgroundColor: tone }]}
    >
      <View style={styles.row}>
        <Ionicons color={onTone} name={ICONS[announcement.severity]} size={20} style={styles.icon} />

        <View style={styles.body}>
          <Text style={[styles.title, { color: onTone }]}>{announcement.title}</Text>
          <Text style={[styles.message, { color: onToneMuted }]}>{announcement.body}</Text>

          {formattedDate ? <Text style={[styles.date, { color: onToneMuted }]}>{formattedDate}</Text> : null}

          {announcement.actionUrl ? (
            <Pressable onPress={handleAction} style={[styles.actionButton, { backgroundColor: onTone }]}>
              <Text style={[styles.actionText, { color: tone }]}>{announcement.actionLabel || 'Öppna'}</Text>
            </Pressable>
          ) : null}
        </View>

        {onDismiss ? (
          <Pressable accessibilityLabel="Stäng meddelande" hitSlop={8} onPress={() => onDismiss(announcement.id)} style={styles.close}>
            <Ionicons color={onTone} name="close" size={18} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 3,
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    icon: {
      marginTop: 1,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...typography.bodyStrong,
    },
    message: {
      ...typography.caption,
    },
    date: {
      ...typography.caption,
      fontSize: 11,
      marginTop: 2,
      opacity: 0.9,
    },
    actionButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      marginTop: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
    },
    actionText: {
      ...typography.captionStrong,
    },
    close: {
      padding: 2,
    },
  });
}
