import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

/**
 * A compact, dashed loading card shown in place of a section while it loads, so
 * it reads clearly as "still loading" and differs from the finished cards.
 */
export function SectionLoadingPlaceholder({ icon, label }: { icon?: keyof typeof Ionicons.glyphMap; label: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      {icon ? <Ionicons color={colors.textMuted} name={icon} size={15} /> : null}
      <Text style={styles.label}>{label}</Text>
      <ActivityIndicator color={colors.primary} size="small" style={styles.spinner} />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 14,
      borderStyle: 'dashed',
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    label: {
      ...typography.captionStrong,
      color: colors.textSecondary,
    },
    spinner: {
      marginLeft: 'auto',
    },
  });
}
