import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnnouncementBanner } from '@/src/components/AnnouncementBanner';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { Announcement } from '@/src/types/announcements';

/**
 * A modal listing all currently active announcements (including ones the user
 * has dismissed from the home banner), opened from the bell icon so messages
 * can always be re-read. Read-only: the banners here have no close button.
 */
export function AnnouncementsModal({
  announcements,
  onClose,
  visible,
}: {
  announcements: Announcement[];
  onClose: () => void;
  visible: boolean;
}) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Meddelanden</Text>
            <Pressable hitSlop={8} onPress={onClose} style={styles.closeChip}>
              <Ionicons color={colors.primaryDeep} name="close" size={16} />
              <Text style={styles.closeText}>Stäng</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {announcements.length === 0 ? (
              <Text style={styles.emptyText}>Inga meddelanden just nu.</Text>
            ) : (
              announcements.map((item) => <AnnouncementBanner key={item.id} announcement={item} />)
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
    closeChip: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    closeText: {
      ...typography.captionStrong,
      color: colors.primaryDeep,
    },
    content: {
      paddingBottom: spacing.md,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      paddingVertical: spacing.lg,
      textAlign: 'center',
    },
  });
}
